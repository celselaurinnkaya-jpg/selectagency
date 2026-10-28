import "server-only";
import { readDb } from "@/lib/demo/store";
import { dayKey } from "@/lib/format";
import { lastMonths, resolvePeriod } from "@/lib/period";
import { summarizeCase } from "@/features/cases/summary";
import { agencyFinance } from "./calculations";

export async function getFinanceOverview(periodKey?: string) {
  const { data, now } = await readDb();
  const period = resolvePeriod(periodKey, now, data.agency.timezone);
  const summaries = data.cases.map((c) => summarizeCase(data, c, now));
  const balances = summaries.filter((s) => s.finance.balanceMinor > 0).sort((a, b) => b.finance.balanceMinor - a.finance.balanceMinor);
  return {
    agency: data.agency,
    now,
    period,
    totals: agencyFinance(data.charges, data.payments, data.expenses, period).map((t) => ({
      ...t,
      balanceDueMinor: balances.filter((b) => b.finance.currency === t.currency).reduce((sum, b) => sum + b.finance.balanceMinor, 0),
    })),
    balances,
  };
}

export async function listPayments() {
  const { data } = await readDb();
  return {
    agency: data.agency,
    rows: [...data.payments]
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
  const { data } = await readDb();
  return {
    agency: data.agency,
    rows: [...data.expenses]
      .sort((a, b) => b.paidAt.localeCompare(a.paidAt))
      .map((expense) => ({
        expense,
        caseRef: data.cases.find((c) => c.id === expense.caseId)?.reference,
        recordedBy: data.members.find((m) => m.id === expense.recordedBy),
      })),
  };
}

export async function getReceipt(paymentId: string) {
  const { data } = await readDb();
  const payment = data.payments.find((p) => p.id === paymentId);
  if (!payment) return null;
  const travelCase = data.cases.find((c) => c.id === payment.caseId)!;
  return {
    payment,
    agency: data.agency,
    client: data.clients.find((c) => c.id === payment.clientId)!,
    travelCase,
    receivedBy: data.members.find((m) => m.id === payment.receivedBy),
    lines: payment.allocations.map((a) => ({ ...a, charge: data.charges.find((c) => c.id === a.chargeId)! })),
  };
}

export async function getReports(periodKey?: string) {
  const { data, now } = await readDb();
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
    openedCount: opened.length,
    closedCount: data.cases.filter((c) => inPeriod(c.closedAt)).length,
    byCategory: countBy(opened, (c) => c.category),
    byDestination: countBy(opened, (c) => c.destinationCountry),
    waiting: countBy(active, (s) => s.waitingOn ?? "agency_action"),
    monthly: months.map((m) => ({
      ...m,
      opened: data.cases.filter((c) => monthOf(c.openedAt) === m.key).length,
      closed: data.cases.filter((c) => c.closedAt && monthOf(c.closedAt) === m.key).length,
      receivedMinor: data.payments.filter((p) => p.status === "recorded" && p.currency === data.agency.currency && monthOf(p.paidAt) === m.key).reduce((s, p) => s + p.amountMinor, 0),
    })),
    finance: agencyFinance(data.charges, data.payments, data.expenses, period),
    workload: data.members
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
