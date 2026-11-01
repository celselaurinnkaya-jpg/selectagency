"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getAgencyContext } from "@/lib/auth/context";
import { allowed, forbiddenMessage } from "@/lib/auth/permissions";
import { dbMessage } from "@/lib/data/errors";
import { INVOICE_STATUS } from "@/lib/domain/labels";
import { CURRENCY_OPTIONS, formatMoney } from "@/lib/format";
import type { FormState } from "@/lib/form-state";
import { parseAmount } from "@/features/finance/payments";
import { invoiceTotals, parseTaxRate } from "./totals";

// Factures : la base vérifie le rôle, l'agence, la cohérence client/dossier et recalcule les montants
// (fonctions save_invoice, set_invoice_status, delete_invoice). Ici : lecture des saisies et messages.

const DAY = /^\d{4}-\d{2}-\d{2}$/;

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
  const isNew = !v.invoiceId;
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
  const saved = data as { id: string };
  return { ok: true, redirectTo: `/finance/invoices/${saved.id}?ok=${isNew ? "facture-creee" : "facture-modifiee"}` };
}

const statusSchema = z.object({
  invoiceId: z.uuid(),
  status: z.enum(["issued", "paid", "cancelled"]),
});

export async function setInvoiceStatusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = statusSchema.safeParse({ invoiceId: formData.get("invoiceId"), status: formData.get("status") });
  if (!parsed.success) return { message: "Action inconnue." };
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "finance.write")) return { message: forbiddenMessage(ctx, "finance.write") };
  const label = INVOICE_STATUS[parsed.data.status].label.toLowerCase();
  const { error } = await ctx.supabase.rpc("set_invoice_status", {
    p_invoice_id: parsed.data.invoiceId,
    p_status: parsed.data.status,
    p_event: `Facture {facture} : ${label}.`,
  });
  if (error) return { message: dbMessage(error) };
  refresh();
  return { ok: true, message: `Facture ${label}.` };
}

/** Comme l'enregistrement : renvoie l'adresse de la liste, que la page charge entièrement. */
export async function deleteInvoiceAction(id: string): Promise<FormState> {
  const invoiceId = z.uuid().safeParse(id);
  if (!invoiceId.success) return { message: "Facture introuvable." };
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "invoice.delete")) return { message: forbiddenMessage(ctx, "invoice.delete") };
  const { data: invoice } = await ctx.supabase
    .from("invoices")
    .select("total_minor, currency")
    .eq("id", invoiceId.data)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  if (!invoice) return { message: "Facture introuvable." };
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
