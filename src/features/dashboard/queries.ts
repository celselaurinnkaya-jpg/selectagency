import "server-only";
import { can } from "@/lib/auth/permissions";
import { readAgency } from "@/lib/data/agency";
import { EVENT, toEvent } from "@/lib/data/rows";
import { dayKey } from "@/lib/format";
import { lastMonths, resolvePeriod } from "@/lib/period";
import { agencyFinance } from "@/features/finance/calculations";
import { summarizeCase } from "@/features/cases/summary";

export interface ToHandleItem {
  id: string;
  kind: "task" | "document" | "next_action" | "appointment";
  title: string;
  context: string;
  dueAt?: string;
  overdue: boolean;
  href: string;
}

export async function getDashboard(periodKey?: string) {
  const { data, now, ctx } = await readAgency({
    cases: true,
    clients: true,
    steps: true,
    requirements: true,
    tasks: true,
    appointments: true,
    charges: true,
    payments: true,
    expenses: true,
  });
  // Activité récente : les six derniers événements seulement, sans relire tout l'historique.
  const { data: recentEvents, error } = await ctx.supabase.from("activity_events").select(EVENT.list).order("at", { ascending: false }).limit(6);
  if (error) throw new Error(`Lecture impossible (activity_events) : ${error.message}`);
  data.events = ((recentEvents ?? []) as unknown as Record<string, unknown>[]).map(toEvent);
  const tz = data.agency.timezone;
  const period = resolvePeriod(periodKey, now, tz);
  const inPeriod = (iso: string) => !period.from || new Date(iso).getTime() >= period.from.getTime();

  const summaries = data.cases.map((c) => summarizeCase(data, c, now));
  const active = summaries.filter((s) => s.travelCase.status === "active");
  const today = dayKey(now, tz);
  const in7days = now.getTime() + 7 * 24 * 3600 * 1000;
  const clientName = (id?: string) => {
    const c = data.clients.find((x) => x.id === id);
    return c ? `${c.firstName} ${c.lastName}` : "";
  };
  const caseRef = (id?: string) => data.cases.find((x) => x.id === id)?.reference ?? "";

  // « À traiter » : ce qui doit être fait aujourd'hui ou qui est en retard.
  const toHandle: ToHandleItem[] = [
    ...data.tasks
      .filter((t) => (t.status === "todo" || t.status === "in_progress") && dayKey(t.dueAt, tz) <= today)
      .map((t) => ({
        id: t.id,
        kind: "task" as const,
        title: t.title,
        context: [caseRef(t.caseId), clientName(t.clientId)].filter(Boolean).join(" · "),
        dueAt: t.dueAt,
        overdue: new Date(t.dueAt).getTime() < now.getTime(),
        href: t.caseId ? `/cases/${t.caseId}?tab=taches` : "/tasks",
      })),
    ...data.requirements
      .filter((r) => r.status === "received" || r.status === "to_verify")
      .map((r) => ({
        id: r.id,
        kind: "document" as const,
        title: `Document à examiner : ${r.label}`,
        context: [caseRef(r.caseId), clientName(data.cases.find((c) => c.id === r.caseId)?.clientId)].join(" · "),
        dueAt: r.receivedAt,
        overdue: false,
        href: `/cases/${r.caseId}?tab=documents`,
      })),
    ...active
      // Pas de doublon : une tâche ouverte sur le dossier couvre déjà son action en retard.
      .filter((s) => s.isOverdue && !data.tasks.some((t) => t.caseId === s.travelCase.id && (t.status === "todo" || t.status === "in_progress") && dayKey(t.dueAt, tz) <= today))
      .map((s) => ({
        id: `na-${s.travelCase.id}`,
        kind: "next_action" as const,
        title: `Action en retard : ${s.travelCase.nextAction}`,
        context: `${s.travelCase.reference} · ${s.client.firstName} ${s.client.lastName}`,
        dueAt: s.travelCase.nextActionDueAt,
        overdue: true,
        href: `/cases/${s.travelCase.id}`,
      })),
  ].sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));

  const upcoming = data.appointments
    .filter((a) => a.status !== "cancelled" && a.status !== "done")
    .filter((a) => new Date(a.startsAt).getTime() >= now.getTime() - 3600 * 1000 && new Date(a.startsAt).getTime() <= in7days)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((a) => ({ appointment: a, clientName: clientName(a.clientId), caseRef: caseRef(a.caseId) }));

  const months = lastMonths(now, tz, 6);
  const monthOf = (iso: string) => dayKey(iso, tz).slice(0, 7);
  const series = months.map((m) => ({
    ...m,
    opened: data.cases.filter((c) => monthOf(c.openedAt) === m.key).length,
    closed: data.cases.filter((c) => c.closedAt && monthOf(c.closedAt) === m.key).length,
  }));

  const destinations = [...new Set(active.map((s) => s.travelCase.destinationCountry))]
    .map((code) => ({ code, count: active.filter((s) => s.travelCase.destinationCountry === code).length }))
    .sort((a, b) => b.count - a.count);

  const balancesByCurrency = new Map<string, number>();
  for (const s of active) balancesByCurrency.set(s.finance.currency, (balancesByCurrency.get(s.finance.currency) ?? 0) + s.finance.balanceMinor);

  return {
    agency: data.agency,
    member: ctx.member,
    canSeeFinance: can(ctx.member.role, "finance.read"),
    now,
    period,
    isEmpty: data.clients.length === 0,
    kpis: {
      clients: data.clients.filter((c) => !c.archivedAt).length,
      activeCases: active.length,
      waitingClient: active.filter((s) => s.waitingOn === "client_action").length,
      waitingThirdParty: active.filter((s) => s.waitingOn === "external_event").length,
      incomplete: active.filter((s) => s.missingRequired > 0).length,
      missingDocuments: active.reduce((total, s) => total + s.missingRequired, 0),
      closedInPeriod: data.cases.filter((c) => c.closedAt && inPeriod(c.closedAt)).length,
      upcomingAppointments: upcoming.length,
      overdueTasks: data.tasks.filter((t) => (t.status === "todo" || t.status === "in_progress") && new Date(t.dueAt).getTime() < now.getTime()).length,
    },
    finance: agencyFinance(data.charges, data.payments, data.expenses, period).map((f) => ({
      ...f,
      balanceDueMinor: balancesByCurrency.get(f.currency) ?? 0,
    })),
    toHandle,
    upcoming,
    recentCases: summaries
      .filter((s) => s.travelCase.status === "active")
      .sort((a, b) => (a.travelCase.nextActionDueAt ?? "").localeCompare(b.travelCase.nextActionDueAt ?? ""))
      .slice(0, 6),
    series,
    destinations,
    activity: [...data.events]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 6)
      .map((e) => ({ event: e, actor: data.members.find((m) => m.id === e.actorId) })),
  };
}
