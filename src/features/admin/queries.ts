import "server-only";
import { requirePlatformAdmin } from "@/lib/auth/platform";
import type { BillingPeriod, MemberRole, PaymentMethodKind, SubscriptionStatus, TicketCategory, TicketStatus } from "@/lib/domain/types";

// Lectures de la console SELECT. Toutes passent par les fonctions platform_* de la base, qui
// revérifient le rôle et la double authentification : la console n'a aucune règle de lecture sur
// les tables des agences et ne voit jamais leurs clients, dossiers, paiements ni pièces.

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v === null || v === undefined ? undefined : new Date(String(v)).toISOString());
const text = (v: unknown) => (v === null || v === undefined ? undefined : String(v));

async function call(fn: string, args?: Record<string, unknown>): Promise<Row[]> {
  const user = await requirePlatformAdmin();
  const { data, error } = await user.supabase.rpc(fn, args);
  if (error) throw new Error(`Lecture de la console impossible (${fn}) : ${error.message}`);
  return (Array.isArray(data) ? data : [data]) as Row[];
}

export interface AgencyRow {
  id: string;
  name: string;
  city: string;
  countryCode: string;
  currency: string;
  isDemo: boolean;
  createdAt: string;
  ownerName?: string;
  ownerEmail?: string;
  planId?: string;
  planName?: string;
  status?: SubscriptionStatus;
  trialEndsAt?: string;
  currentPeriodEnd?: string;
  members: number;
  clients: number;
  cases: number;
  casesActive: number;
  storageBytes: number;
  lastActivityAt?: string;
  openTickets: number;
}

const toAgencyRow = (r: Row): AgencyRow => ({
  id: String(r.id),
  name: String(r.name),
  city: String(r.city ?? ""),
  countryCode: String(r.country_code),
  currency: String(r.currency),
  isDemo: Boolean(r.is_demo),
  createdAt: iso(r.created_at)!,
  ownerName: text(r.owner_name),
  ownerEmail: text(r.owner_email),
  planId: text(r.plan_id),
  planName: text(r.plan_name),
  status: text(r.status) as SubscriptionStatus | undefined,
  trialEndsAt: iso(r.trial_ends_at),
  currentPeriodEnd: iso(r.current_period_end),
  members: Number(r.members ?? 0),
  clients: Number(r.clients ?? 0),
  cases: Number(r.cases ?? 0),
  casesActive: Number(r.cases_active ?? 0),
  storageBytes: Number(r.storage_bytes ?? 0),
  lastActivityAt: iso(r.last_activity_at),
  openTickets: Number(r.open_tickets ?? 0),
});

export interface Overview {
  agencies: number;
  demoAgencies: number;
  trialing: number;
  trialExpired: number;
  trialEndingSoon: number;
  active: number;
  pastDue: number;
  suspended: number;
  cancelled: number;
  periodOverdue: number;
  users: number;
  members: number;
  clients: number;
  cases: number;
  casesActive: number;
  casesLast30Days: number;
  files: number;
  storageBytes: number;
  openTickets: number;
  signups: { month: string; count: number }[];
  revenue: { month: string; currency: string; amountMinor: number }[];
}

export async function getOverview(): Promise<Overview> {
  const [o = {}] = await call("platform_overview");
  const n = (key: string) => Number(o[key] ?? 0);
  return {
    agencies: n("agencies"),
    demoAgencies: n("demo_agencies"),
    trialing: n("trialing"),
    trialExpired: n("trial_expired"),
    trialEndingSoon: n("trial_ending_soon"),
    active: n("active"),
    pastDue: n("past_due"),
    suspended: n("suspended"),
    cancelled: n("cancelled"),
    periodOverdue: n("period_overdue"),
    users: n("users"),
    members: n("members"),
    clients: n("clients"),
    cases: n("cases"),
    casesActive: n("cases_active"),
    casesLast30Days: n("cases_last_30_days"),
    files: n("files"),
    storageBytes: n("storage_bytes"),
    openTickets: n("open_tickets"),
    signups: ((o.signups ?? []) as Row[]).map((r) => ({ month: String(r.month), count: Number(r.count) })),
    revenue: ((o.revenue ?? []) as Row[]).map((r) => ({ month: String(r.month), currency: String(r.currency), amountMinor: Number(r.amount_minor) })),
  };
}

export async function listAgencies(): Promise<AgencyRow[]> {
  return (await call("platform_agencies")).map(toAgencyRow);
}

export interface PlatformMember {
  memberId: string;
  organizationId: string;
  organizationName: string;
  isDemo: boolean;
  fullName: string;
  email: string;
  role: MemberRole;
  jobTitle: string;
  joinedAt: string;
  removedAt?: string;
  lastSignInAt?: string;
}

const toPlatformMember = (r: Row): PlatformMember => ({
  memberId: String(r.member_id),
  organizationId: String(r.organization_id),
  organizationName: String(r.organization_name),
  isDemo: Boolean(r.is_demo),
  fullName: String(r.full_name),
  email: String(r.email ?? ""),
  role: r.role as MemberRole,
  jobTitle: String(r.job_title ?? ""),
  joinedAt: iso(r.joined_at)!,
  removedAt: iso(r.removed_at),
  lastSignInAt: iso(r.last_sign_in_at),
});

export interface PlatformUser {
  userId: string;
  email: string;
  createdAt: string;
  lastSignInAt?: string;
  emailConfirmedAt?: string;
  organizationId?: string;
  organizationName?: string;
  role?: MemberRole;
  isPlatformAdmin: boolean;
}

export async function listUsers(): Promise<PlatformUser[]> {
  return (await call("platform_users")).map((r) => ({
    userId: String(r.user_id),
    email: String(r.email ?? ""),
    createdAt: iso(r.created_at)!,
    lastSignInAt: iso(r.last_sign_in_at),
    emailConfirmedAt: iso(r.email_confirmed_at),
    organizationId: text(r.organization_id),
    organizationName: text(r.organization_name),
    role: text(r.role) as MemberRole | undefined,
    isPlatformAdmin: Boolean(r.is_platform_admin),
  }));
}

export interface PlatformPlan {
  id: string;
  name: string;
  description: string;
  priceMinor: number;
  currency: string;
  billingPeriod: BillingPeriod;
  maxMembers?: number;
  isActive: boolean;
  subscribers: number;
  /** Tarif Stripe associé (price_…) : la formule est alors payable par carte. */
  stripePriceId?: string;
}

export async function listPlans(): Promise<PlatformPlan[]> {
  return (await call("platform_plans")).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    description: String(r.description ?? ""),
    priceMinor: Number(r.price_minor),
    currency: String(r.currency),
    billingPeriod: r.billing_period as BillingPeriod,
    maxMembers: r.max_members === null || r.max_members === undefined ? undefined : Number(r.max_members),
    isActive: Boolean(r.is_active),
    subscribers: Number(r.subscribers ?? 0),
    stripePriceId: r.stripe_price_id ? String(r.stripe_price_id) : undefined,
  }));
}

export interface PlatformPayment {
  id: string;
  organizationId: string;
  organizationName: string;
  planName?: string;
  amountMinor: number;
  currency: string;
  methodKind: PaymentMethodKind;
  transactionReference?: string;
  paidAt: string;
  periodEnd?: string;
  status: "recorded" | "voided";
  voidReason?: string;
  recordedByEmail?: string;
}

export async function listPayments(organizationId?: string): Promise<PlatformPayment[]> {
  return (await call("platform_payments", { p_org: organizationId ?? null })).map((r) => ({
    id: String(r.id),
    organizationId: String(r.organization_id),
    organizationName: String(r.organization_name),
    planName: text(r.plan_name),
    amountMinor: Number(r.amount_minor),
    currency: String(r.currency),
    methodKind: r.method_kind as PaymentMethodKind,
    transactionReference: text(r.transaction_reference),
    paidAt: iso(r.paid_at)!,
    periodEnd: iso(r.period_end),
    status: r.status as PlatformPayment["status"],
    voidReason: text(r.void_reason),
    recordedByEmail: text(r.recorded_by_email),
  }));
}

export interface PlatformTicket {
  id: string;
  reference: string;
  organizationId: string;
  organizationName: string;
  subject: string;
  category: TicketCategory;
  status: TicketStatus;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
  messages: number;
}

export async function listTickets(filters: { status?: TicketStatus; organizationId?: string } = {}): Promise<PlatformTicket[]> {
  return (await call("platform_tickets", { p_status: filters.status ?? null, p_org: filters.organizationId ?? null })).map((r) => ({
    id: String(r.id),
    reference: String(r.reference),
    organizationId: String(r.organization_id),
    organizationName: String(r.organization_name),
    subject: String(r.subject),
    category: r.category as TicketCategory,
    status: r.status as TicketStatus,
    createdByName: text(r.created_by_name),
    createdAt: iso(r.created_at)!,
    updatedAt: iso(r.updated_at)!,
    messages: Number(r.messages ?? 0),
  }));
}

export interface PlatformTicketDetail extends Omit<PlatformTicket, "messages" | "updatedAt"> {
  createdByEmail?: string;
  messages: { id: string; authorKind: "agency" | "platform"; authorName: string; body: string; createdAt: string }[];
}

export async function getTicket(id: string): Promise<PlatformTicketDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [r] = await call("platform_ticket", { p_ticket_id: id });
  if (!r) return null;
  return {
    id: String(r.id),
    reference: String(r.reference),
    organizationId: String(r.organization_id),
    organizationName: String(r.organization_name),
    subject: String(r.subject),
    category: r.category as TicketCategory,
    status: r.status as TicketStatus,
    createdByName: text(r.created_by_name),
    createdByEmail: text(r.created_by_email),
    createdAt: iso(r.created_at)!,
    messages: ((r.messages ?? []) as Row[]).map((m) => ({
      id: String(m.id),
      authorKind: m.author_kind as "agency" | "platform",
      authorName: String(m.author_name),
      body: String(m.body),
      createdAt: iso(m.created_at)!,
    })),
  };
}

export interface AuditEntry {
  id: number;
  at: string;
  actorEmail: string;
  action: string;
  organizationId?: string;
  organizationName?: string;
  details: Record<string, unknown>;
}

export async function listAudit(organizationId?: string): Promise<AuditEntry[]> {
  return (await call("platform_audit", { p_org: organizationId ?? null, p_limit: 300 })).map((r) => ({
    id: Number(r.id),
    at: iso(r.at)!,
    actorEmail: String(r.actor_email ?? ""),
    action: String(r.action),
    organizationId: text(r.organization_id),
    organizationName: text(r.organization_name),
    details: (r.details ?? {}) as Record<string, unknown>,
  }));
}

/** Fiche d'une agence dans la console : abonnement, équipe, paiements, demandes, journal. */
export async function getAgency(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [agencies, plans] = await Promise.all([listAgencies(), listPlans()]);
  const agency = agencies.find((a) => a.id === id);
  if (!agency) return null;
  const [members, payments, tickets, audit] = await Promise.all([
    call("platform_members", { p_org: id }).then((rows) => rows.map(toPlatformMember)),
    listPayments(id),
    listTickets({ organizationId: id }),
    listAudit(id),
  ]);
  return { agency, plans, members, payments, tickets, audit };
}
