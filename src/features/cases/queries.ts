import "server-only";
import { readDb } from "@/lib/demo/store";
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
  const { data, now } = await readDb();
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
  const { data, now } = await readDb();
  const travelCase = data.cases.find((c) => c.id === id);
  if (!travelCase) return null;

  const summary = summarizeCase(data, travelCase, now);
  const steps = data.steps.filter((s) => s.caseId === id).sort((a, b) => a.position - b.position);
  const charges = data.charges.filter((c) => c.caseId === id);
  const payments = data.payments.filter((p) => p.caseId === id).sort((a, b) => a.paidAt.localeCompare(b.paidAt));
  const current = summary.current;

  return {
    summary,
    agency: data.agency,
    now,
    members: data.members,
    steps,
    transitions: current
      ? {
          forward: forwardOptions(steps, current),
          back: backOptions(steps, current),
          canSkip: current.isOptional,
          needsConfirmation: requiresConfirmation(current),
        }
      : null,
    requirements: data.requirements.filter((r) => r.caseId === id),
    appointments: data.appointments.filter((a) => a.caseId === id).sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    tasks: data.tasks.filter((t) => t.caseId === id).sort((a, b) => a.dueAt.localeCompare(b.dueAt)),
    charges: chargeProgress(charges, payments),
    payments,
    expenses: data.expenses.filter((e) => e.caseId === id),
    events: data.events.filter((e) => e.caseId === id).sort((a, b) => b.at.localeCompare(a.at)),
    communications: data.communications.filter((c) => c.caseId === id).sort((a, b) => b.at.localeCompare(a.at)),
  };
}

export async function getCaseFormOptions(clientId?: string) {
  const { data } = await readDb();
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
