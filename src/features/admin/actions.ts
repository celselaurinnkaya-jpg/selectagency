"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { CONSOLE_FORBIDDEN, platformAdminForAction } from "@/lib/auth/platform";
import { dbMessage } from "@/lib/data/errors";
import { CURRENCY_OPTIONS } from "@/lib/format";
import { formValues, type FormState } from "@/lib/form-state";
import { localDateTimeToIso } from "@/lib/period";
import { parseAmount } from "@/features/finance/payments";
import { getStripe } from "@/lib/stripe/server";
import { CONSOLE_TIMEZONE } from "./display";

// Actions de la console SELECT. Chacune revérifie la session et le rôle (platformAdminForAction),
// puis la fonction platform_* de la base revérifie encore et inscrit l'action au journal.
// Les dates saisies dans la console sont lues dans le fuseau de SELECT.

const currencies = CURRENCY_OPTIONS.map((c) => c.code) as [string, ...string[]];
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide.");
const optionalDate = z.union([z.literal(""), date]).optional();
const endOfDay = (d?: string) => (d ? localDateTimeToIso(d, "23:59", CONSOLE_TIMEZONE) : null);

const planSchema = z.object({
  planId: z.union([z.literal(""), z.uuid()]).optional(),
  name: z.string().trim().min(2, "Nommez la formule.").max(60),
  description: z.string().trim().max(300).optional(),
  price: z.string().trim().min(1, "Indiquez le prix."),
  currency: z.enum(currencies, { error: "Devise non prise en charge." }),
  billingPeriod: z.enum(["monthly", "quarterly", "yearly"], { error: "Choisissez la périodicité." }),
  maxMembers: z.union([z.literal(""), z.coerce.number().int().min(1).max(1000)]).optional(),
  isActive: z.enum(["on"]).optional(),
  stripePriceId: z.union([z.literal(""), z.string().trim().regex(/^price_[A-Za-z0-9]+$/, "Identifiant Stripe invalide (il commence par « price_ »).")]).optional(),
});

const STRIPE_INTERVAL = { monthly: ["month", 1], quarterly: ["month", 3], yearly: ["year", 1] } as const;

/**
 * Vérifie auprès de Stripe que le tarif correspond exactement à la formule (prix, devise, périodicité, récurrent,
 * actif). Renvoie l'identifiant du produit, ou un message d'erreur.
 */
async function checkStripePrice(
  priceId: string,
  plan: { priceMinor: number; currency: string; billingPeriod: keyof typeof STRIPE_INTERVAL },
): Promise<{ productId: string } | { error: string }> {
  const stripe = getStripe();
  if (!stripe) return { error: "Stripe n'est pas configuré sur ce serveur : impossible de vérifier le tarif." };
  let price;
  try {
    price = await stripe.prices.retrieve(priceId);
  } catch {
    return { error: "Tarif introuvable dans Stripe (vérifiez l'identifiant et le mode test ou réel)." };
  }
  const [interval, count] = STRIPE_INTERVAL[plan.billingPeriod];
  if (!price.active) return { error: "Ce tarif est archivé dans Stripe." };
  if (!price.recurring || price.recurring.interval !== interval || price.recurring.interval_count !== count) {
    return { error: "Ce tarif Stripe n'a pas la même périodicité que la formule." };
  }
  if (price.currency.toUpperCase() !== plan.currency || price.unit_amount !== plan.priceMinor) {
    return { error: "Ce tarif Stripe n'a pas le même prix ou la même devise que la formule." };
  }
  return { productId: typeof price.product === "string" ? price.product : price.product.id };
}

export async function savePlanAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = planSchema.safeParse(values);
  if (!parsed.success) return { message: "Certains champs sont à corriger.", fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  const user = await platformAdminForAction();
  if (!user) return { message: CONSOLE_FORBIDDEN, values };
  const input = parsed.data;
  const priceMinor = input.price.trim() === "0" ? 0 : parseAmount(input.price, input.currency);
  if (priceMinor === null) return { message: "Certains champs sont à corriger.", fieldErrors: { price: [`Prix invalide en ${input.currency}.`] }, values };

  const stripePriceId = input.stripePriceId || "";
  const stripe = stripePriceId ? await checkStripePrice(stripePriceId, { priceMinor, currency: input.currency, billingPeriod: input.billingPeriod }) : null;
  if (stripe && "error" in stripe) return { message: "Certains champs sont à corriger.", fieldErrors: { stripePriceId: [stripe.error] }, values };

  const { data: planId, error } = await user.supabase.rpc("platform_save_plan", {
    p_id: input.planId || null,
    p_name: input.name,
    p_description: input.description ?? "",
    p_price_minor: priceMinor,
    p_currency: input.currency,
    p_billing_period: input.billingPeriod,
    p_max_members: input.maxMembers === "" || input.maxMembers === undefined ? null : input.maxMembers,
    p_is_active: input.isActive === "on",
  });
  if (error) return { message: dbMessage(error), values };
  const { error: stripeError } = await user.supabase.rpc("platform_set_plan_stripe", {
    p_plan_id: (planId as string | null) ?? input.planId,
    p_stripe_price_id: stripePriceId,
    p_stripe_product_id: stripe && "productId" in stripe ? stripe.productId : null,
  });
  refresh();
  if (stripeError) return { message: `Formule enregistrée, mais pas son tarif Stripe : ${dbMessage(stripeError)}`, values };
  return { ok: true, message: input.planId ? "Formule mise à jour." : "Formule créée." };
}

const subscriptionSchema = z.object({
  organizationId: z.uuid(),
  planId: z.union([z.literal(""), z.uuid()]).optional(),
  status: z.enum(["trialing", "active", "past_due", "suspended", "cancelled"], { error: "Choisissez le statut." }),
  trialEndsAt: optionalDate,
  currentPeriodEnd: optionalDate,
  reason: z.string().trim().min(3, "Indiquez le motif : il est conservé dans le journal.").max(300),
});

export async function updateSubscriptionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = subscriptionSchema.safeParse(values);
  if (!parsed.success) return { message: "Certains champs sont à corriger.", fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  const user = await platformAdminForAction();
  if (!user) return { message: CONSOLE_FORBIDDEN, values };
  const input = parsed.data;
  if (input.status === "trialing" && !input.trialEndsAt) {
    return { message: "Certains champs sont à corriger.", fieldErrors: { trialEndsAt: ["Indiquez la fin de l'essai."] }, values };
  }

  const { error } = await user.supabase.rpc("platform_update_subscription", {
    p_org: input.organizationId,
    p_plan_id: input.planId || null,
    p_status: input.status,
    p_trial_ends_at: endOfDay(input.trialEndsAt || undefined),
    p_current_period_end: endOfDay(input.currentPeriodEnd || undefined),
    p_reason: input.reason,
  });
  if (error) return { message: dbMessage(error), values };
  refresh();
  return { ok: true, message: "Abonnement mis à jour et inscrit au journal." };
}

const paymentSchema = z.object({
  organizationId: z.uuid(),
  planId: z.union([z.literal(""), z.uuid()]).optional(),
  amount: z.string().trim().min(1, "Indiquez le montant reçu."),
  currency: z.enum(currencies, { error: "Devise non prise en charge." }),
  methodKind: z.enum(["cash", "bank_transfer", "mobile_money", "other"], { error: "Choisissez le moyen de paiement." }),
  reference: z.string().trim().max(80).optional(),
  paidDate: date,
  periodEnd: optionalDate,
});

export async function recordSubscriptionPaymentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = paymentSchema.safeParse(values);
  if (!parsed.success) return { message: "Certains champs sont à corriger.", fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  const user = await platformAdminForAction();
  if (!user) return { message: CONSOLE_FORBIDDEN, values };
  const input = parsed.data;
  const amountMinor = parseAmount(input.amount, input.currency);
  if (!amountMinor) return { message: "Certains champs sont à corriger.", fieldErrors: { amount: [`Montant invalide en ${input.currency}.`] }, values };

  const { error } = await user.supabase.rpc("platform_record_subscription_payment", {
    p_org: input.organizationId,
    p_plan_id: input.planId || null,
    p_amount_minor: amountMinor,
    p_currency: input.currency,
    p_method_kind: input.methodKind,
    p_reference: input.reference ?? "",
    p_paid_at: localDateTimeToIso(input.paidDate, "12:00", CONSOLE_TIMEZONE),
    p_period_end: endOfDay(input.periodEnd || undefined),
  });
  if (error) return { message: dbMessage(error), values };
  refresh();
  return {
    ok: true,
    message: input.periodEnd ? "Paiement enregistré : l'abonnement est actif jusqu'à la nouvelle échéance." : "Paiement enregistré (l'échéance n'a pas changé).",
  };
}

const voidSchema = z.object({
  paymentId: z.uuid(),
  reason: z.string().trim().min(3, "Indiquez le motif de l'annulation.").max(300),
});

export async function voidSubscriptionPaymentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = voidSchema.safeParse(values);
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Certains champs sont à corriger.", values };
  const user = await platformAdminForAction();
  if (!user) return { message: CONSOLE_FORBIDDEN, values };
  const { error } = await user.supabase.rpc("platform_void_subscription_payment", { p_payment_id: parsed.data.paymentId, p_reason: parsed.data.reason });
  if (error) return { message: dbMessage(error), values };
  refresh();
  return { ok: true, message: "Paiement annulé. Vérifiez l'échéance de l'abonnement si besoin." };
}

const replySchema = z.object({
  ticketId: z.uuid(),
  body: z.string().trim().min(1, "Écrivez la réponse.").max(4000, "4 000 caractères au plus."),
  status: z.enum(["answered", "resolved"]),
});

export async function replyTicketAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = replySchema.safeParse(values);
  if (!parsed.success) return { message: "Certains champs sont à corriger.", fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  const user = await platformAdminForAction();
  if (!user) return { message: CONSOLE_FORBIDDEN, values };
  const { error } = await user.supabase.rpc("platform_reply_ticket", { p_ticket_id: parsed.data.ticketId, p_body: parsed.data.body, p_status: parsed.data.status });
  if (error) return { message: dbMessage(error), values };
  refresh();
  return { ok: true, message: "Réponse publiée : l'agence la voit dans sa demande." };
}

export async function setTicketStatusAction(formData: FormData): Promise<void> {
  const parsed = z.object({ ticketId: z.uuid(), status: z.enum(["open", "answered", "resolved"]) }).safeParse(formValues(formData));
  if (!parsed.success) return;
  const user = await platformAdminForAction();
  if (!user) return;
  await user.supabase.rpc("platform_set_ticket_status", { p_ticket_id: parsed.data.ticketId, p_status: parsed.data.status });
  refresh();
}
