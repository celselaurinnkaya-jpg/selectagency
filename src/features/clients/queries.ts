import "server-only";
import { can } from "@/lib/auth/permissions";
import { loadTables, readAgency } from "@/lib/data/agency";
import { CLIENT_SENSITIVE } from "@/lib/data/rows";
import type { ClientType } from "@/lib/domain/types";
import { summarizeCase } from "@/features/cases/summary";

export interface ClientFilters {
  q?: string;
  type?: ClientType;
  country?: string;
}

const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export async function listClients(filters: ClientFilters) {
  const { data, now, ctx } = await readAgency({ clients: true, cases: true, events: true, steps: true, requirements: true, charges: true, payments: true });
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
    canWrite: can(ctx.member.role, "operations.write"),
    canDelete: can(ctx.member.role, "client.delete"),
    canSeeFinance: can(ctx.member.role, "finance.read"),
    countries: [...new Set(data.clients.map((c) => c.residenceCountry))],
    total: data.clients.filter((c) => !c.archivedAt).length,
  };
}

export async function getClientDetail(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, now, ctx } = await readAgency({
    clients: (q) => q.eq("id", id),
    cases: (q) => q.eq("client_id", id),
    appointments: (q) => q.eq("client_id", id),
    payments: (q) => q.eq("client_id", id),
    events: (q) => q.eq("client_id", id),
    communications: (q) => q.eq("client_id", id),
  });
  const client = data.clients[0];
  if (!client) return null;

  // Étapes, pièces et prestations des dossiers du client (pour les soldes et les pièces manquantes).
  const caseIds = data.cases.map((k) => k.id);
  if (caseIds.length) {
    const related = await loadTables(ctx, {
      steps: (q) => q.in("case_id", caseIds),
      requirements: (q) => q.in("case_id", caseIds),
      charges: (q) => q.in("case_id", caseIds),
    });
    Object.assign(data, related);
  }

  // Le numéro complet de la pièce d'identité n'est demandé que si le rôle permet de le lire.
  if (can(ctx.member.role, "client.sensitive.read")) {
    const { data: sensitive, error } = await ctx.supabase.from("client_sensitive").select(CLIENT_SENSITIVE.list).eq("client_id", id).maybeSingle();
    if (error) throw new Error(`Lecture impossible (client_sensitive) : ${error.message}`);
    if (sensitive?.id_doc_number) client.idDocNumber = String(sensitive.id_doc_number);
  }

  const cases = data.cases;
  return {
    client,
    agency: data.agency,
    now,
    advisor: data.members.find((m) => m.id === client.assignedTo),
    members: data.members,
    permissions: {
      write: can(ctx.member.role, "operations.write"),
      delete: can(ctx.member.role, "client.delete"),
      financeRead: can(ctx.member.role, "finance.read"),
    },
    cases: cases.map((k) => summarizeCase(data, k, now)).sort((a, b) => b.travelCase.openedAt.localeCompare(a.travelCase.openedAt)),
    requirements: data.requirements,
    appointments: [...data.appointments].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    payments: [...data.payments].sort((a, b) => b.paidAt.localeCompare(a.paidAt)),
    events: [...data.events].sort((a, b) => b.at.localeCompare(a.at)),
    communications: [...data.communications].sort((a, b) => b.at.localeCompare(a.at)),
    caseReferences: new Map(cases.map((k) => [k.id, k.reference])),
  };
}
