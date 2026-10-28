import "server-only";
import { readDb } from "@/lib/demo/store";
import type { ClientType } from "@/lib/domain/types";
import { summarizeCase } from "@/features/cases/summary";

export interface ClientFilters {
  q?: string;
  type?: ClientType;
  country?: string;
}

const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export async function listClients(filters: ClientFilters) {
  const { data, now } = await readDb();
  const query = filters.q ? normalize(filters.q.trim()) : "";
  const digits = filters.q?.replace(/\D/g, "") ?? "";

  const rows = data.clients
    .filter((c) => !c.archivedAt)
    .filter((c) => !filters.type || c.clientType === filters.type)
    .filter((c) => !filters.country || c.residenceCountry === filters.country)
    .filter((c) => {
      if (!query) return true;
      const text = normalize(`${c.firstName} ${c.lastName} ${c.reference} ${c.email ?? ""} ${c.city}`);
      return text.includes(query) || (digits.length >= 4 && c.phoneE164.replace(/\D/g, "").includes(digits));
    })
    .map((client) => {
      const cases = data.cases.filter((k) => k.clientId === client.id);
      const lastEvent = data.events.filter((e) => e.clientId === client.id).sort((a, b) => b.at.localeCompare(a.at))[0];
      const balances = cases.map((k) => summarizeCase(data, k, now).finance);
      return {
        client,
        advisor: data.members.find((m) => m.id === client.assignedTo),
        casesCount: cases.length,
        activeCases: cases.filter((k) => k.status === "active").length,
        balanceMinor: balances.reduce((total, f) => total + f.balanceMinor, 0),
        lastActivityAt: lastEvent?.at ?? client.registeredAt,
      };
    })
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));

  return {
    rows,
    agency: data.agency,
    now,
    countries: [...new Set(data.clients.map((c) => c.residenceCountry))],
    total: data.clients.filter((c) => !c.archivedAt).length,
  };
}

export async function getClientDetail(id: string) {
  const { data, now } = await readDb();
  const client = data.clients.find((c) => c.id === id);
  if (!client) return null;
  const cases = data.cases.filter((k) => k.clientId === id);
  const caseIds = new Set(cases.map((k) => k.id));
  return {
    client,
    agency: data.agency,
    now,
    advisor: data.members.find((m) => m.id === client.assignedTo),
    members: data.members,
    cases: cases.map((k) => summarizeCase(data, k, now)).sort((a, b) => b.travelCase.openedAt.localeCompare(a.travelCase.openedAt)),
    requirements: data.requirements.filter((r) => caseIds.has(r.caseId)),
    appointments: data.appointments.filter((a) => a.clientId === id).sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    payments: data.payments.filter((p) => p.clientId === id).sort((a, b) => b.paidAt.localeCompare(a.paidAt)),
    events: data.events.filter((e) => e.clientId === id).sort((a, b) => b.at.localeCompare(a.at)),
    communications: data.communications.filter((c) => c.clientId === id).sort((a, b) => b.at.localeCompare(a.at)),
    caseReferences: new Map(cases.map((k) => [k.id, k.reference])),
  };
}
