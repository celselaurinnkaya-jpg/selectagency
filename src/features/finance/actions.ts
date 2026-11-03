"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { allowed, forbiddenMessage } from "@/lib/auth/permissions";
import { readAgency } from "@/lib/data/agency";
import { sendQueuedEmailsAfterResponse } from "@/lib/email/dispatcher";
import { dbMessage } from "@/lib/data/errors";
import { formatMoney } from "@/lib/format";
import { formValues, type FormState } from "@/lib/form-state";
import { localDateTimeToIso } from "@/lib/period";
import { availableToPay, chargeProgress } from "./calculations";
import { allocateFifo, parseAmount, PAYMENT_METHODS } from "./payments";

// Prestations convenues et encaissements d'un dossier. Montants en unités mineures, devise du dossier.

const chargeSchema = z.object({
  caseId: z.uuid(),
  label: z.string().trim().min(2, "Décrivez la prestation.").max(160),
  chargeType: z.enum(["agency_fee", "third_party"], { error: "Précisez à qui revient ce montant." }),
  amount: z.string().trim().min(1, "Indiquez le montant."),
});

export async function addChargeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = chargeSchema.safeParse(values);
  if (!parsed.success) return { message: "Certains champs sont à corriger.", fieldErrors: z.flattenError(parsed.error).fieldErrors, values };

  const { data, ctx } = await readAgency({ cases: (q) => q.eq("id", parsed.data.caseId) });
  if (!allowed(ctx, "finance.write")) return { message: forbiddenMessage(ctx, "finance.write"), values };
  const travelCase = data.cases[0];
  if (!travelCase || travelCase.status === "cancelled") return { message: "Ce dossier n'accepte pas de nouvelle prestation.", values };
  const amountMinor = parseAmount(parsed.data.amount, travelCase.billingCurrency);
  if (!amountMinor) return { message: "Certains champs sont à corriger.", fieldErrors: { amount: [`Montant invalide en ${travelCase.billingCurrency}.`] }, values };

  const { error } = await ctx.supabase.from("charges").insert({
    organization_id: ctx.organizationId,
    case_id: travelCase.id,
    label: parsed.data.label,
    charge_type: parsed.data.chargeType,
    amount_minor: amountMinor,
    currency: travelCase.billingCurrency,
  });
  if (error) return { message: dbMessage(error), values };
  // L'historique (« Prestation ajoutée : … ») est écrit par la base.
  refresh();
  return { ok: true, message: "Prestation ajoutée." };
}

const paymentSchema = z.object({
  caseId: z.uuid(),
  amount: z.string().trim().min(1, "Indiquez le montant reçu."),
  method: z.enum(PAYMENT_METHODS.map((m) => m.value) as [string, ...string[]], { error: "Choisissez le moyen de paiement." }),
  transactionReference: z.string().trim().max(80).optional(),
  payerName: z.string().trim().max(120).optional(),
  paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Indiquez la date du paiement."),
  paidTime: z.union([z.literal(""), z.string().regex(/^\d{2}:\d{2}$/)]).optional(),
  // « pending » : annoncé (virement, Mobile Money) mais pas encore vu sur le compte de l'agence.
  status: z.enum(["recorded", "pending"], { error: "Précisez si l'argent a bien été reçu." }),
});

export async function recordPaymentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = paymentSchema.safeParse(values);
  if (!parsed.success) return { message: "Certains champs sont à corriger.", fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  const input = parsed.data;

  const { data, ctx } = await readAgency({
    cases: (q) => q.eq("id", input.caseId),
    charges: (q) => q.eq("case_id", input.caseId),
    payments: (q) => q.eq("case_id", input.caseId),
  });
  if (!allowed(ctx, "finance.write")) return { message: forbiddenMessage(ctx, "finance.write"), values };
  const travelCase = data.cases[0];
  if (!travelCase) return { message: "Dossier introuvable.", values };
  const currency = travelCase.billingCurrency;
  const amountMinor = parseAmount(input.amount, currency);
  if (!amountMinor) return { message: "Certains champs sont à corriger.", fieldErrors: { amount: [`Montant invalide en ${currency}.`] }, values };

  // Les paiements à vérifier réservent leur part, comme dans la base (record_payment).
  const progress = availableToPay(chargeProgress(data.charges, data.payments));
  const remaining = progress.reduce((sum, c) => sum + c.remainingMinor, 0);
  const waiting = data.payments.some((p) => p.status === "pending");
  const allocations = allocateFifo(amountMinor, progress);
  if (!allocations) {
    return {
      message: "Certains champs sont à corriger.",
      fieldErrors: {
        amount: [
          remaining
            ? `Le montant dépasse le reste à payer (${formatMoney(remaining, currency)}${waiting ? ", paiements à vérifier déduits" : ""}). Ajoutez d'abord la prestation correspondante.`
            : waiting
              ? "Le reste à payer est déjà couvert par des paiements à vérifier : confirmez-les ou annulez-les d'abord."
              : "Toutes les prestations du dossier sont soldées : ajoutez d'abord la prestation correspondante.",
        ],
      },
      values,
    };
  }

  const method = PAYMENT_METHODS.find((m) => m.value === input.method)!;
  const pending = input.status === "pending";
  const amount = formatMoney(amountMinor, currency);
  const reference = input.transactionReference ? `, réf. ${input.transactionReference}` : "";
  const { data: created, error } = await ctx.supabase.rpc("record_payment", {
    p_case_id: travelCase.id,
    p_amount_minor: amountMinor,
    p_method_kind: method.kind,
    p_method_label: method.label,
    p_transaction_reference: input.transactionReference ?? "",
    p_payer_name: input.payerName ?? "",
    p_paid_at: localDateTimeToIso(input.paidDate, input.paidTime || "12:00", data.agency.timezone),
    p_allocations: allocations.map((a) => ({ charge_id: a.chargeId, amount_minor: a.amountMinor })),
    p_event: pending
      ? `Paiement de ${amount} annoncé (${method.label}${reference}) : à vérifier avant de délivrer le reçu.`
      : `Paiement de ${amount} enregistré (${method.label}, reçu {recu}).`,
    p_pending: pending,
  });
  if (error) return { message: dbMessage(error), values };
  const receipt = created as { id: string; receipt_number: string | null };
  refresh();
  // Paiement reçu : si l'agence l'a activé, le client reçoit la confirmation avec son reçu PDF.
  if (!pending) sendQueuedEmailsAfterResponse(ctx);
  if (pending) {
    return {
      ok: true,
      message: `Paiement de ${amount} noté « à vérifier ». Il ne compte pas encore dans les soldes : confirmez-le quand l'argent est arrivé, le reçu sera créé à ce moment.`,
    };
  }
  return { ok: true, message: `Paiement enregistré : reçu ${receipt.receipt_number}.`, redirectTo: `/finance/receipts/${receipt.id}` };
}

/** Paiement à vérifier arrivé sur le compte : il compte dans les soldes et reçoit son numéro de reçu. */
export async function confirmPaymentAction(paymentId: string): Promise<FormState> {
  const id = z.uuid().safeParse(paymentId);
  if (!id.success) return { message: "Paiement introuvable." };
  const { data, ctx } = await readAgency({ payments: (q) => q.eq("id", id.data) });
  if (!allowed(ctx, "finance.write")) return { message: forbiddenMessage(ctx, "finance.write") };
  const payment = data.payments[0];
  if (!payment) return { message: "Paiement introuvable." };
  if (payment.status !== "pending") return { message: "Ce paiement n'est plus en attente de vérification." };

  const reference = payment.transactionReference ? `, réf. ${payment.transactionReference}` : "";
  const { data: confirmed, error } = await ctx.supabase.rpc("confirm_payment", {
    p_payment_id: payment.id,
    p_event: `Paiement de ${formatMoney(payment.amountMinor, payment.currency)} vérifié (${payment.methodLabel}${reference}) : reçu {recu}.`,
  });
  if (error) return { message: dbMessage(error) };
  refresh();
  // Paiement vérifié : si l'agence l'a activé, le client reçoit la confirmation avec son reçu PDF.
  sendQueuedEmailsAfterResponse(ctx);
  const receipt = confirmed as { receipt_number: string };
  return { ok: true, message: `Réception confirmée : reçu ${receipt.receipt_number} créé.`, redirectTo: `/finance/receipts/${payment.id}` };
}

// Annulation : le reçu garde son numéro et reste consultable, marqué « annulé » avec son motif.
const voidSchema = z.object({
  paymentId: z.uuid(),
  reason: z.string().trim().min(3, "Indiquez le motif de l'annulation.").max(300),
});

export async function voidPaymentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = voidSchema.safeParse(values);
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Certains champs sont à corriger.", values };
  const { data, ctx } = await readAgency({ payments: (q) => q.eq("id", parsed.data.paymentId) });
  const payment = data.payments[0];
  // Un paiement encore à vérifier n'a pas de reçu : un conseiller peut l'annuler (comme la base).
  const permission = payment?.status === "pending" ? "finance.write" : "payment.void";
  if (!allowed(ctx, permission)) return { message: forbiddenMessage(ctx, permission), values };
  if (!payment) return { message: "Paiement introuvable.", values };

  const amount = formatMoney(payment.amountMinor, payment.currency);
  const { error } = await ctx.supabase.rpc("void_payment", {
    p_payment_id: payment.id,
    p_reason: parsed.data.reason,
    p_event: payment.receiptNumber
      ? `Paiement de ${amount} annulé (reçu ${payment.receiptNumber}) : ${parsed.data.reason}`
      : `Paiement annoncé de ${amount} annulé (${payment.methodLabel}, sans reçu) : ${parsed.data.reason}`,
  });
  if (error) return { message: dbMessage(error), values };
  refresh();
  return payment.receiptNumber
    ? { ok: true, message: `Reçu ${payment.receiptNumber} annulé. Le montant ne compte plus dans les soldes.` }
    : { ok: true, message: `Paiement annoncé de ${amount} annulé. Sa part du reste à payer est de nouveau disponible.` };
}

// Dépenses : fonctionnement de l'agence, ou somme reversée à un tiers pour le compte d'un client.
const expenseSchema = z.object({
  label: z.string().trim().min(2, "Décrivez la dépense.").max(160),
  expenseType: z.enum(["operating", "client_disbursement"], { error: "Précisez la nature de la dépense." }),
  supplier: z.string().trim().max(120).optional(),
  amount: z.string().trim().min(1, "Indiquez le montant."),
  currency: z.string().regex(/^[A-Z]{3}$/, "Devise invalide."),
  paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Indiquez la date."),
  caseId: z.string().optional(),
});

export async function createExpenseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = expenseSchema.safeParse(values);
  if (!parsed.success) return { message: "Certains champs sont à corriger.", fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  const input = parsed.data;
  if (input.expenseType === "client_disbursement" && !input.caseId) {
    return { message: "Certains champs sont à corriger.", fieldErrors: { caseId: ["Choisissez le dossier du client concerné."] }, values };
  }
  const { data, ctx } = await readAgency(input.caseId ? { cases: (q) => q.eq("id", input.caseId!) } : {});
  if (!allowed(ctx, "finance.write")) return { message: forbiddenMessage(ctx, "finance.write"), values };
  const travelCase = data.cases[0];
  if (input.caseId && !travelCase) return { message: "Dossier introuvable.", values };
  const amountMinor = parseAmount(input.amount, input.currency);
  if (!amountMinor) return { message: "Certains champs sont à corriger.", fieldErrors: { amount: [`Montant invalide en ${input.currency}.`] }, values };

  const { error } = await ctx.supabase.from("expenses").insert({
    organization_id: ctx.organizationId,
    case_id: travelCase?.id ?? null,
    expense_type: input.expenseType,
    label: input.label,
    supplier: input.supplier || null,
    amount_minor: amountMinor,
    currency: input.currency,
    paid_at: localDateTimeToIso(input.paidDate, "12:00", data.agency.timezone),
    // Remplacé par la base par la personne connectée (trigger) : jamais une valeur du navigateur.
    recorded_by: ctx.member.id,
  });
  if (error) return { message: dbMessage(error), values };
  refresh();
  return { ok: true, message: `Dépense enregistrée : ${formatMoney(amountMinor, input.currency)}.` };
}
