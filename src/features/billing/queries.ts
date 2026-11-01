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

  const payments: SubscriptionPaymentRow[] = (paymentsResult.data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    planId: r.plan_id ? String(r.plan_id) : undefined,
    amountMinor: Number(r.amount_minor),
    currency: String(r.currency),
    methodKind: r.method_kind as PaymentMethodKind,
    transactionReference: r.transaction_reference ? String(r.transaction_reference) : undefined,
    paidAt: new Date(String(r.paid_at)).toISOString(),
    periodEnd: r.period_end ? new Date(String(r.period_end)).toISOString() : undefined,
    status: r.status as SubscriptionPaymentRow["status"],
  }));

  return {
    canRead,
    agency: ctx.agency,
    isDemo: ctx.isDemo,
    now,
    subscription: ctx.subscription,
    writable: ctx.writable,
    memberCount: activeMembers(data.members).filter((m) => m.hasAccount !== false).length,
    plans: (plansResult.data ?? []).map((r: Record<string, unknown>) => toPlan(r)),
    payments,
  };
}
