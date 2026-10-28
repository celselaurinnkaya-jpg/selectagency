import "server-only";
import { can } from "@/lib/auth/permissions";
import { loadTables, readAgency } from "@/lib/data/agency";
import type { CaseCategory, CaseStatus, StepKind } from "@/lib/domain/types";
import { chargeProgress } from "@/features/finance/calculations";
import { backOptions, forwardOptions, requiresConfirmation } from "@/features/workflows/rules";
import { summarizeCase } from "./summary";

export interface CaseFilters {
  q?: string;
  category?: CaseCategory;
  status?: CaseStatus | "all";
  destination?: string;
  waiting?: StepKind;
}

const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export async function listCases(filters: CaseFilters) {
  const { data, now } = await readAgency({ cases: true, clients: true, steps: true, requirements: true, charges: true, payments: true });
  const query = filters.q ? normalize(filters.q.trim()) : "";
  const status = filters.status ?? "active";

  const rows = data.cases
    .filter((c) => status === "all" || c.status === status)
    .filter((c) => !filters.category || c.category === filters.category)
    .filter((c) => !filters.destination || c.destinationCountry === filters.destination)
    .map((c) => summarizeCase(data, c, now))
    .filter((s) => !filters.waiting || s.waitingOn === filters.waiting)
    .filter(
      (s) =>
        !query ||
        normalize(`${s.travelCase.reference} ${s.travelCase.title} ${s.client.firstName} ${s.client.lastName}`).includes(query),
    )
    .sort((a, b) => {
      if (a.travelCase.status !== b.travelCase.status) return a.travelCase.status === "active" ? -1 : 1;
      const da = a.travelCase.nextActionDueAt ?? a.travelCase.openedAt;
      const dbb = b.travelCase.nextActionDueAt ?? b.travelCase.openedAt;
      return da.localeCompare(dbb);
    });

  return {
    rows,
    now,
    agency: data.agency,
    destinations: [...new Set(data.cases.map((c) => c.destinationCountry))],
    counts: {
      all: data.cases.length,
      active: data.cases.filter((c) => c.status === "active").length,
    },
  };
}

export async function getCaseDetail(id: string) {
  // Un identifiant mal formé ne doit pas provoquer d'erreur SQL : c'est simplement « introuvable ».
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, now, ctx } = await readAgency({
    cases: (q) => q.eq("id", id),
    steps: (q) => q.eq("case_id", id),
    requirements: (q) => q.eq("case_id", id),
    appointments: (q) => q.eq("case_id", id),
    tasks: (q) => q.eq("case_id", id),
    charges: (q) => q.eq("case_id", id),
    payments: (q) => q.eq("case_id", id),
    expenses: (q) => q.eq("case_id", id),
    events: (q) => q.eq("case_id", id),
    communications: (q) => q.eq("case_id", id),
  });
  const travelCase = data.cases[0];
  if (!travelCase) return null;
  const { clients = [] } = await loadTables(ctx, { clients: (q) => q.eq("id", travelCase.clientId) });
  data.clients = clients;

  const summary = summarizeCase(data, travelCase, now);
  const steps = [...data.steps].sort((a, b) => a.position - b.position);
  const payments = [...data.payments].sort((a, b) => a.paidAt.localeCompare(b.paidAt));
  const current = summary.current;

  return {
    summary,
    agency: data.agency,
    now,
    members: data.members,
    permissions: {
      write: can(ctx.member.role, "operations.write"),
      financeRead: can(ctx.member.role, "finance.read"),
      financeWrite: can(ctx.member.role, "finance.write"),
      documentsRead: can(ctx.member.role, "documents.read"),
    },
    organizationId: ctx.organizationId,
    steps,
    transitions: current
      ? {
          forward: forwardOptions(steps, current),
          back: backOptions(steps, current),
          canSkip: current.isOptional,
          needsConfirmation: requiresConfirmation(current),
        }
      : null,
    requirements: data.requirements,
    appointments: [...data.appointments].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    tasks: [...data.tasks].sort((a, b) => a.dueAt.localeCompare(b.dueAt)),
    charges: chargeProgress(data.charges, payments),
    payments,
    expenses: data.expenses,
    events: [...data.events].sort((a, b) => b.at.localeCompare(a.at)),
    communications: [...data.communications].sort((a, b) => b.at.localeCompare(a.at)),
  };
}

export async function getCaseFormOptions(clientId?: string) {
  const { data } = await readAgency({ clients: true });
  return {
    clients: data.clients
      .filter((c) => !c.archivedAt)
      .sort((a, b) => a.lastName.localeCompare(b.lastName, "fr"))
      .map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName} (${c.reference})`, residenceCountry: c.residenceCountry })),
    members: data.members.filter((m) => m.role !== "accountant" && m.role !== "viewer"),
    currentMemberId: data.currentMemberId,
    preselectedClientId: data.clients.some((c) => c.id === clientId) ? clientId : undefined,
    currency: data.agency.currency,
  };
}
