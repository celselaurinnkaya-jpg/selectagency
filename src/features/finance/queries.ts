import "server-only";
import { matchesBureau, parseBureauParam } from "@/features/bureaux/display";
import { bureauById } from "@/features/bureaux/display";
import { allowed } from "@/lib/auth/permissions";
import { loadTables, readAgency } from "@/lib/data/agency";
import { dayKey } from "@/lib/format";
import { lastMonths, resolvePeriod } from "@/lib/period";
import { summarizeCase } from "@/features/cases/summary";
import { imageUrls, isOverdue } from "@/features/invoices/document";
import { loadInvoices, loadInvoiceSettings } from "@/features/invoices/queries";
import { agencyFinance } from "./calculations";
import { documentFromPayment } from "./receipt";
import { activeMembers } from "@/lib/domain/members";
import type { AgencyContext } from "@/lib/auth/context";
import type { Bureau, Client, Expense, Payment } from "@/lib/domain/types";
import { campaignStats } from "@/features/communications/campaigns";

/** Montants par devise (une agence peut encaisser en XAF et en EUR : jamais de conversion). */
function sumByCurrency<T>(items: T[], currency: (item: T) => string, amount: (item: T) => number) {
  const sums = new Map<string, number>();
  for (const item of items) sums.set(currency(item), (sums.get(currency(item)) ?? 0) + amount(item));
  return [...sums].sort(([a], [b]) => a.localeCompare(b)).map(([code, amountMinor]) => ({ currency: code, amountMinor }));
}

export async function getFinanceOverview(periodKey?: string) {
  const { data, now, ctx } = await readAgency({ cases: true, clients: true, steps: true, requirements: true, charges: true, payments: true, expenses: true });
  const tz = data.agency.timezone;
  const period = resolvePeriod(periodKey, now, tz);
  const canSeeFinance = allowed(ctx, "finance.read");
  const summaries = data.cases.map((c) => summarizeCase(data, c, now));
  const balances = summaries.filter((s) => s.finance.balanceMinor > 0).sort((a, b) => b.finance.balanceMinor - a.finance.balanceMinor);

  // Encaissements et dépenses de la période. Le reste à recevoir des dossiers s'affiche aussi pour une
  // devise sans aucun paiement ni dépense : avant, la page disait « Aucun mouvement » et le cachait.
  const movements = agencyFinance(data.charges, data.payments, data.expenses, period);
  const currencies = [...new Set([...movements.map((t) => t.currency), ...balances.map((b) => b.finance.currency)])].sort();
  const totals = currencies.map((currency) => {
    const t = movements.find((m) => m.currency === currency);
    return {
      currency,
      receivedMinor: t?.receivedMinor ?? 0,
      agencyRevenueMinor: t?.agencyRevenueMinor ?? 0,
      thirdPartyReceivedMinor: t?.thirdPartyReceivedMinor ?? 0,
      operatingExpensesMinor: t?.operatingExpensesMinor ?? 0,
      disbursementsMinor: t?.disbursementsMinor ?? 0,
      estimatedMarginMinor: t?.estimatedMarginMinor ?? 0,
      thirdPartyHeldMinor: t?.thirdPartyHeldMinor ?? 0,
      hasMovements: Boolean(t),
      balanceDueMinor: balances.filter((b) => b.finance.currency === currency).reduce((sum, b) => sum + b.finance.balanceMinor, 0),
    };
  });

  return {
    agency: data.agency,
    isDemo: ctx.isDemo,
    now,
    period,
    canSeeFinance,
    totals,
    balances,
    ...(await loadFinanceWatch(ctx, data.payments, data.clients, now, tz, data.expenses)),
  };
}

/**
 * À surveiller en premier (Synthèse et tableau de bord) : paiements annoncés pas encore vérifiés, factures
 * émises pas encore payées, et les plus anciennes factures en retard.
 */
export async function loadFinanceWatch(ctx: AgencyContext, payments: Payment[], clients: Client[], now: Date, tz: string, expenses: Expense[] = []) {
  const pending = payments.filter((p) => p.status === "pending");
  // Dépenses saisies par un membre, en attente de la validation du propriétaire (hors des chiffres d'ici là).
  const expensesToValidate = expenses.filter((e) => e.approvalStatus === "pending");
  const today = dayKey(now, tz);
  const unpaid = allowed(ctx, "finance.read") ? await loadInvoices(ctx, (q) => q.eq("status", "issued")) : [];
  const overdue = unpaid.filter((invoice) => isOverdue(invoice.status, invoice.dueDate, today)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return {
    pendingPayments: { count: pending.length, totals: sumByCurrency(pending, (p) => p.currency, (p) => p.amountMinor) },
    pendingExpenses: { count: expensesToValidate.length, totals: sumByCurrency(expensesToValidate, (e) => e.currency, (e) => e.amountMinor) },
    unpaidInvoices: {
      count: unpaid.length,
      totals: sumByCurrency(unpaid, (i) => i.currency, (i) => i.totalMinor),
      overdueCount: overdue.length,
      overdue: overdue.slice(0, 5).map((invoice) => ({ invoice, client: clients.find((c) => c.id === invoice.clientId) })),
    },
  };
}

export type FinanceWatch = Awaited<ReturnType<typeof loadFinanceWatch>>;

export type PaymentFilter = "tous" | "a-verifier" | "confirmes" | "annules";

const PAYMENT_FILTERS: Record<PaymentFilter, (p: Payment) => boolean> = {
  tous: () => true,
  "a-verifier": (p) => p.status === "pending",
  confirmes: (p) => p.status === "recorded",
  annules: (p) => p.status === "voided",
};

export const isPaymentFilter = (value: unknown): value is PaymentFilter => typeof value === "string" && value in PAYMENT_FILTERS;

export async function listPayments(filter: PaymentFilter = "tous", bureauParam?: string) {
  const { data: all, ctx } = await readAgency({ payments: true, clients: true, cases: true });
  // Bureau où le paiement a été encaissé.
  const bureau = parseBureauParam(bureauParam, all.bureaux);
  const data = { ...all, payments: all.payments.filter((p) => matchesBureau(bureau, p.bureauId)) };
  const count = (f: PaymentFilter) => data.payments.filter(PAYMENT_FILTERS[f]).length;
  // Montant à vérifier, par devise (une agence peut encaisser en XAF et en EUR).
  const pendingTotals = new Map<string, number>();
  for (const p of data.payments) if (p.status === "pending") pendingTotals.set(p.currency, (pendingTotals.get(p.currency) ?? 0) + p.amountMinor);
  return {
    agency: data.agency,
    bureaux: data.bureaux,
    bureau,
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

const normalizeText = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** « Nouveau paiement » : choix du dossier (un paiement s'enregistre toujours dans un dossier). Dossiers non annulés
 *  qui ont un reste à payer, puis les autres dossiers en cours (prestations encore à saisir). */
export async function listCasesToCollect(q?: string) {
  const { data, ctx, now } = await readAgency({ cases: true, clients: true, steps: true, requirements: true, charges: true, payments: true });
  const query = q ? normalizeText(q.trim()) : "";
  const rows = data.cases
    .filter((c) => c.status !== "cancelled")
    .map((c) => summarizeCase(data, c, now))
    .filter((s) => s.travelCase.status === "active" || s.finance.balanceMinor > 0)
    .filter((s) => !query || normalizeText(`${s.travelCase.reference} ${s.travelCase.title} ${s.client.firstName} ${s.client.lastName}`).includes(query))
    .sort((a, b) => Number(b.finance.balanceMinor > 0) - Number(a.finance.balanceMinor > 0) || b.travelCase.openedAt.localeCompare(a.travelCase.openedAt));
  return {
    canSeeFinance: allowed(ctx, "finance.read"),
    canWrite: allowed(ctx, "finance.write"),
    total: rows.length,
    rows: rows.slice(0, 60),
  };
}

export async function listExpenses() {
  const { data, ctx, now } = await readAgency({ expenses: true, cases: true });
  // Seuil du justificatif obligatoire (vide = jamais obligatoire), réglé par le propriétaire ou un administrateur.
  const { data: settings } = await ctx.supabase.from("expense_settings").select("receipt_required_above_minor").eq("organization_id", ctx.organizationId).maybeSingle();
  const threshold = settings?.receipt_required_above_minor;
  return {
    agency: data.agency,
    isDemo: ctx.isDemo,
    now,
    organizationId: ctx.organizationId,
    canSeeFinance: allowed(ctx, "finance.read"),
    canWrite: allowed(ctx, "finance.write"),
    // Seul le propriétaire valide les dépenses saisies par les autres membres.
    isOwner: ctx.member.role === "owner",
    canManageSettings: allowed(ctx, "settings.manage"),
    receiptRequiredAboveMinor: threshold === null || threshold === undefined ? undefined : Number(threshold),
    pendingCount: data.expenses.filter((e) => e.approvalStatus === "pending").length,
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
          bureau: bureauById(data.bureaux, payment.bureauId ?? client.bureauId),
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
    isDemo: ctx.isDemo,
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
    byBureau: data.bureaux.length === 0
      ? []
      : [...data.bureaux.map((b) => ({ bureau: b as Bureau | undefined, id: b.id as string | undefined })), { bureau: undefined, id: undefined }]
          .map(({ bureau, id }) => {
            const clientIds = new Set(data.clients.filter((c) => c.bureauId === id).map((c) => c.id));
            const received = new Map<string, number>();
            for (const p of data.payments) {
              if (p.status === "recorded" && p.bureauId === id && inPeriod(p.paidAt)) received.set(p.currency, (received.get(p.currency) ?? 0) + p.amountMinor);
            }
            return {
              bureau,
              newContacts: data.clients.filter((c) => c.bureauId === id && inPeriod(c.registeredAt)).length,
              openedCases: opened.filter((c) => clientIds.has(c.clientId)).length,
              activeCases: active.filter((s) => clientIds.has(s.client.id)).length,
              received: [...received].map(([currency, amountMinor]) => ({ currency, amountMinor })),
            };
          })
          .filter((row) => row.bureau ? !row.bureau.archived || row.newContacts + row.openedCases + row.activeCases + row.received.length > 0 : row.newContacts + row.openedCases + row.activeCases + row.received.length > 0),
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
