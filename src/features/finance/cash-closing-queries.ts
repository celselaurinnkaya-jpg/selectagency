import { readAgency } from "@/lib/data/agency";
import { allowed } from "@/lib/auth/permissions";
import { dayKey } from "@/lib/format";
import type { Payment, Member, PaymentMethodKind } from "@/lib/domain/types";
import type { CashClosing, DayCashSummary } from "./cash-closing";

interface CashClosingRow {
  id: string;
  organization_id: string;
  closing_date: string;
  currency: string;
  closed_by: string;
  closed_at: string;
  expected_cash_minor: number | string;
  actual_cash_minor: number | string;
  discrepancy_minor: number | string;
  total_collected_minor: number | string;
  breakdown: Record<string, number> | null;
  notes: string | null;
  bureau_id: string | null;
}

export async function getCashClosingData(targetDate?: string, bureauParam?: string) {
  const { data, now, ctx } = await readAgency({ payments: true });
  // Caisse d'un bureau (paiements encaissés dans ce bureau) ou de toute l'agence.
  const bureau = data.bureaux.some((b) => b.id === bureauParam) ? bureauParam : undefined;
  const tz = data.agency.timezone;
  const date = targetDate || dayKey(now, tz);
  const currency = data.agency.currency;

  const canSeeFinance = allowed(ctx, "finance.read");
  const canWrite = allowed(ctx, "finance.write");

  // Encaissements confirmés de la date cible
  const dayPayments = (data.payments as Payment[]).filter((p: Payment) => {
    if (p.status !== "recorded" || p.currency !== currency) return false;
    if (bureau && p.bureauId !== bureau) return false;
    const pDate = dayKey(p.paidAt, tz);
    return pDate === date;
  });

  const breakdown: Partial<Record<PaymentMethodKind, number>> = {};
  let totalCollectedMinor = 0;
  let expectedCashMinor = 0;

  for (const p of dayPayments) {
    totalCollectedMinor += p.amountMinor;
    const methodKind = (p.methodKind || "cash") as PaymentMethodKind;
    breakdown[methodKind] = (breakdown[methodKind] ?? 0) + p.amountMinor;
    if (methodKind === "cash") {
      expectedCashMinor += p.amountMinor;
    }
  }

  // Clôtures enregistrées en base
  const { data: closingRows } = await ctx.supabase
    .from("cash_closings")
    .select("*")
    .eq("organization_id", ctx.organizationId)
    .order("closing_date", { ascending: false })
    .limit(30);

  const closings: CashClosing[] = ((closingRows as CashClosingRow[] | null) || []).map((r: CashClosingRow) => {
    const member = (data.members as Member[]).find((m: Member) => m.id === r.closed_by);
    return {
      id: String(r.id),
      organizationId: String(r.organization_id),
      bureauId: r.bureau_id ? String(r.bureau_id) : undefined,
      closingDate: String(r.closing_date),
      currency: String(r.currency),
      closedBy: String(r.closed_by),
      closedByName: member?.fullName,
      closedAt: String(r.closed_at),
      expectedCashMinor: Number(r.expected_cash_minor),
      actualCashMinor: Number(r.actual_cash_minor),
      discrepancyMinor: Number(r.discrepancy_minor),
      totalCollectedMinor: Number(r.total_collected_minor),
      breakdown: (r.breakdown || {}) as Partial<Record<PaymentMethodKind, number>>,
      notes: r.notes || undefined,
    };
  });

  const todayClosing = closings.find((c) => c.closingDate === date && c.currency === currency && (c.bureauId ?? undefined) === bureau);

  const summary: DayCashSummary = {
    date,
    currency,
    expectedCashMinor,
    totalCollectedMinor,
    breakdown,
    paymentsCount: dayPayments.length,
    closing: todayClosing,
  };

  return {
    agency: data.agency,
    bureaux: data.bureaux,
    bureau,
    now,
    tz,
    date,
    currency,
    canSeeFinance,
    canWrite,
    summary,
    closings,
  };
}
