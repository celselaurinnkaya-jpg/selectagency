import { createSeed } from "@/lib/demo/fixtures";
import {
  appointmentToRow,
  caseToRow,
  chargeToRow,
  clientToRow,
  eventToRow,
  expenseToRow,
  memberToRow,
  paymentToRow,
  requirementToRow,
  stepToRow,
  taskToRow,
} from "@/lib/data/rows";

// Prépare l'import de l'agence de démonstration (fonction SQL import_demo_data) à partir des données
// fictives de src/lib/demo/fixtures.ts. Les identifiants fictifs (« cli-42 », « m2 »…) deviennent
// des UUID, et toutes les dates sont décalées pour que la démonstration reste d'actualité.

/** Jour de référence des données fictives : les dossiers y sont décrits « à aujourd'hui ». */
export const FIXTURE_DAY = "2026-10-28";
const DAY_MS = 86_400_000;

export function buildDemoPayload(ownerMemberId: string, today: string, newId: () => string = () => crypto.randomUUID()) {
  const seed = createSeed();
  const now = new Date().toISOString();
  // Une milliseconde d'écart par ligne : les pièces et prestations gardent leur ordre d'origine.
  const nth = (index: number) => new Date(Date.parse(now) + index).toISOString();
  const shiftMs = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${FIXTURE_DAY}T12:00:00Z`)) / DAY_MS) * DAY_MS;
  const at = (value: string) => new Date(Date.parse(value) + shiftMs).toISOString();
  const optAt = (value?: string) => (value ? at(value) : undefined);
  const day = (value?: string) => (value ? new Date(Date.parse(`${value}T12:00:00Z`) + shiftMs).toISOString().slice(0, 10) : undefined);

  // Le propriétaire fictif (« m1 ») est remplacé par la personne qui crée la démonstration.
  const ids = new Map<string, string>([[seed.currentMemberId, ownerMemberId]]);
  const id = (fixtureId: string) => {
    let value = ids.get(fixtureId);
    if (!value) {
      value = newId();
      ids.set(fixtureId, value);
    }
    return value;
  };
  const optId = (fixtureId?: string) => (fixtureId ? id(fixtureId) : undefined);

  return {
    members: seed.members
      .filter((m) => m.id !== seed.currentMemberId)
      .map((m) => ({ ...memberToRow({ ...m, id: id(m.id) }), created_at: now })),
    clients: seed.clients.map((c) => ({
      ...clientToRow({ ...c, assignedTo: id(c.assignedTo) }),
      id: id(c.id),
      reference: c.reference,
      registered_at: at(c.registeredAt),
      archived_at: null,
      is_demo_fixture: true,
      created_at: now,
      updated_at: now,
    })),
    cases: seed.cases.map((c) => ({
      ...caseToRow({
        ...c,
        id: id(c.id),
        clientId: id(c.clientId),
        assignedTo: id(c.assignedTo),
        openedAt: at(c.openedAt),
        closedAt: optAt(c.closedAt),
        nextActionDueAt: optAt(c.nextActionDueAt),
        plannedDepartureDate: day(c.plannedDepartureDate),
        version: 1,
      }),
      created_at: now,
      updated_at: now,
    })),
    case_steps: seed.steps.map((s) =>
      stepToRow({ ...s, id: id(s.id), caseId: id(s.caseId), completedAt: optAt(s.completedAt), completedBy: optId(s.completedBy) }),
    ),
    document_requirements: seed.requirements.map((r, index) => ({
      ...requirementToRow({
        ...r,
        id: id(r.id),
        caseId: id(r.caseId),
        receivedAt: optAt(r.receivedAt),
        reviewedAt: optAt(r.reviewedAt),
        reviewedBy: optId(r.reviewedBy),
        expiresAt: day(r.expiresAt),
        storagePath: undefined,
      }),
      created_at: nth(index),
    })),
    appointments: seed.appointments.map((a) => ({
      ...appointmentToRow({
        ...a,
        id: id(a.id),
        caseId: optId(a.caseId),
        clientId: optId(a.clientId),
        assignedTo: id(a.assignedTo),
        startsAt: at(a.startsAt),
        endsAt: optAt(a.endsAt),
      }),
      created_at: now,
    })),
    tasks: seed.tasks.map((t) => ({
      ...taskToRow({
        ...t,
        id: id(t.id),
        caseId: optId(t.caseId),
        clientId: optId(t.clientId),
        assignedTo: id(t.assignedTo),
        dueAt: at(t.dueAt),
        completedAt: optAt(t.completedAt),
      }),
      created_at: now,
      updated_at: now,
    })),
    charges: seed.charges.map((c, index) => ({ ...chargeToRow({ ...c, id: id(c.id), caseId: id(c.caseId) }), created_at: nth(index) })),
    payments: seed.payments.map((p) => ({
      ...paymentToRow({ ...p, id: id(p.id), caseId: id(p.caseId), clientId: id(p.clientId), receivedBy: id(p.receivedBy), paidAt: at(p.paidAt) }),
      created_at: now,
    })),
    payment_allocations: seed.payments.flatMap((p) =>
      p.allocations.map((a) => ({ id: newId(), payment_id: id(p.id), charge_id: id(a.chargeId), amount_minor: a.amountMinor })),
    ),
    expenses: seed.expenses.map((e) => ({
      ...expenseToRow({ ...e, id: id(e.id), caseId: optId(e.caseId), recordedBy: id(e.recordedBy), paidAt: at(e.paidAt) }),
      created_at: now,
    })),
    activity_events: seed.events.map((e) =>
      eventToRow({ ...e, id: id(e.id), at: at(e.at), actorId: id(e.actorId), clientId: optId(e.clientId), caseId: optId(e.caseId) }),
    ),
    // Les prochains numéros suivent ceux des données fictives (CLI-…-00048, DOS-…-00121, REC-…-00091).
    counters: { client: seed.counters.client, case: seed.counters.case, receipt: seed.counters.receipt },
  };
}
