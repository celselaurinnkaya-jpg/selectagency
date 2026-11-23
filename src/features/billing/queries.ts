import "server-only";
import { allowed } from "@/lib/auth/permissions";
import { PLAN, SUBSCRIPTION_PAYMENT, toPlan } from "@/lib/data/rows";
import { activeMembers } from "@/lib/domain/members";
import { readAgency } from "@/lib/data/agency";
import type { PaymentMethodKind } from "@/lib/domain/types";

// Abonnement de l'agence à SELECT Agency, vu par l'agence : lecture seule (c'est SELECT qui
// enregistre les paiements et modifie l'abonnement, depuis sa console).

export interface SubscriptionPaymentRow {
  id: string;
  planId?: string;
  amountMinor: number;
  currency: string;
  methodKind: PaymentMethodKind;
  transactionReference?: string;
  paidAt: string;
  periodEnd?: string;
  status: "recorded" | "voided";
}

const toPaymentRow = (r: Record<string, unknown>): SubscriptionPaymentRow => ({
  id: String(r.id),
  planId: r.plan_id ? String(r.plan_id) : undefined,
  amountMinor: Number(r.amount_minor),
  currency: String(r.currency),
  methodKind: r.method_kind as PaymentMethodKind,
  transactionReference: r.transaction_reference ? String(r.transaction_reference) : undefined,
  paidAt: new Date(String(r.paid_at)).toISOString(),
  periodEnd: r.period_end ? new Date(String(r.period_end)).toISOString() : undefined,
  status: r.status as SubscriptionPaymentRow["status"],
});

/** Numéro affiché sur le reçu d'un paiement d'abonnement : année du paiement et début de son identifiant unique. */
export function subscriptionReceiptNumber(payment: Pick<SubscriptionPaymentRow, "id" | "paidAt">): string {
  return `ABO-${payment.paidAt.slice(0, 4)}-${payment.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

/**
 * Reçu d'un paiement d'abonnement (rapport de test de la console du 23/11) : indispensable pour les paiements en
 * espèces, par virement ou Mobile Money. Lu par l'agence elle-même (propriétaire), jamais d'une autre agence.
 */
export async function getSubscriptionReceipt(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { ctx } = await readAgency({});
  if (!allowed(ctx, "billing.read")) return null;
  const { data: row, error } = await ctx.supabase
    .from("subscription_payments")
    .select(SUBSCRIPTION_PAYMENT.list)
    .eq("id", id)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  if (error) throw new Error(`Lecture du paiement d'abonnement impossible : ${error.message}`);
  if (!row) return null;
  const payment = toPaymentRow(row as Record<string, unknown>);
  const { data: plan } = payment.planId ? await ctx.supabase.from("plans").select("name").eq("id", payment.planId).maybeSingle() : { data: null };
  return { agency: ctx.agency, payment, planName: plan?.name ? String(plan.name) : undefined, number: subscriptionReceiptNumber(payment) };
}

export async function getBilling() {
  const { data, ctx, now } = await readAgency({});
  const canRead = allowed(ctx, "billing.read");
  if (!canRead) return { canRead, agency: ctx.agency, isDemo: ctx.isDemo, now };

  const [plansResult, paymentsResult] = await Promise.all([
    ctx.supabase.from("plans").select(PLAN.list).eq("is_active", true).order("price_minor"),
    ctx.supabase.from("subscription_payments").select(SUBSCRIPTION_PAYMENT.list).eq("organization_id", ctx.organizationId).order("paid_at", { ascending: false }),
  ]);
  if (plansResult.error) throw new Error(`Lecture des formules impossible : ${plansResult.error.message}`);
  if (paymentsResult.error) throw new Error(`Lecture des paiements d'abonnement impossible : ${paymentsResult.error.message}`);

  const payments: SubscriptionPaymentRow[] = (paymentsResult.data ?? []).map((r: Record<string, unknown>) => toPaymentRow(r));

  return {
    canRead,
    agency: ctx.agency,
    isDemo: ctx.isDemo,
    now,
    subscription: ctx.subscription,
    writable: ctx.writable,
    memberCount: activeMembers(data.members).filter((m) => m.hasAccount !== false).length,
    // Même calcul que la page Équipe et que la base (private.check_invitation_limit) : une invitation encore
    // valable occupe déjà une place.
    pendingInvitations: canRead
      ? ((await ctx.supabase
          .from("invitations")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", ctx.organizationId)
          .is("accepted_at", null)
          .is("revoked_at", null)
          .gt("expires_at", new Date().toISOString())).count ?? 0)
      : 0,
    plans: (plansResult.data ?? []).map((r: Record<string, unknown>) => toPlan(r)),
    payments,
  };
}
