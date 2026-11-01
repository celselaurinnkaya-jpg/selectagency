import "server-only";
import { getAgencyContext, type AgencyContext } from "@/lib/auth/context";
import { allowed, can, forbiddenMessage } from "@/lib/auth/permissions";
import { fetchRows, loadTables, readAgency, type Filter } from "@/lib/data/agency";
import { INVOICE, INVOICE_ITEM, INVOICE_SETTINGS, toInvoice, toInvoiceItem, toInvoiceSettings } from "@/lib/data/rows";
import type { Invoice, InvoiceSettings, InvoiceStatus } from "@/lib/domain/types";
import { dayKey } from "@/lib/format";
import { loadServices } from "@/features/services/queries";
import { caseLabel, documentFromInvoice, imageUrls, isOverdue, issuerParty, recipientParty } from "./document";

// Factures de l'agence : lisibles par les rôles qui voient la finance (comme les devis).

const UUID = /^[0-9a-f-]{36}$/i;

export async function loadInvoiceSettings(ctx: AgencyContext): Promise<InvoiceSettings> {
  const { data, error } = await ctx.supabase.from("invoice_settings").select(INVOICE_SETTINGS.list).eq("organization_id", ctx.organizationId).maybeSingle();
  if (error) throw new Error(`Lecture des réglages des factures impossible : ${error.message}`);
  return toInvoiceSettings(data);
}

/** Plus récentes d'abord (date d'émission, puis numéro). Les lignes ne sont lues que sur demande. */
export async function loadInvoices(ctx: AgencyContext, filter?: Filter, withItems = false): Promise<Invoice[]> {
  const rows = await fetchRows(ctx, "invoices", INVOICE.list, filter, ["created_at", "id"]);
  const items =
    withItems && rows.length
      ? (await fetchRows(ctx, "invoice_items", INVOICE_ITEM.list, (q) => q.in("invoice_id", rows.map((r) => String(r.id))), ["invoice_id", "position"])).map(toInvoiceItem)
      : [];
  return rows
    .map((r) => toInvoice(r, items.filter((i) => i.invoiceId === String(r.id))))
    .sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.number.localeCompare(a.number));
}

export type InvoiceFilter = "all" | InvoiceStatus | "overdue";

export async function listInvoices(filter: InvoiceFilter) {
  const { data, ctx, now } = await readAgency({ clients: true });
  const canSeeFinance = allowed(ctx, "finance.read");
  const invoices = canSeeFinance ? await loadInvoices(ctx) : [];
  const today = dayKey(now, data.agency.timezone);
  const all = invoices.map((invoice) => ({
    invoice,
    overdue: isOverdue(invoice.status, invoice.dueDate, today),
    client: data.clients.find((c) => c.id === invoice.clientId),
  }));
  // Reste à encaisser sur les factures émises, par devise (une agence peut facturer en XAF et en EUR).
  const outstanding = new Map<string, { totalMinor: number; overdueMinor: number }>();
  for (const { invoice, overdue } of all) {
    if (invoice.status !== "issued") continue;
    const sum = outstanding.get(invoice.currency) ?? { totalMinor: 0, overdueMinor: 0 };
    sum.totalMinor += invoice.totalMinor;
    if (overdue) sum.overdueMinor += invoice.totalMinor;
    outstanding.set(invoice.currency, sum);
  }
  return {
    agency: data.agency,
    canSeeFinance,
    canWrite: allowed(ctx, "finance.write"),
    rows: all.filter((r) => filter === "all" || (filter === "overdue" ? r.overdue : r.invoice.status === filter)),
    counts: {
      all: all.length,
      draft: all.filter((r) => r.invoice.status === "draft").length,
      issued: all.filter((r) => r.invoice.status === "issued").length,
      overdue: all.filter((r) => r.overdue).length,
      paid: all.filter((r) => r.invoice.status === "paid").length,
      cancelled: all.filter((r) => r.invoice.status === "cancelled").length,
    },
    outstanding: [...outstanding].map(([currency, sums]) => ({ currency, ...sums })),
  };
}

async function readInvoice(ctx: AgencyContext, id: string): Promise<Invoice | null> {
  const [row] = await fetchRows(ctx, "invoices", INVOICE.list, (q) => q.eq("id", id));
  if (!row) return null;
  const items = (await fetchRows(ctx, "invoice_items", INVOICE_ITEM.list, (q) => q.eq("invoice_id", id), ["position"])).map(toInvoiceItem);
  return toInvoice(row, items);
}

export async function getInvoice(id: string) {
  if (!UUID.test(id)) return null;
  const { data, ctx, now } = await readAgency({});
  if (!allowed(ctx, "finance.read")) return null;
  const invoice = await readInvoice(ctx, id);
  if (!invoice) return null;
  const caseId = invoice.caseId;
  const [{ clients = [], cases = [] }, settings] = await Promise.all([
    loadTables(ctx, { clients: (q) => q.eq("id", invoice.clientId), ...(caseId ? { cases: (q) => q.eq("id", caseId) } : {}) }),
    loadInvoiceSettings(ctx),
  ]);
  const client = clients[0]!;
  const travelCase = cases[0];
  return {
    invoice,
    client,
    travelCase,
    settings,
    agency: data.agency,
    document: documentFromInvoice({ invoice, client, travelCase, agency: data.agency, settings, isDemo: ctx.isDemo, today: dayKey(now, data.agency.timezone) }),
    images: imageUrls(settings),
    author: data.members.find((m) => m.id === invoice.createdBy),
    canWrite: allowed(ctx, "finance.write"),
    canDelete: allowed(ctx, "invoice.delete"),
    // Clients fictifs de la démonstration : leur numéro ne doit jamais être contacté.
    phoneDigits: client.isDemoFixture ? undefined : (client.whatsappE164 ?? client.phoneE164).replace(/\D/g, ""),
  };
}

/** Données du formulaire : création (avec client ou dossier proposés) ou modification d'une facture. */
export async function getInvoiceEditor(input: { invoiceId?: string; clientId?: string; caseId?: string }) {
  if (input.invoiceId && !UUID.test(input.invoiceId)) return null;
  const { data, ctx, now } = await readAgency({ clients: true, cases: true });
  if (!allowed(ctx, "finance.write")) return { forbidden: forbiddenMessage(ctx, "finance.write") } as const;
  const [invoice, settings, services] = await Promise.all([
    input.invoiceId ? readInvoice(ctx, input.invoiceId) : null,
    loadInvoiceSettings(ctx),
    loadServices(ctx),
  ]);
  if (input.invoiceId && !invoice) return null;

  const tz = data.agency.timezone;
  const today = dayKey(now, tz);
  const clients = data.clients
    .filter((c) => !c.archivedAt || c.id === invoice?.clientId)
    .sort((a, b) => a.lastName.localeCompare(b.lastName, "fr"))
    .map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName} (${c.reference})`, party: recipientParty(c) }));
  const cases = data.cases
    .filter((c) => c.status !== "cancelled" || c.id === invoice?.caseId)
    .map((c) => ({ id: c.id, clientId: c.clientId, label: caseLabel(c), currency: c.billingCurrency }));

  // Proposé depuis un dossier ou une fiche client : le dossier impose son client et sa devise.
  const proposedCase = cases.find((c) => c.id === input.caseId);
  const proposedClient = clients.find((c) => c.id === (proposedCase?.clientId ?? input.clientId));
  const dueDefault = dayKey(new Date(now.getTime() + 14 * 86_400_000), tz);

  return {
    clients,
    cases,
    settings,
    issuer: issuerParty(data.agency, settings),
    images: imageUrls(settings),
    isDemo: ctx.isDemo,
    invoice: invoice ?? undefined,
    // Services de l'agence, pour remplir une ligne en un clic (nom et tarif indicatif).
    services: services.filter((s) => s.isActive).map((s) => ({ id: s.id, name: s.name, priceMinor: s.priceMinor, currency: s.currency })),
    defaults: {
      clientId: invoice?.clientId ?? proposedClient?.id ?? "",
      caseId: invoice?.caseId ?? proposedCase?.id ?? "",
      currency: invoice?.currency ?? proposedCase?.currency ?? data.agency.currency,
      issueDate: invoice?.issueDate ?? today,
      dueDate: invoice?.dueDate ?? dueDefault,
      paymentDetails: invoice ? (invoice.paymentDetails ?? "") : settings.paymentDetails,
    },
  };
}

/** Paramètres > Factures : coordonnées et images, modifiables par le propriétaire et les administrateurs. */
export async function getInvoiceSettingsPage() {
  const ctx = await getAgencyContext();
  const settings = allowed(ctx, "finance.read") ? await loadInvoiceSettings(ctx) : toInvoiceSettings(null);
  return {
    agency: ctx.agency,
    organizationId: ctx.organizationId,
    settings,
    images: imageUrls(settings),
    canManage: allowed(ctx, "settings.manage"),
    readOnly: can(ctx.member.role, "settings.manage") && !ctx.writable,
  };
}

export type InvoiceEditorData =Exclude<NonNullable<Awaited<ReturnType<typeof getInvoiceEditor>>>, { forbidden: string }>;
