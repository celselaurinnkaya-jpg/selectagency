import "server-only";
import { matchesBureau, parseBureauParam } from "@/features/bureaux/display";
import { bureauById } from "@/features/bureaux/display";
import { getAgencyContext } from "@/lib/auth/context";
import { allowed } from "@/lib/auth/permissions";
import { fetchRows, loadTables, readAgency } from "@/lib/data/agency";
import { DOCUMENT_FILE, toDocumentFile } from "@/lib/data/rows";
import type { CaseCategory, CaseStatus, StepKind } from "@/lib/domain/types";
import { chargeProgress } from "@/features/finance/calculations";
import { imageUrls } from "@/features/invoices/document";
import { loadInvoices, loadInvoiceSettings } from "@/features/invoices/queries";
import { loadQuotes, quoteTotal } from "@/features/quotes/queries";
import { loadMessageTemplates } from "@/features/communications/queries";
import { backOptions, forwardOptions, jumpOptions, requiresConfirmation } from "@/features/workflows/rules";
import { summarizeCase } from "./summary";
import { caseSummarySpec } from "./summary-document";
import { activeMembers } from "@/lib/domain/members";

export interface CaseFilters {
  q?: string;
  category?: CaseCategory;
  status?: CaseStatus | "all";
  destination?: string;
  waiting?: StepKind;
  /** Paramètre « ?bureau= » brut (bureau du client, vérifié ici). */
  bureau?: string;
}

const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export async function listCases(filters: CaseFilters) {
  const { data, now } = await readAgency({ cases: true, clients: true, steps: true, requirements: true, charges: true, payments: true });
  const query = filters.q ? normalize(filters.q.trim()) : "";
  const status = filters.status ?? "active";
  const bureau = parseBureauParam(filters.bureau, data.bureaux);

  const rows = data.cases
    .filter((c) => status === "all" || c.status === status)
    .filter((c) => !filters.category || c.category === filters.category)
    .filter((c) => !filters.destination || c.destinationCountry === filters.destination)
    .map((c) => summarizeCase(data, c, now))
    .filter((s) => !filters.waiting || s.waitingOn === filters.waiting)
    .filter((s) => matchesBureau(bureau, s.client.bureauId))
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
    bureaux: data.bureaux,
    bureau,
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

  // Rapport de re-test du 22/11 : la page d'un dossier mettait 10 s. Ces lectures ne dépendent que du dossier :
  // elles partent toutes en même temps au lieu de se suivre (un aller-retour avec la base au lieu de six).
  const requirementIds = data.requirements.map((r) => r.id);
  const financeRead = allowed(ctx, "finance.read");
  const [{ clients = [] }, quotes, invoices, files, { data: emailSettings }, messageTemplates] = await Promise.all([
    loadTables(ctx, { clients: (q) => q.eq("id", travelCase.clientId) }),
    financeRead ? loadQuotes(ctx, id) : Promise.resolve([]),
    financeRead ? loadInvoices(ctx, (q) => q.eq("case_id", id)) : Promise.resolve([]),
    // Fichiers des pièces : la RLS ne les montre qu'aux rôles qui peuvent ouvrir les documents.
    allowed(ctx, "documents.read") && requirementIds.length
      ? fetchRows(ctx, "document_files", DOCUMENT_FILE.list, (q) => q.in("requirement_id", requirementIds), ["created_at", "id"]).then((rows) => rows.map(toDocumentFile))
      : Promise.resolve([]),
    // E-mail « avancement du dossier » activé par l'agence (désactivé par défaut).
    ctx.supabase.from("email_settings").select("notify_case_status").eq("organization_id", ctx.organizationId).maybeSingle(),
    loadMessageTemplates(ctx),
  ]);
  data.clients = clients;

  const summary = summarizeCase(data, travelCase, now);
  const steps = [...data.steps].sort((a, b) => a.position - b.position);
  const payments = [...data.payments].sort((a, b) => a.paidAt.localeCompare(b.paidAt));
  const current = summary.current;

  return {
    summary,
    bureau: bureauById(data.bureaux, summary.client.bureauId),
    agency: data.agency,
    now,
    members: data.members,
    permissions: {
      write: allowed(ctx, "operations.write"),
      financeRead: allowed(ctx, "finance.read"),
      financeWrite: allowed(ctx, "finance.write"),
      documentsRead: allowed(ctx, "documents.read"),
    },
    organizationId: ctx.organizationId,
    notifyCaseStatus: Boolean(emailSettings?.notify_case_status),
    steps,
    transitions: current
      ? {
          forward: forwardOptions(steps, current),
          back: backOptions(steps, current),
          jump: jumpOptions(steps, current),
          outcomeKeys: steps.filter((s) => s.kind === "outcome").map((s) => s.key),
          closureKeys: steps.filter((s) => s.kind === "closure").map((s) => s.key),
          canSkip: current.isOptional,
          needsConfirmation: requiresConfirmation(current),
        }
      : null,
    requirements: data.requirements,
    files,
    appointments: [...data.appointments].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    tasks: [...data.tasks].sort((a, b) => a.dueAt.localeCompare(b.dueAt)),
    charges: chargeProgress(data.charges, payments),
    quotes: quotes.map((quote) => ({ quote, total: quoteTotal(quote) })),
    invoices,
    payments,
    expenses: data.expenses,
    events: [...data.events].sort((a, b) => b.at.localeCompare(a.at)),
    communications: [...data.communications].sort((a, b) => (b.occurredAt ?? b.at).localeCompare(a.occurredAt ?? a.at)),
    messageTemplates,
    canManageTemplates: allowed(ctx, "settings.manage"),
  };
}

export async function getCaseFormOptions(clientId?: string) {
  const { data } = await readAgency({ clients: true });
  return {
    clients: data.clients
      .filter((c) => !c.archivedAt)
      .sort((a, b) => a.lastName.localeCompare(b.lastName, "fr"))
      .map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName} (${c.reference})${c.status === "prospect" ? " — prospect, deviendra client" : ""}`, residenceCountry: c.residenceCountry })),
    members: activeMembers(data.members).filter((m) => m.role !== "accountant" && m.role !== "viewer"),
    currentMemberId: data.currentMemberId,
    preselectedClientId: data.clients.some((c) => c.id === clientId) ? clientId : undefined,
    currency: data.agency.currency,
  };
}

/**
 * Récapitulatif imprimable d'un dossier. La situation financière n'y figure que si elle est demandée
 * (au choix à chaque document) et que le rôle de la personne connectée permet de la voir.
 */
export async function getCaseSummaryDocument(id: string, withFinance: boolean) {
  const detail = await getCaseDetail(id);
  if (!detail) return null;
  const ctx = await getAgencyContext();
  const settings = await loadInvoiceSettings(ctx);
  const { summary, steps, requirements, appointments, agency, now, members, permissions } = detail;
  const { travelCase, client } = summary;
  const finance = withFinance && permissions.financeRead ? summary.finance : undefined;
  return {
    travelCase,
    client,
    settings,
    canSeeFinance: permissions.financeRead,
    withFinance: !!finance,
    images: imageUrls(settings),
    spec: caseSummarySpec({
      travelCase,
      client,
      steps,
      requirements,
      appointments,
      finance,
      advisor: members.find((m) => m.id === travelCase.assignedTo)?.fullName,
      agency,
      settings,
      now,
      isDemo: ctx.isDemo,
    }),
    // Clients fictifs de la démonstration : leur numéro ne doit jamais être contacté.
    phoneDigits: client.isDemoFixture ? undefined : (client.whatsappE164 ?? client.phoneE164).replace(/\D/g, ""),
    email: client.isDemoFixture ? undefined : client.email,
  };
}
