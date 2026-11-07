import "server-only";
import { allowed } from "@/lib/auth/permissions";
import { loadTables, readAgency } from "@/lib/data/agency";
import { dayKey } from "@/lib/format";
import { lastMonths, resolvePeriod } from "@/lib/period";
import { summarizeCase } from "@/features/cases/summary";
import { imageUrls } from "@/features/invoices/document";
import { loadInvoiceSettings } from "@/features/invoices/queries";
import { agencyFinance } from "./calculations";
import { documentFromPayment } from "./receipt";
import { activeMembers } from "@/lib/domain/members";
import type { Payment } from "@/lib/domain/types";
import { campaignStats } from "@/features/communications/campaigns";

export async function getFinanceOverview(periodKey?: string) {
  const { data, now, ctx } = await readAgency({ cases: true, clients: true, steps: true, requirements: true, charges: true, payments: true, expenses: true });
  const period = resolvePeriod(periodKey, now, data.agency.timezone);
  const summaries = data.cases.map((c) => summarizeCase(data, c, now));
  const balances = summaries.filter((s) => s.finance.balanceMinor > 0).sort((a, b) => b.finance.balanceMinor - a.finance.balanceMinor);
  return {
    agency: data.agency,
    now,
    period,
    canSeeFinance: allowed(ctx, "finance.read"),
    totals: agencyFinance(data.charges, data.payments, data.expenses, period).map((t) => ({
      ...t,
      balanceDueMinor: balances.filter((b) => b.finance.currency === t.currency).reduce((sum, b) => sum + b.finance.balanceMinor, 0),
    })),
    balances,
  };
}

export type PaymentFilter = "tous" | "a-verifier" | "confirmes" | "annules";

const PAYMENT_FILTERS: Record<PaymentFilter, (p: Payment) => boolean> = {
  tous: () => true,
  "a-verifier": (p) => p.status === "pending",
  confirmes: (p) => p.status === "recorded",
  annules: (p) => p.status === "voided",
};

export const isPaymentFilter = (value: unknown): value is PaymentFilter => typeof value === "string" && value in PAYMENT_FILTERS;

export async function listPayments(filter: PaymentFilter = "tous") {
  const { data, ctx } = await readAgency({ payments: true, clients: true, cases: true });
  const count = (f: PaymentFilter) => data.payments.filter(PAYMENT_FILTERS[f]).length;
  // Montant à vérifier, par devise (une agence peut encaisser en XAF et en EUR).
  const pendingTotals = new Map<string, number>();
  for (const p of data.payments) if (p.status === "pending") pendingTotals.set(p.currency, (pendingTotals.get(p.currency) ?? 0) + p.amountMinor);
  return {
    agency: data.agency,
    canSeeFinance: allowed(ctx, "finance.read"),
    canWrite: allowed(ctx, "finance.write"),
    counts: { tous: count("tous"), "a-verifier": count("a-verifier"), confirmes: count("confirmes"), annules: count("annules") },
    pendingTotals: [...pendingTotals].map(([currency, amountMinor]) => ({ currency, amountMinor })),
    rows: data.payments
      .filter(PAYMENT_FILTERS[filter])
      .sort((a, b) => b.paidAt.localeCompare(a.paidAt))
      .map((payment) => {
        const client = data.clients.find((c) => c.id === payment.clientId)!;
        return {
          payment,
          client,
          caseRef: data.cases.find((c) => c.id === payment.caseId)?.reference ?? "",
          receivedBy: data.members.find((m) => m.id === payment.receivedBy),
        };
      }),
  };
}

export async function listExpenses() {
  const { data, ctx, now } = await readAgency({ expenses: true, cases: true });
  return {
    agency: data.agency,
    now,
    canSeeFinance: allowed(ctx, "finance.read"),
    canWrite: allowed(ctx, "finance.write"),
    cases: data.cases
      .filter((c) => c.status === "active" || c.status === "on_hold")
      .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
      .map((c) => ({ value: c.id, label: `${c.reference} — ${c.title}` })),
    rows: [...data.expenses]
      .sort((a, b) => b.paidAt.localeCompare(a.paidAt))
      .map((expense) => ({
        expense,
        caseRef: data.cases.find((c) => c.id === expense.caseId)?.reference,
        recordedBy: data.members.find((m) => m.id === expense.recordedBy),
      })),
  };
}

/**
 * Paiement et, s'il est confirmé, son reçu (même présentation que les factures). Un paiement à
 * vérifier n'a pas encore de reçu : la page propose de confirmer sa réception ou de l'annuler.
 */
export async function getReceipt(paymentId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(paymentId)) return null;
  const { data, ctx } = await readAgency({ payments: (q) => q.eq("id", paymentId) });
  const payment = data.payments[0];
  if (!payment) return null;
  const [tables, settings] = await Promise.all([
    loadTables(ctx, {
      cases: (q) => q.eq("id", payment.caseId),
      clients: (q) => q.eq("id", payment.clientId),
      charges: (q) => q.eq("case_id", payment.caseId),
    }),
    loadInvoiceSettings(ctx),
  ]);
  Object.assign(data, tables);
  const travelCase = data.cases.find((c) => c.id === payment.caseId)!;
  const client = data.clients.find((c) => c.id === payment.clientId)!;
  const member = (id?: string) => data.members.find((m) => m.id === id);
  const receiptNumber = payment.receiptNumber;
  return {
    payment,
    agency: data.agency,
    client,
    travelCase,
    settings,
    receivedBy: member(payment.receivedBy),
    confirmedBy: member(payment.confirmedBy),
    lines: payment.allocations.map((a) => ({ ...a, charge: data.charges.find((c) => c.id === a.chargeId) })),
    document: receiptNumber
      ? documentFromPayment({
          payment: { ...payment, receiptNumber },
          client,
          travelCase,
          charges: data.charges,
          agency: data.agency,
          settings,
          receivedBy: member(payment.receivedBy),
          voidedBy: member(payment.voidedBy),
          isDemo: ctx.isDemo,
        })
      : undefined,
    images: imageUrls(settings),
    // Un paiement à vérifier s'annule avec le droit d'écrire en finance ; un reçu, avec le droit d'annuler.
    canVoid: payment.status === "pending" ? allowed(ctx, "finance.write") : payment.status === "recorded" && allowed(ctx, "payment.void"),
    canConfirm: payment.status === "pending" && allowed(ctx, "finance.write"),
    // Clients fictifs de la démonstration : leur numéro ne doit jamais être contacté.
    phoneDigits: client.isDemoFixture ? undefined : (client.whatsappE164 ?? client.phoneE164).replace(/\D/g, ""),
    email: client.isDemoFixture ? undefined : client.email,
  };
}

export async function getReports(periodKey?: string) {
  const { data, now, ctx } = await readAgency({ cases: true, clients: true, steps: true, requirements: true, charges: true, payments: true, expenses: true, tasks: true });
  const tz = data.agency.timezone;
  const period = resolvePeriod(periodKey, now, tz);
  const inPeriod = (iso?: string) => !!iso && (!period.from || new Date(iso).getTime() >= period.from.getTime());
  const summaries = data.cases.map((c) => summarizeCase(data, c, now));
  const opened = data.cases.filter((c) => inPeriod(c.openedAt));
  const monthOf = (iso: string) => dayKey(iso, tz).slice(0, 7);
  const months = lastMonths(now, tz, 6);

  const countBy = <T,>(items: T[], key: (item: T) => string) => {
    const map = new Map<string, number>();
    for (const item of items) map.set(key(item), (map.get(key(item)) ?? 0) + 1);
    return [...map.entries()].map(([k, count]) => ({ key: k, count })).sort((a, b) => b.count - a.count);
  };

  const active = summaries.filter((s) => s.travelCase.status === "active");
  return {
    agency: data.agency,
    now,
    period,
    canSeeFinance: allowed(ctx, "finance.read"),
    canExport: allowed(ctx, "reports.export"),
    canExportFinance: allowed(ctx, "finance.export"),
    openedCount: opened.length,
    closedCount: data.cases.filter((c) => inPeriod(c.closedAt)).length,
    byCategory: countBy(opened, (c) => c.category),
    byDestination: countBy(opened, (c) => c.destinationCountry),
    // Nouveaux contacts (prospects et clients) de la période, par origine ; prospects devenus clients.
    contacts: (() => {
      const added = data.clients.filter((c) => inPeriod(c.registeredAt));
      return {
        total: added.length,
        converted: data.clients.filter((c) => inPeriod(c.convertedAt)).length,
        bySource: countBy(added, (c) => c.source ?? "unknown"),
        byCampaign: campaignStats(added),
      };
    })(),
    waiting: countBy(active, (s) => s.waitingOn ?? "agency_action"),
    monthly: months.map((m) => ({
      ...m,
      opened: data.cases.filter((c) => monthOf(c.openedAt) === m.key).length,
      closed: data.cases.filter((c) => c.closedAt && monthOf(c.closedAt) === m.key).length,
      receivedMinor: data.payments.filter((p) => p.status === "recorded" && p.currency === data.agency.currency && monthOf(p.paidAt) === m.key).reduce((s, p) => s + p.amountMinor, 0),
    })),
    finance: agencyFinance(data.charges, data.payments, data.expenses, period),
    workload: activeMembers(data.members)
      .filter((m) => m.role !== "viewer")
      .map((member) => {
        const tasks = data.tasks.filter((t) => t.assignedTo === member.id);
        const open = tasks.filter((t) => t.status === "todo" || t.status === "in_progress");
        return {
          member,
          activeCases: active.filter((s) => s.travelCase.assignedTo === member.id).length,
          openTasks: open.length,
          overdueTasks: open.filter((t) => new Date(t.dueAt).getTime() < now.getTime()).length,
          doneInPeriod: tasks.filter((t) => t.status === "done" && inPeriod(t.completedAt)).length,
        };
      }),
  };
}
