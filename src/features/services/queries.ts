import "server-only";
import { getAgencyContext, type AgencyContext } from "@/lib/auth/context";
import { allowed } from "@/lib/auth/permissions";
import { fetchRows, readAgency, type Filter } from "@/lib/data/agency";
import {
  SERVICE, SERVICE_BOOKING, SERVICE_CLIENT, SERVICE_CLIENT_STEP, SERVICE_STEP, toService, toServiceBooking, toServiceClient, toServiceClientStep, toServiceStep,
} from "@/lib/data/rows";
import type { AgencyService, Charge, Payment, ServiceBooking, ServiceClient, ServiceClientStatus, ServiceClientStep, ServiceStep, TravelCase } from "@/lib/domain/types";
import { caseFinance } from "@/features/finance/calculations";
import { imageUrls } from "@/features/invoices/document";
import { loadInvoiceSettings } from "@/features/invoices/queries";
import { bookingSpec } from "./booking-document";

// Services de l'agence et clients suivis dans chacun. Lisibles par tous les membres ; les soldes des
// clients ne sont calculés que pour les rôles qui voient la finance.

const UUID = /^[0-9a-f-]{36}$/i;

/** Ordre d'affichage : ce qui demande une action d'abord, puis ce qui est terminé ou annulé. */
export const SERVICE_STATUS_ORDER: ServiceClientStatus[] = ["in_progress", "waiting_client", "waiting_external", "completed", "cancelled"];
const ACTIVE = new Set<ServiceClientStatus>(["in_progress", "waiting_client", "waiting_external"]);

export async function loadServices(ctx: AgencyContext): Promise<AgencyService[]> {
  const rows = await fetchRows(ctx, "services", SERVICE.list);
  return rows.map(toService).sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export async function loadServiceClients(ctx: AgencyContext, filter?: Filter): Promise<ServiceClient[]> {
  return (await fetchRows(ctx, "service_clients", SERVICE_CLIENT.list, filter)).map(toServiceClient);
}

/** Étapes d'un service, dans l'ordre. */
export async function loadServiceSteps(ctx: AgencyContext, serviceId: string): Promise<ServiceStep[]> {
  return (await fetchRows(ctx, "service_steps", SERVICE_STEP.list, (q) => q.eq("service_id", serviceId), ["position"])).map(toServiceStep);
}

/** Étapes de chaque client suivi (lues par paquets : une liste d'identifiants trop longue ne passe pas dans l'adresse). */
async function loadLinkSteps(ctx: AgencyContext, linkIds: string[]): Promise<Map<string, ServiceClientStep[]>> {
  const byLink = new Map<string, ServiceClientStep[]>();
  for (let i = 0; i < linkIds.length; i += 80) {
    const chunk = linkIds.slice(i, i + 80);
    const rows = await fetchRows(ctx, "service_client_steps", SERVICE_CLIENT_STEP.list, (q) => q.in("service_client_id", chunk), ["service_client_id", "position"]);
    for (const step of rows.map(toServiceClientStep)) byLink.set(step.serviceClientId, [...(byLink.get(step.serviceClientId) ?? []), step]);
  }
  return byLink;
}

/** Confirmations de réservation de chaque client suivi (lues par paquets, comme les étapes). */
async function loadLinkBookings(ctx: AgencyContext, linkIds: string[]): Promise<Map<string, ServiceBooking[]>> {
  const byLink = new Map<string, ServiceBooking[]>();
  for (let i = 0; i < linkIds.length; i += 80) {
    const chunk = linkIds.slice(i, i + 80);
    const rows = await fetchRows(ctx, "service_bookings", SERVICE_BOOKING.list, (q) => q.in("service_client_id", chunk), ["created_at", "id"]);
    for (const b of rows.map(toServiceBooking)) byLink.set(b.serviceClientId, [...(byLink.get(b.serviceClientId) ?? []), b]);
  }
  return byLink;
}

export interface StepProgress {
  steps: ServiceClientStep[];
  done: number;
  total: number;
  /** Première étape pas encore faite. */
  next?: ServiceClientStep;
}

export function progressOf(steps: ServiceClientStep[] = []): StepProgress {
  return { steps, done: steps.filter((s) => s.doneAt).length, total: steps.length, next: steps.find((s) => !s.doneAt) };
}

export type ServiceCounts = Record<ServiceClientStatus, number> & { total: number; active: number };

export function countByStatus(links: ServiceClient[]): ServiceCounts {
  const counts = { in_progress: 0, waiting_client: 0, waiting_external: 0, completed: 0, cancelled: 0, total: links.length, active: 0 };
  for (const link of links) {
    counts[link.status] += 1;
    if (ACTIVE.has(link.status)) counts.active += 1;
  }
  return counts;
}

/** Reste à payer du client, tous dossiers confondus, par devise (jamais d'addition entre devises). */
function clientBalances(cases: TravelCase[], charges: Charge[], payments: Payment[]) {
  const byCurrency = new Map<string, { agreedMinor: number; balanceMinor: number }>();
  for (const k of cases) {
    const f = caseFinance(k.billingCurrency, charges.filter((c) => c.caseId === k.id), payments.filter((p) => p.caseId === k.id));
    const sum = byCurrency.get(f.currency) ?? { agreedMinor: 0, balanceMinor: 0 };
    sum.agreedMinor += f.agreedMinor;
    sum.balanceMinor += f.balanceMinor;
    byCurrency.set(f.currency, sum);
  }
  return [...byCurrency].filter(([, s]) => s.agreedMinor > 0).map(([currency, s]) => ({ currency, ...s }));
}

export async function listServices() {
  const ctx = await getAgencyContext();
  const [services, links] = await Promise.all([loadServices(ctx), loadServiceClients(ctx)]);
  return {
    services: services.map((service) => ({ service, counts: countByStatus(links.filter((l) => l.serviceId === service.id)) })),
    totals: countByStatus(links),
    clientsFollowed: new Set(links.filter((l) => ACTIVE.has(l.status)).map((l) => l.clientId)).size,
    canManage: allowed(ctx, "services.manage"),
  };
}

export async function getService(id: string) {
  if (!UUID.test(id)) return null;
  const ctx = await getAgencyContext();
  const [serviceRow] = await fetchRows(ctx, "services", SERVICE.list, (q) => q.eq("id", id));
  if (!serviceRow) return null;
  const service = toService(serviceRow);
  const financeRead = allowed(ctx, "finance.read");
  const canEnroll = allowed(ctx, "operations.write");

  const [links, { data, now }, steps] = await Promise.all([
    loadServiceClients(ctx, (q) => q.eq("service_id", id)),
    readAgency({ clients: true, cases: true, ...(financeRead ? { charges: true, payments: true } : {}) }),
    loadServiceSteps(ctx, id),
  ]);
  const enrolled = new Set(links.map((l) => l.clientId));
  const [stepsByLink, bookingsByLink] = await Promise.all([loadLinkSteps(ctx, links.map((l) => l.id)), loadLinkBookings(ctx, links.map((l) => l.id))]);

  const rows = links
    .flatMap((link) => {
      const client = data.clients.find((c) => c.id === link.clientId);
      if (!client) return [];
      const cases = data.cases.filter((k) => k.clientId === client.id);
      return [
        {
          link,
          client,
          cases,
          linkedCase: cases.find((k) => k.id === link.caseId),
          balances: financeRead ? clientBalances(cases, data.charges, data.payments) : undefined,
          addedBy: data.members.find((m) => m.id === link.addedBy)?.fullName,
          progress: progressOf(stepsByLink.get(link.id)),
          bookings: bookingsByLink.get(link.id) ?? [],
        },
      ];
    })
    .sort(
      (a, b) =>
        SERVICE_STATUS_ORDER.indexOf(a.link.status) - SERVICE_STATUS_ORDER.indexOf(b.link.status) ||
        a.client.lastName.localeCompare(b.client.lastName, "fr") ||
        a.client.firstName.localeCompare(b.client.firstName, "fr"),
    );

  // Clients qu'on peut encore ajouter : actifs et pas déjà dans ce service.
  const candidates =
    canEnroll && service.isActive
      ? data.clients
          .filter((c) => !c.archivedAt && !enrolled.has(c.id))
          .sort((a, b) => a.lastName.localeCompare(b.lastName, "fr") || a.firstName.localeCompare(b.firstName, "fr"))
          .map((c) => ({ id: c.id, label: `${c.lastName.toUpperCase()} ${c.firstName} (${c.reference})` }))
      : [];

  return {
    service,
    steps,
    rows,
    counts: countByStatus(links),
    candidates,
    // Dossiers des clients de l'agence, pour rattacher un suivi au bon dossier.
    cases: data.cases.map((k) => ({ id: k.id, clientId: k.clientId, label: `${k.reference} — ${k.title}` })),
    agency: data.agency,
    now,
    permissions: { manage: allowed(ctx, "services.manage"), enroll: canEnroll, financeRead },
  };
}

/** Données du formulaire de modification d'un service. */
export async function getServiceForEdit(id: string) {
  if (!UUID.test(id)) return null;
  const ctx = await getAgencyContext();
  const [[row], steps, links] = await Promise.all([
    fetchRows(ctx, "services", SERVICE.list, (q) => q.eq("id", id)),
    loadServiceSteps(ctx, id),
    loadServiceClients(ctx, (q) => q.eq("service_id", id)),
  ]);
  if (!row) return null;
  return { service: toService(row), steps, followed: links.length, canManage: allowed(ctx, "services.manage"), currency: ctx.agency.currency };
}

/** Services suivis par un client, et services auxquels on peut encore l'ajouter (fiche client). */
export async function loadClientServices(ctx: AgencyContext, clientId: string) {
  const [services, links] = await Promise.all([loadServices(ctx), loadServiceClients(ctx, (q) => q.eq("client_id", clientId))]);
  const [stepsByLink, bookingsByLink] = await Promise.all([loadLinkSteps(ctx, links.map((l) => l.id)), loadLinkBookings(ctx, links.map((l) => l.id))]);
  return {
    followed: links
      .flatMap((link) => {
        const service = services.find((s) => s.id === link.serviceId);
        return service ? [{ link, service, progress: progressOf(stepsByLink.get(link.id)), bookings: bookingsByLink.get(link.id) ?? [] }] : [];
      })
      .sort((a, b) => SERVICE_STATUS_ORDER.indexOf(a.link.status) - SERVICE_STATUS_ORDER.indexOf(b.link.status) || a.service.name.localeCompare(b.service.name, "fr")),
    available: services.filter((s) => s.isActive && !links.some((l) => l.serviceId === s.id)).map((s) => ({ id: s.id, name: s.name })),
  };
}

/** Confirmation de réservation prête à imprimer, télécharger ou envoyer. */
export async function getBookingDocument(id: string) {
  if (!UUID.test(id)) return null;
  const ctx = await getAgencyContext();
  const [row] = await fetchRows(ctx, "service_bookings", SERVICE_BOOKING.list, (q) => q.eq("id", id));
  if (!row) return null;
  const booking = toServiceBooking(row);
  const [link] = await loadServiceClients(ctx, (q) => q.eq("id", booking.serviceClientId));
  if (!link) return null;
  const [[serviceRow], { data, now }, settings] = await Promise.all([
    fetchRows(ctx, "services", SERVICE.list, (q) => q.eq("id", link.serviceId)),
    readAgency({ clients: (q) => q.eq("id", link.clientId), ...(link.caseId ? { cases: (q) => q.eq("id", link.caseId!) } : {}) }),
    loadInvoiceSettings(ctx),
  ]);
  const client = data.clients[0];
  if (!serviceRow || !client) return null;
  const service = toService(serviceRow);
  const travelCase = data.cases[0];
  return {
    booking,
    link,
    service,
    client,
    agency: data.agency,
    now,
    settings,
    images: imageUrls(settings),
    spec: bookingSpec({ booking, serviceName: service.name, client, travelCase, agency: data.agency, settings, isDemo: ctx.isDemo }),
    canEdit: allowed(ctx, "operations.write"),
    // Clients fictifs de la démonstration : leur numéro ne doit jamais être contacté.
    phoneDigits: client.isDemoFixture ? undefined : (client.whatsappE164 ?? client.phoneE164).replace(/D/g, ""),
    email: client.isDemoFixture ? undefined : client.email,
  };
}
