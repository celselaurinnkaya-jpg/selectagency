"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { can, FORBIDDEN_MESSAGE } from "@/lib/auth/permissions";
import { readAgency } from "@/lib/data/agency";
import { dbMessage } from "@/lib/data/errors";
import { formatMoney } from "@/lib/format";
import { formValues, type FormState } from "@/lib/form-state";
import { localDateTimeToIso } from "@/lib/period";
import { chargeProgress } from "./calculations";
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
  if (!can(ctx.member.role, "finance.write")) return { message: FORBIDDEN_MESSAGE, values };
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
  await ctx.supabase.from("activity_events").insert({
    organization_id: ctx.organizationId,
    actor_id: ctx.member.id,
    client_id: travelCase.clientId,
    case_id: travelCase.id,
    text: `Prestation ajoutée : ${parsed.data.label} (${formatMoney(amountMinor, travelCase.billingCurrency)}).`,
  });
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
  if (!can(ctx.member.role, "finance.write")) return { message: FORBIDDEN_MESSAGE, values };
  const travelCase = data.cases[0];
  if (!travelCase) return { message: "Dossier introuvable.", values };
  const currency = travelCase.billingCurrency;
  const amountMinor = parseAmount(input.amount, currency);
  if (!amountMinor) return { message: "Certains champs sont à corriger.", fieldErrors: { amount: [`Montant invalide en ${currency}.`] }, values };

  const progress = chargeProgress(data.charges, data.payments);
  const remaining = progress.reduce((sum, c) => sum + c.remainingMinor, 0);
  const allocations = allocateFifo(amountMinor, progress);
  if (!allocations) {
    return {
      message: "Certains champs sont à corriger.",
      fieldErrors: {
        amount: [
          remaining
            ? `Le montant dépasse le reste à payer (${formatMoney(remaining, currency)}). Ajoutez d'abord la prestation correspondante.`
            : "Toutes les prestations du dossier sont soldées : ajoutez d'abord la prestation correspondante.",
        ],
      },
      values,
    };
  }

  const method = PAYMENT_METHODS.find((m) => m.value === input.method)!;
  const { data: created, error } = await ctx.supabase.rpc("record_payment", {
    p_case_id: travelCase.id,
    p_amount_minor: amountMinor,
    p_method_kind: method.kind,
    p_method_label: method.label,
    p_transaction_reference: input.transactionReference ?? "",
    p_payer_name: input.payerName ?? "",
    p_paid_at: localDateTimeToIso(input.paidDate, input.paidTime || "12:00", data.agency.timezone),
    p_allocations: allocations.map((a) => ({ charge_id: a.chargeId, amount_minor: a.amountMinor })),
    p_event: `Paiement de ${formatMoney(amountMinor, currency)} enregistré (${method.label}, reçu {recu}).`,
  });
  if (error) return { message: dbMessage(error), values };
  const receipt = created as { id: string; receipt_number: string };
  refresh();
  return { ok: true, message: `Paiement enregistré : reçu ${receipt.receipt_number}.`, redirectTo: `/finance/receipts/${receipt.id}` };
}
