import "server-only";
import { getAgencyContext, type AgencyContext } from "@/lib/auth/context";
import type { AgencyData, Member, Payment } from "@/lib/domain/types";
import {
  ALLOCATION,
  APPOINTMENT,
  CASE,
  CHARGE,
  CLIENT,
  COMMUNICATION,
  EVENT,
  EXPENSE,
  MEMBER,
  PAYMENT,
  REQUIREMENT,
  STEP,
  TASK,
  toAllocation,
  toAppointment,
  toCase,
  toCharge,
  toClient,
  toCommunication,
  toEvent,
  toExpense,
  toMember,
  toPayment,
  toRequirement,
  toStep,
  toTask,
} from "./rows";

// Lecture des données de l'agence connectée. Chaque écran indique les tables dont il a besoin
// (et, au besoin, un filtre : un dossier, un client) ; la RLS limite tout à l'agence de la personne.
// Les calculs (soldes, retards, files « à traiter ») restent dans les fonctions métier, testées.
//
// Limite connue : les listes complètes sont chargées puis filtrées côté serveur. C'est adapté à une
// agence de quelques milliers de clients ; au-delà, il faudra paginer et calculer en SQL (vues).

export type AgencyTable = Exclude<keyof AgencyData, "agency" | "currentMemberId" | "members">;

// Type d'une lecture en cours de construction (lignes non typées, converties ensuite par rows.ts).
const selectQuery = (ctx: AgencyContext, table: string, columns: string) => ctx.supabase.from(table).select(columns as "*");
type Select = ReturnType<typeof selectQuery>;
/** Filtre ajouté à la requête (ex. q => q.eq("case_id", id)). */
export type Filter = (query: Select) => Select;
export type TablePlan = Partial<Record<AgencyTable, true | Filter>>;

const SOURCES = {
  clients: { table: "clients", columns: CLIENT.list, map: toClient },
  cases: { table: "cases", columns: CASE.list, map: toCase },
  steps: { table: "case_steps", columns: STEP.list, map: toStep },
  // Pièces et prestations : dans l'ordre de création (ordre de la checklist, ordre convenu).
  requirements: { table: "document_requirements", columns: REQUIREMENT.list, map: toRequirement, order: ["created_at", "id"] },
  appointments: { table: "appointments", columns: APPOINTMENT.list, map: toAppointment },
  tasks: { table: "tasks", columns: TASK.list, map: toTask },
  charges: { table: "charges", columns: CHARGE.list, map: toCharge, order: ["created_at", "id"] },
  expenses: { table: "expenses", columns: EXPENSE.list, map: toExpense },
  events: { table: "activity_events", columns: EVENT.list, map: toEvent },
  communications: { table: "communication_logs", columns: COMMUNICATION.list, map: toCommunication },
} as const;

const ROLE_ORDER: Record<Member["role"], number> = { owner: 0, admin: 1, agent: 2, accountant: 3, viewer: 4 };

/** Supabase renvoie au plus 1 000 lignes par requête : on lit page par page. */
const PAGE_SIZE = 1000;

export async function fetchRows(
  ctx: AgencyContext,
  table: string,
  columns: string,
  filter?: Filter,
  order: readonly string[] = ["id"],
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = selectQuery(ctx, table, columns);
    if (filter) query = filter(query);
    // Un ordre stable est indispensable pour que les pages ne se chevauchent pas.
    for (const column of order) query = query.order(column);
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Lecture impossible (${table}) : ${error.message}`);
    const page = (data ?? []) as unknown as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function loadPayments(ctx: AgencyContext, filter?: Filter): Promise<Payment[]> {
  const paymentRows = await fetchRows(ctx, "payments", PAYMENT.list, filter);
  if (paymentRows.length === 0) return [];
  const ids = paymentRows.map((r) => String(r.id));
  // Sans filtre, toutes les affectations de l'agence ; sinon, celles des paiements lus (par lots).
  const allocationRows = filter
    ? (await Promise.all(chunk(ids, 150).map((part) => fetchRows(ctx, "payment_allocations", ALLOCATION.list, (q) => q.in("payment_id", part))))).flat()
    : await fetchRows(ctx, "payment_allocations", ALLOCATION.list);
  const byPayment = new Map<string, ReturnType<typeof toAllocation>[]>();
  for (const row of allocationRows) {
    const allocation = toAllocation(row);
    byPayment.set(allocation.paymentId, [...(byPayment.get(allocation.paymentId) ?? []), allocation]);
  }
  return paymentRows.map((row) =>
    toPayment(row, (byPayment.get(String(row.id)) ?? []).map(({ chargeId, amountMinor }) => ({ chargeId, amountMinor }))),
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const parts: T[][] = [];
  for (let i = 0; i < items.length; i += size) parts.push(items.slice(i, i + size));
  return parts;
}

const EMPTY: Omit<AgencyData, "agency" | "currentMemberId" | "members"> = {
  clients: [],
  cases: [],
  steps: [],
  requirements: [],
  appointments: [],
  tasks: [],
  charges: [],
  payments: [],
  expenses: [],
  events: [],
  communications: [],
};

export async function loadTables(ctx: AgencyContext, plan: TablePlan): Promise<Partial<Omit<AgencyData, "agency" | "currentMemberId" | "members">>> {
  const entries = await Promise.all(
    (Object.entries(plan) as [AgencyTable, true | Filter][]).map(async ([key, spec]) => {
      const filter = spec === true ? undefined : spec;
      if (key === "payments") return [key, await loadPayments(ctx, filter)] as const;
      const source = SOURCES[key];
      const rows = await fetchRows(ctx, source.table, source.columns, filter, "order" in source ? source.order : undefined);
      return [key, rows.map((row) => source.map(row))] as const;
    }),
  );
  return Object.fromEntries(entries);
}

/** Lecture à la requête : la session (cookies) rend la page dynamique, sous un <Suspense>. */
export async function readAgency(plan: TablePlan): Promise<{ data: AgencyData; now: Date; ctx: AgencyContext }> {
  const ctx = await getAgencyContext();
  const [memberRows, tables] = await Promise.all([fetchRows(ctx, "members", MEMBER.list), loadTables(ctx, plan)]);
  return {
    ctx,
    now: new Date(),
    data: {
      agency: ctx.agency,
      currentMemberId: ctx.member.id,
      members: memberRows.map(toMember).sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.fullName.localeCompare(b.fullName, "fr")),
      ...EMPTY,
      ...tables,
    },
  };
}
