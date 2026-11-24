"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getAgencyContext } from "@/lib/auth/context";
import { allowed, forbiddenMessage } from "@/lib/auth/permissions";
import { dbMessage } from "@/lib/data/errors";
import { sendQueuedEmailsAfterResponse } from "@/lib/email/dispatcher";
import { INVOICE_STATUS } from "@/lib/domain/labels";
import { CURRENCY_OPTIONS, dayKey, formatMoney } from "@/lib/format";
import type { FormState } from "@/lib/form-state";
import { parseAmount } from "@/features/finance/payments";
import { invoiceTotals, parseTaxRate } from "./totals";

// Factures : la base vérifie le rôle, l'agence, la cohérence client/dossier et recalcule les montants
// (fonctions save_invoice, set_invoice_status, delete_invoice). Ici : lecture des saisies et messages.

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Rapport de test v3, point 21 : une facture émise pour un dossier qui n'a encore aucune prestation entre d'elle-même
 * dans son reste à payer (frais de l'agence, le choix par défaut du bouton). Si le dossier a déjà des prestations, la
 * personne décide sur la page de la facture : la facture peut les reprendre, et le client paierait deux fois.
 * Devises différentes ou facture déjà ajoutée : la base refuse l'ajout, et la page de la facture l'explique.
 */
async function addIssuedInvoiceToEmptyCase(ctx: Awaited<ReturnType<typeof getAgencyContext>>, invoiceId: string): Promise<boolean> {
  const { data: invoice } = await ctx.supabase
    .from("invoices")
    .select("case_id, status")
    .eq("id", invoiceId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  if (!invoice?.case_id || invoice.status !== "issued") return false;
  const { count, error } = await ctx.supabase
    .from("charges")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", ctx.organizationId)
    .eq("case_id", String(invoice.case_id));
  if (error || count !== 0) return false;
  const { error: chargeError } = await ctx.supabase.rpc("add_invoice_to_charges", { p_invoice_id: invoiceId, p_charge_type: "agency_fee" });
  return !chargeError;
}

const invoiceSchema = z.object({
  invoiceId: z.union([z.literal(""), z.uuid()]),
  clientId: z.uuid({ error: "Choisissez le client facturé." }),
  caseId: z.union([z.literal(""), z.uuid()]),
  currency: z.enum(CURRENCY_OPTIONS.map((c) => c.code) as [string, ...string[]], { error: "Devise non prise en charge." }),
  issueDate: z.string().regex(DAY, "Indiquez la date d'émission."),
  dueDate: z.string().regex(DAY, "Indiquez la date d'échéance."),
  discountEnabled: z.boolean(),
  discountLabel: z.string().trim().max(80, "Libellé de remise trop long (80 caractères au plus)."),
  discountAmount: z.string().trim(),
  paymentDetails: z.string().trim().max(500, "Mode de paiement trop long (500 caractères au plus)."),
  notes: z.string().trim().max(1000, "Remarque trop longue (1 000 caractères au plus)."),
  intent: z.enum(["draft", "issue", "save"]),
  items: z
    .array(z.object({ label: z.string(), quantity: z.string(), unitAmount: z.string(), taxRate: z.string() }))
    .min(1, "Ajoutez au moins une ligne à la facture.")
    .max(50, "Une facture compte au plus 50 lignes."),
});

export type InvoiceInput = z.input<typeof invoiceSchema>;

// Pas de redirect() ici : la page de la facture est souvent déjà en mémoire (visitée avant
// « Modifier »), et une navigation interne vers elle restait bloquée sur le squelette de
// chargement. L'action renvoie l'adresse ; le formulaire la charge entièrement.
export async function saveInvoiceAction(input: InvoiceInput): Promise<FormState> {
  const parsed = invoiceSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
    return { message: Object.values(fieldErrors).flat()[0] ?? "Certains champs sont à corriger.", fieldErrors };
  }
  const v = parsed.data;
  if (v.dueDate < v.issueDate) return { message: "La date d'échéance ne peut pas précéder la date d'émission.", fieldErrors: { dueDate: ["Après la date d'émission."] } };
  // Une facture émise appartient à un dossier : c'est lui qui encaisse, délivre les reçus et tient le reste à payer.
  if (v.intent === "issue" && !v.caseId) {
    return {
      message: "Pour émettre une facture, choisissez le dossier du client : c'est le dossier qui encaisse et délivre les reçus.",
      fieldErrors: { caseId: ["Choisissez le dossier."] },
    };
  }

  const items = [];
  for (const [index, item] of v.items.entries()) {
    const name = `Ligne ${index + 1}`;
    const label = item.label.trim();
    if (label.length < 2 || label.length > 160) return { message: `${name} : décrivez la prestation (de 2 à 160 caractères).` };
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) return { message: `${name} : la quantité doit être un nombre entier entre 1 et 9 999.` };
    const unit = parseAmount(item.unitAmount, v.currency);
    if (!unit) return { message: `${name} : prix unitaire invalide en ${v.currency}.` };
    const taxRate = parseTaxRate(item.taxRate);
    if (taxRate === null) return { message: `${name} : taxe invalide (un pourcentage entre 0 et 100, ex. 19,25).` };
    items.push({ label, quantity, unit_amount_minor: unit, tax_rate: taxRate });
  }
  let discount = 0;
  if (v.discountEnabled && v.discountAmount) {
    const parsedDiscount = parseAmount(v.discountAmount, v.currency);
    if (!parsedDiscount) return { message: `Remise invalide en ${v.currency}.`, fieldErrors: { discountAmount: ["Montant invalide."] } };
    discount = parsedDiscount;
  }
  const totals = invoiceTotals(items.map((i) => ({ quantity: i.quantity, unitAmountMinor: i.unit_amount_minor, taxRate: i.tax_rate })), discount);
  if (totals.totalMinor < 0) return { message: "La remise ne peut pas dépasser le total de la facture.", fieldErrors: { discountAmount: ["Supérieure au total."] } };

  const ctx = await getAgencyContext();
  if (!allowed(ctx, "finance.write")) return { message: forbiddenMessage(ctx, "finance.write") };
  // Une facture ne s'émet pas à l'avance : sa date d'émission est celle du jour, ou une date passée.
  if (v.issueDate > dayKey(new Date(), ctx.agency.timezone)) {
    return { message: "La date d'émission ne peut pas être dans le futur.", fieldErrors: { issueDate: ["Aujourd'hui ou une date passée."] } };
  }
  const isNew = !v.invoiceId;
  if (!isNew) {
    const { data: existing } = await ctx.supabase
      .from("invoices")
      .select("status")
      .eq("id", v.invoiceId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (!existing) return { message: "Facture introuvable." };
    if (existing.status !== "draft") {
      return { message: "Une facture déjà émise ne peut plus être modifiée. Seule son annulation reste possible." };
    }
  }
  const amount = formatMoney(totals.totalMinor, v.currency);
  const event = isNew
    ? v.intent === "issue"
      ? `Facture {facture} émise (${amount}).`
      : `Facture {facture} préparée en brouillon (${amount}).`
    : v.intent === "issue"
      ? `Facture {facture} modifiée et émise (${amount}).`
      : `Facture {facture} modifiée (${amount}).`;

  const { data, error } = await ctx.supabase.rpc("save_invoice", {
    p_invoice_id: v.invoiceId || null,
    p_client_id: v.clientId,
    p_case_id: v.caseId || null,
    p_currency: v.currency,
    p_issue_date: v.issueDate,
    p_due_date: v.dueDate,
    p_discount_label: v.discountEnabled ? v.discountLabel : "",
    p_discount_minor: discount,
    p_payment_details: v.paymentDetails,
    p_notes: v.notes,
    p_issue: v.intent === "issue",
    p_items: items,
    p_event: event,
  });
  if (error) return { message: dbMessage(error) };
  // Alerte au propriétaire inscrite par la base (si l'action vient d'un autre membre) : elle part tout de suite.
  sendQueuedEmailsAfterResponse(ctx);
  const saved = data as { id: string };
  const addedToCase = v.intent === "issue" && Boolean(v.caseId) && (await addIssuedInvoiceToEmptyCase(ctx, saved.id));
  return {
    ok: true,
    redirectTo: `/finance/invoices/${saved.id}?ok=${isNew ? "facture-creee" : "facture-modifiee"}${addedToCase ? "&solde=ajoute" : ""}`,
  };
}

/**
 * Ajoute le montant d'une facture émise au reste à payer de son dossier (une prestation liée à la facture).
 * À ne pas faire quand la facture reprend des prestations déjà convenues : la personne décide.
 */
export async function addInvoiceToChargesAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ invoiceId: z.uuid(), chargeType: z.enum(["agency_fee", "third_party"], { error: "Précisez la nature du montant." }) })
    .safeParse({ invoiceId: formData.get("invoiceId"), chargeType: formData.get("chargeType") });
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Facture introuvable." };
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "finance.write")) return { message: forbiddenMessage(ctx, "finance.write") };
  const { error } = await ctx.supabase.rpc("add_invoice_to_charges", { p_invoice_id: parsed.data.invoiceId, p_charge_type: parsed.data.chargeType });
  if (error) return { message: dbMessage(error) };
  refresh();
  return { ok: true, message: "Montant ajouté au reste à payer du dossier : les paiements du dossier peuvent maintenant le régler." };
}

/** Facture payée : la propriétaire désigne le ou les paiements confirmés (avec reçu) qui la règlent. */
export async function markInvoicePaidAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const invoiceId = z.uuid().safeParse(formData.get("invoiceId"));
  if (!invoiceId.success) return { message: "Facture introuvable." };
  const paymentIds = formData.getAll("paymentId").map(String).filter((id) => z.uuid().safeParse(id).success);
  if (paymentIds.length === 0) return { message: "Choisissez le ou les paiements confirmés qui règlent cette facture." };
  const ctx = await getAgencyContext();
  if (ctx.member.role !== "owner") return { message: "Seul le propriétaire de l'agence marque une facture payée." };
  const { error } = await ctx.supabase.rpc("mark_invoice_paid", {
    p_invoice_id: invoiceId.data,
    p_payment_ids: paymentIds,
    p_event: "Facture {facture} payée (reçus {recus}).",
  });
  if (error) return { message: dbMessage(error) };
  refresh();
  return { ok: true, message: "Facture marquée payée, avec les reçus qui la règlent." };
}

const statusSchema = z.object({
  invoiceId: z.uuid(),
  // « Payée » passe par markInvoicePaidAction, avec les paiements qui règlent la facture.
  status: z.enum(["issued", "cancelled"]),
  reason: z.string().trim().max(300, "Motif trop long (300 caractères au plus).").optional(),
});

export async function setInvoiceStatusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = statusSchema.safeParse({
    invoiceId: formData.get("invoiceId"),
    status: formData.get("status"),
    reason: formData.get("reason") ?? undefined,
  });
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Action inconnue." };
  // Annuler une facture émise laisse une trace : le motif est écrit dans l'historique du client.
  const reason = parsed.data.reason ?? "";
  if (parsed.data.status === "cancelled" && reason.length < 5) {
    return { message: "Indiquez le motif de l'annulation (5 caractères au moins).", fieldErrors: { reason: ["Motif obligatoire."] } };
  }
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "finance.write")) return { message: forbiddenMessage(ctx, "finance.write") };
  const label = INVOICE_STATUS[parsed.data.status].label.toLowerCase();
  const { error } = await ctx.supabase.rpc("set_invoice_status", {
    p_invoice_id: parsed.data.invoiceId,
    p_status: parsed.data.status,
    p_event: parsed.data.status === "cancelled" ? `Facture {facture} : ${label}. Motif : ${reason}` : `Facture {facture} : ${label}.`,
  });
  if (error) return { message: dbMessage(error) };
  // Alerte au propriétaire inscrite par la base (si l'action vient d'un autre membre) : elle part tout de suite.
  sendQueuedEmailsAfterResponse(ctx);
  const addedToCase = parsed.data.status === "issued" && (await addIssuedInvoiceToEmptyCase(ctx, parsed.data.invoiceId));
  refresh();
  return {
    ok: true,
    message: addedToCase
      ? `Facture ${label}. Le dossier n'avait encore aucune prestation : son montant a été ajouté à son reste à payer, comme frais de l'agence.`
      : `Facture ${label}.`,
  };
}

/**
 * Corriger une facture émise (demande de l'utilisateur du 24/11/2026) : la base annule la facture avec le motif,
 * retire son montant du reste à payer du dossier s'il n'est pas encore réglé, et crée un brouillon avec les mêmes
 * lignes. Renvoie l'adresse de ce brouillon, ouvert pour modification (chargement complet de la page).
 */
export async function correctInvoiceAction(invoiceId: string, reason: string): Promise<FormState> {
  const parsed = z
    .object({
      invoiceId: z.uuid(),
      reason: z.string().trim().min(5, "Indiquez le motif de la correction (5 caractères au moins).").max(300, "Motif trop long (300 caractères au plus)."),
    })
    .safeParse({ invoiceId, reason });
  if (!parsed.success) {
    const fieldErrors = z.flattenError(parsed.error).fieldErrors;
    return { message: Object.values(fieldErrors).flat()[0] ?? "Facture introuvable.", fieldErrors };
  }
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "finance.write")) return { message: forbiddenMessage(ctx, "finance.write") };
  const { data, error } = await ctx.supabase.rpc("correct_invoice", { p_invoice_id: parsed.data.invoiceId, p_reason: parsed.data.reason });
  if (error) return { message: dbMessage(error) };
  // Alerte au propriétaire inscrite par la base pour l'annulation (si l'action vient d'un autre membre).
  sendQueuedEmailsAfterResponse(ctx);
  const created = data as { id: string };
  return { ok: true, redirectTo: `/finance/invoices/${created.id}/edit` };
}

/** Comme l'enregistrement : renvoie l'adresse de la liste, que la page charge entièrement. */
export async function deleteInvoiceAction(id: string): Promise<FormState> {
  const invoiceId = z.uuid().safeParse(id);
  if (!invoiceId.success) return { message: "Facture introuvable." };
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "invoice.delete")) return { message: forbiddenMessage(ctx, "invoice.delete") };
  const { data: invoice } = await ctx.supabase
    .from("invoices")
    .select("status, total_minor, currency")
    .eq("id", invoiceId.data)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  if (!invoice) return { message: "Facture introuvable." };
  if (invoice.status !== "draft") {
    return { message: "Seule une facture en brouillon peut être supprimée. Une facture émise doit être annulée." };
  }
  const { error } = await ctx.supabase.rpc("delete_invoice", {
    p_invoice_id: invoiceId.data,
    p_event: `Facture {facture} supprimée (${formatMoney(Number(invoice.total_minor), String(invoice.currency))}).`,
  });
  if (error) return { message: dbMessage(error) };
  return { ok: true, redirectTo: "/finance/invoices?ok=facture-supprimee" };
}

/**
 * Note dans l'historique des communications qu'une facture a été préparée pour WhatsApp. L'envoi
 * reste fait par la personne depuis WhatsApp : le journal dit « préparé », jamais « envoyé ».
 */
export async function logInvoiceSharedAction(invoiceId: string): Promise<void> {
  if (!z.uuid().safeParse(invoiceId).success) return;
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "operations.write")) return;
  const { data: invoice } = await ctx.supabase
    .from("invoices")
    .select("number, client_id, case_id")
    .eq("id", invoiceId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  if (!invoice) return;
  await ctx.supabase.from("communication_logs").insert({
    organization_id: ctx.organizationId,
    client_id: invoice.client_id,
    case_id: invoice.case_id,
    channel: "whatsapp",
    status: "prepared_manual",
    summary: `Facture ${invoice.number} (PDF)`,
    actor_id: ctx.member.id,
  });
  refresh();
}
