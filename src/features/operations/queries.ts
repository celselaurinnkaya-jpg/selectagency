import "server-only";
import { getAgencyContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { fetchRows, readAgency } from "@/lib/data/agency";
import { INVITATION_COLUMNS, toInvitation } from "@/features/team/invitations";
import { dayKey } from "@/lib/format";
import { monthParts, shiftMonth } from "@/lib/period";
import type { DocumentRequirement } from "@/lib/domain/types";
import { documentType } from "@/features/documents/checklists";

// Lectures des écrans opérationnels : documents, rendez-vous, tâches, équipe, recherche.

export type DocumentView = "a-examiner" | "manquants" | "a-corriger" | "expiration" | "tous";

const EXPIRY_WARNING_DAYS = 90;

export async function listDocumentQueue(view: DocumentView) {
  const { data, now } = await readAgency({ cases: true, clients: true, requirements: true });
  const activeCases = new Map(data.cases.filter((c) => c.status === "active").map((c) => [c.id, c]));
  const limit = now.getTime() + EXPIRY_WARNING_DAYS * 24 * 3600 * 1000;

  const expiresSoon = (r: DocumentRequirement) =>
    !!r.expiresAt && documentType(r.documentTypeCode).hasExpiry && new Date(r.expiresAt).getTime() <= limit;
  const matches: Record<DocumentView, (r: DocumentRequirement) => boolean> = {
    "a-examiner": (r) => r.status === "received" || r.status === "to_verify",
    manquants: (r) => r.isRequired && r.status === "not_received",
    "a-corriger": (r) => r.status === "to_correct",
    expiration: expiresSoon,
    tous: () => true,
  };

  const base = data.requirements.filter((r) => activeCases.has(r.caseId));
  const rows = base.filter(matches[view]).map((requirement) => {
    const travelCase = activeCases.get(requirement.caseId)!;
    const client = data.clients.find((c) => c.id === travelCase.clientId)!;
    return { requirement, travelCase, client, expiresSoon: expiresSoon(requirement) };
  });

  return {
    rows,
    agency: data.agency,
    now,
    counts: Object.fromEntries(
      (Object.keys(matches) as DocumentView[]).map((key) => [key, base.filter(matches[key]).length]),
    ) as Record<DocumentView, number>,
  };
}

export async function listAppointments(monthParam?: string) {
  const { data, now } = await readAgency({ appointments: true, clients: true, cases: true });
  const tz = data.agency.timezone;
  const parsed = monthParam?.match(/^(\d{4})-(\d{2})$/);
  const { year, month } = parsed ? { year: Number(parsed[1]), month: Number(parsed[2]) } : monthParts(now, tz);
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  const items = data.appointments
    .filter((a) => a.status !== "cancelled")
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((appointment) => {
      const client = data.clients.find((c) => c.id === appointment.clientId);
      return {
        appointment,
        clientName: client ? `${client.firstName} ${client.lastName}` : undefined,
        caseRef: data.cases.find((c) => c.id === appointment.caseId)?.reference,
        assignee: data.members.find((m) => m.id === appointment.assignedTo),
        day: dayKey(appointment.startsAt, tz),
      };
    });

  return {
    agency: data.agency,
    now,
    today: dayKey(now, tz),
    month: { year, month, key: monthKey, previous: shiftMonth(year, month, -1), next: shiftMonth(year, month, 1) },
    upcoming: items.filter((i) => new Date(i.appointment.startsAt).getTime() >= now.getTime() - 3600 * 1000),
    past: items.filter((i) => new Date(i.appointment.startsAt).getTime() < now.getTime() - 3600 * 1000).reverse(),
    inMonth: items.filter((i) => i.day.startsWith(monthKey)),
  };
}

export type TaskScope = "a-faire" | "en-retard" | "terminees" | "toutes";

export async function listTasks(scope: TaskScope, onlyMine = false) {
  const { data, now, ctx } = await readAgency({ tasks: true, clients: true, cases: true });
  const memberId = onlyMine ? data.currentMemberId : undefined;
  const open = (status: string) => status === "todo" || status === "in_progress";
  const all = data.tasks.filter((t) => !memberId || t.assignedTo === memberId);
  const matches: Record<TaskScope, (t: (typeof all)[number]) => boolean> = {
    "a-faire": (t) => open(t.status),
    "en-retard": (t) => open(t.status) && new Date(t.dueAt).getTime() < now.getTime(),
    terminees: (t) => t.status === "done",
    toutes: () => true,
  };
  const rows = all
    .filter(matches[scope])
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    .map((task) => {
      const client = data.clients.find((c) => c.id === task.clientId);
      return {
        task,
        clientName: client ? `${client.firstName} ${client.lastName}` : undefined,
        caseRef: data.cases.find((c) => c.id === task.caseId)?.reference,
        assignee: data.members.find((m) => m.id === task.assignedTo),
        overdue: open(task.status) && new Date(task.dueAt).getTime() < now.getTime(),
      };
    });
  return {
    rows,
    agency: data.agency,
    now,
    members: data.members,
    currentMemberId: data.currentMemberId,
    canWrite: can(ctx.member.role, "operations.write"),
    cases: data.cases.filter((c) => c.status === "active").map((c) => ({ id: c.id, label: `${c.reference} — ${c.title}` })),
    counts: Object.fromEntries((Object.keys(matches) as TaskScope[]).map((key) => [key, all.filter(matches[key]).length])) as Record<TaskScope, number>,
  };
}

export async function getTeam() {
  const { data, now, ctx } = await readAgency({ tasks: true, cases: true });
  const canManage = can(ctx.member.role, "team.manage");
  // Les invitations ne sont lisibles que par les responsables (RLS) : inutile de les demander sinon.
  const invitations = canManage
    ? (await fetchRows(ctx, "invitations", INVITATION_COLUMNS, (q) => q.is("accepted_at", null).is("revoked_at", null))).map(toInvitation)
    : [];
  return {
    agency: data.agency,
    currentMemberId: data.currentMemberId,
    currentRole: ctx.member.role,
    canManage,
    invitations: invitations.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    members: data.members.map((member) => {
      const openTasks = data.tasks.filter((t) => t.assignedTo === member.id && (t.status === "todo" || t.status === "in_progress"));
      return {
        member,
        activeCases: data.cases.filter((c) => c.assignedTo === member.id && c.status === "active").length,
        openTasks: openTasks.length,
        overdueTasks: openTasks.filter((t) => new Date(t.dueAt).getTime() < now.getTime()).length,
      };
    }),
  };
}

export async function getAgencySettings() {
  const ctx = await getAgencyContext();
  return { agency: ctx.agency, canManage: can(ctx.member.role, "settings.manage") };
}

export async function getShell() {
  const ctx = await getAgencyContext();
  return { agency: ctx.agency, member: ctx.member, isDemo: ctx.isDemo };
}

const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export async function search(q: string) {
  const { data } = await readAgency({ clients: true, cases: true });
  const query = normalize(q.trim());
  const digits = q.replace(/\D/g, "");
  if (query.length < 2) return { query: q, clients: [], cases: [] };
  return {
    query: q,
    clients: data.clients.filter(
      (c) =>
        normalize(`${c.firstName} ${c.lastName} ${c.reference} ${c.email ?? ""}`).includes(query) ||
        (digits.length >= 4 && c.phoneE164.includes(digits)),
    ),
    cases: data.cases
      .filter((k) => {
        const client = data.clients.find((c) => c.id === k.clientId);
        return normalize(`${k.reference} ${k.title} ${client?.firstName ?? ""} ${client?.lastName ?? ""}`).includes(query);
      })
      .map((k) => ({ travelCase: k, client: data.clients.find((c) => c.id === k.clientId)! })),
  };
}
