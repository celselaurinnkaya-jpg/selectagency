import type {
  ActivityEvent,
  Agency,
  Appointment,
  CaseStep,
  Charge,
  Client,
  CommunicationLog,
  DocumentRequirement,
  Expense,
  Member,
  Payment,
  PaymentAllocation,
  Task,
  TravelCase,
} from "@/lib/domain/types";

// Correspondance entre les types métier (camelCase) et les colonnes Supabase (snake_case).
// Les listes de colonnes servent aux lectures (jamais de « select * ») ; le test
// supabase/tests/database.test.ts vérifie qu'elles existent toutes dans les migrations.

type Row = Record<string, unknown>;

const opt = <T>(value: T | null | undefined): T | undefined => (value === null || value === undefined ? undefined : value);
const nul = <T>(value: T | undefined): T | null => (value === undefined ? null : value);
/** Horodatage normalisé (UTC, format ISO) : les tris par chaîne restent justes. */
const iso = (value: unknown): string => new Date(String(value)).toISOString();
const optIso = (value: unknown): string | undefined => (value === null || value === undefined ? undefined : iso(value));
const str = (value: unknown): string => String(value ?? "");
const optStr = (value: unknown): string | undefined => opt(value as string | null | undefined);

// « list » est typé comme « * » : supabase-js ne sait analyser que des sélections écrites en dur ; les lignes
// sont donc reçues sans type, puis converties par les fonctions to…() ci-dessous.
const columns = (...names: string[]) => ({ names, list: names.join(", ") as "*" });

// Agence et membres ---------------------------------------------------------------------------

export const ORGANIZATION = columns("id", "name", "city", "country_code", "currency", "timezone", "receipt_prefix", "is_demo");

export function toAgency(r: Row): Agency {
  return {
    name: str(r.name),
    city: str(r.city),
    countryCode: str(r.country_code),
    currency: str(r.currency),
    timezone: str(r.timezone),
    receiptPrefix: str(r.receipt_prefix),
  };
}

export const MEMBER = columns("id", "organization_id", "user_id", "full_name", "email", "role", "job_title", "created_at");

export function toMember(r: Row): Member {
  return { id: str(r.id), fullName: str(r.full_name), email: str(r.email), role: r.role as Member["role"], jobTitle: str(r.job_title) };
}

export function memberToRow(m: Member): Row {
  return { id: m.id, full_name: m.fullName, email: m.email, role: m.role, job_title: m.jobTitle };
}

// Clients -------------------------------------------------------------------------------------

export const CLIENT = columns(
  "id", "reference", "client_type", "first_name", "last_name", "email", "phone_e164", "whatsapp_e164",
  "residence_country", "city", "preferred_language", "registered_at", "assigned_to", "passport_last4", "notes",
  "archived_at", "is_demo_fixture", "gender", "birth_date", "nationality", "marital_status", "id_doc_type",
  "address", "service_motive", "is_self_responsible", "guardian1", "guardian2",
);

/** Numéro complet de la pièce d'identité (table à part, non lisible par le comptable ni la lecture seule). */
export const CLIENT_SENSITIVE = columns("client_id", "id_doc_number");

export function toClient(r: Row): Client {
  return {
    id: str(r.id),
    reference: str(r.reference),
    clientType: r.client_type as Client["clientType"],
    firstName: str(r.first_name),
    lastName: str(r.last_name),
    email: optStr(r.email),
    phoneE164: str(r.phone_e164),
    whatsappE164: optStr(r.whatsapp_e164),
    residenceCountry: str(r.residence_country),
    city: str(r.city),
    preferredLanguage: str(r.preferred_language),
    registeredAt: iso(r.registered_at),
    assignedTo: str(r.assigned_to),
    passportLast4: optStr(r.passport_last4),
    notes: optStr(r.notes),
    archivedAt: optIso(r.archived_at),
    isDemoFixture: Boolean(r.is_demo_fixture),
    gender: optStr(r.gender),
    birthDate: optStr(r.birth_date),
    nationality: optStr(r.nationality),
    maritalStatus: optStr(r.marital_status),
    idDocType: optStr(r.id_doc_type),
    address: optStr(r.address),
    serviceMotive: optStr(r.service_motive),
    isSelfResponsible: r.is_self_responsible === null ? undefined : Boolean(r.is_self_responsible),
    guardian1: opt(r.guardian1 as Client["guardian1"] | null),
    guardian2: opt(r.guardian2 as Client["guardian2"] | null),
  };
}

/** Colonnes modifiables d'une fiche client (création et modification). */
export function clientToRow(c: Omit<Client, "id" | "reference" | "registeredAt" | "isDemoFixture" | "archivedAt">): Row {
  return {
    client_type: c.clientType,
    first_name: c.firstName,
    last_name: c.lastName,
    email: nul(c.email),
    phone_e164: c.phoneE164,
    whatsapp_e164: nul(c.whatsappE164),
    residence_country: c.residenceCountry,
    city: c.city,
    preferred_language: c.preferredLanguage,
    assigned_to: c.assignedTo,
    passport_last4: nul(c.passportLast4),
    notes: nul(c.notes),
    gender: nul(c.gender),
    birth_date: nul(c.birthDate),
    nationality: nul(c.nationality),
    marital_status: nul(c.maritalStatus),
    id_doc_type: nul(c.idDocType),
    address: nul(c.address),
    service_motive: nul(c.serviceMotive),
    is_self_responsible: c.isSelfResponsible ?? true,
    guardian1: nul(c.guardian1),
    guardian2: nul(c.guardian2),
  };
}

// Dossiers et étapes ----------------------------------------------------------------------------

export const CASE = columns(
  "id", "reference", "client_id", "category", "title", "destination_country", "residence_country", "status",
  "outcome", "priority", "assigned_to", "next_action", "next_action_due_at", "planned_departure_date",
  "billing_currency", "applicant_tags", "details", "opened_at", "closed_at", "template_key", "version",
);

export function toCase(r: Row): TravelCase {
  return {
    id: str(r.id),
    reference: str(r.reference),
    clientId: str(r.client_id),
    category: r.category as TravelCase["category"],
    title: str(r.title),
    destinationCountry: str(r.destination_country),
    residenceCountry: str(r.residence_country),
    status: r.status as TravelCase["status"],
    outcome: r.outcome as TravelCase["outcome"],
    priority: r.priority as TravelCase["priority"],
    assignedTo: str(r.assigned_to),
    nextAction: optStr(r.next_action),
    nextActionDueAt: optIso(r.next_action_due_at),
    plannedDepartureDate: optStr(r.planned_departure_date),
    billingCurrency: str(r.billing_currency),
    applicantTags: (r.applicant_tags as TravelCase["applicantTags"] | null) ?? [],
    details: (r.details as TravelCase["details"] | null) ?? {},
    openedAt: iso(r.opened_at),
    closedAt: optIso(r.closed_at),
    templateKey: str(r.template_key),
    version: Number(r.version ?? 1),
  };
}

export function caseToRow(c: TravelCase): Row {
  return {
    id: c.id,
    reference: c.reference,
    client_id: c.clientId,
    category: c.category,
    title: c.title,
    destination_country: c.destinationCountry,
    residence_country: c.residenceCountry,
    status: c.status,
    outcome: c.outcome,
    priority: c.priority,
    assigned_to: c.assignedTo,
    next_action: nul(c.nextAction),
    next_action_due_at: nul(c.nextActionDueAt),
    planned_departure_date: nul(c.plannedDepartureDate),
    billing_currency: c.billingCurrency,
    applicant_tags: c.applicantTags,
    details: c.details,
    opened_at: c.openedAt,
    closed_at: nul(c.closedAt),
    template_key: c.templateKey,
    version: c.version ?? 1,
  };
}

export const STEP = columns(
  "id", "case_id", "position", "key", "label", "kind", "is_optional", "outcome", "next", "status",
  "confirmation_level", "evidence_ref", "source_note", "note", "completed_at", "completed_by",
);

export function toStep(r: Row): CaseStep {
  return {
    id: str(r.id),
    caseId: str(r.case_id),
    position: Number(r.position),
    key: str(r.key),
    label: str(r.label),
    kind: r.kind as CaseStep["kind"],
    isOptional: Boolean(r.is_optional),
    outcome: opt(r.outcome as CaseStep["outcome"] | null),
    next: opt(r.next as CaseStep["next"] | null),
    status: r.status as CaseStep["status"],
    confirmationLevel: opt(r.confirmation_level as CaseStep["confirmationLevel"] | null),
    evidenceRef: optStr(r.evidence_ref),
    sourceNote: optStr(r.source_note),
    note: optStr(r.note),
    completedAt: optIso(r.completed_at),
    completedBy: optStr(r.completed_by),
  };
}

export function stepToRow(s: CaseStep): Row {
  return {
    id: s.id,
    case_id: s.caseId,
    position: s.position,
    key: s.key,
    label: s.label,
    kind: s.kind,
    is_optional: s.isOptional,
    outcome: nul(s.outcome),
    next: nul(s.next),
    status: s.status,
    confirmation_level: nul(s.confirmationLevel),
    evidence_ref: nul(s.evidenceRef),
    source_note: nul(s.sourceNote),
    note: nul(s.note),
    completed_at: nul(s.completedAt),
    completed_by: nul(s.completedBy),
  };
}

// Pièces -------------------------------------------------------------------------------------

export const REQUIREMENT = columns(
  "id", "case_id", "document_type_code", "label", "category", "is_required", "status", "file_name", "storage_path",
  "received_at", "expires_at", "review_comment", "reviewed_by", "reviewed_at",
);

export function toRequirement(r: Row): DocumentRequirement {
  return {
    id: str(r.id),
    caseId: str(r.case_id),
    documentTypeCode: str(r.document_type_code),
    label: str(r.label),
    category: str(r.category),
    isRequired: Boolean(r.is_required),
    status: r.status as DocumentRequirement["status"],
    fileName: optStr(r.file_name),
    storagePath: optStr(r.storage_path),
    receivedAt: optIso(r.received_at),
    expiresAt: optStr(r.expires_at),
    reviewComment: optStr(r.review_comment),
    reviewedBy: optStr(r.reviewed_by),
    reviewedAt: optIso(r.reviewed_at),
  };
}

export function requirementToRow(d: DocumentRequirement): Row {
  return {
    id: d.id,
    case_id: d.caseId,
    document_type_code: d.documentTypeCode,
    label: d.label,
    category: d.category,
    is_required: d.isRequired,
    status: d.status,
    file_name: nul(d.fileName),
    storage_path: nul(d.storagePath),
    received_at: nul(d.receivedAt),
    expires_at: nul(d.expiresAt),
    review_comment: nul(d.reviewComment),
    reviewed_by: nul(d.reviewedBy),
    reviewed_at: nul(d.reviewedAt),
  };
}

// Agenda et tâches --------------------------------------------------------------------------

export const APPOINTMENT = columns(
  "id", "case_id", "client_id", "kind", "title", "starts_at", "ends_at", "all_day", "location", "assigned_to", "status",
  "external_reference",
);

export function toAppointment(r: Row): Appointment {
  return {
    id: str(r.id),
    caseId: optStr(r.case_id),
    clientId: optStr(r.client_id),
    kind: r.kind as Appointment["kind"],
    title: str(r.title),
    startsAt: iso(r.starts_at),
    endsAt: optIso(r.ends_at),
    allDay: Boolean(r.all_day),
    location: optStr(r.location),
    assignedTo: str(r.assigned_to),
    status: r.status as Appointment["status"],
    externalReference: optStr(r.external_reference),
  };
}

export function appointmentToRow(a: Appointment): Row {
  return {
    id: a.id,
    case_id: nul(a.caseId),
    client_id: nul(a.clientId),
    kind: a.kind,
    title: a.title,
    starts_at: a.startsAt,
    ends_at: nul(a.endsAt),
    all_day: a.allDay,
    location: nul(a.location),
    assigned_to: a.assignedTo,
    status: a.status,
    external_reference: nul(a.externalReference),
  };
}

export const TASK = columns("id", "title", "case_id", "client_id", "assigned_to", "due_at", "priority", "status", "completed_at");

export function toTask(r: Row): Task {
  return {
    id: str(r.id),
    title: str(r.title),
    caseId: optStr(r.case_id),
    clientId: optStr(r.client_id),
    assignedTo: str(r.assigned_to),
    dueAt: iso(r.due_at),
    priority: r.priority as Task["priority"],
    status: r.status as Task["status"],
    completedAt: optIso(r.completed_at),
  };
}

export function taskToRow(t: Task): Row {
  return {
    id: t.id,
    title: t.title,
    case_id: nul(t.caseId),
    client_id: nul(t.clientId),
    assigned_to: t.assignedTo,
    due_at: t.dueAt,
    priority: t.priority,
    status: t.status,
    completed_at: nul(t.completedAt),
  };
}

// Finance ------------------------------------------------------------------------------------

export const CHARGE = columns("id", "case_id", "label", "charge_type", "amount_minor", "currency", "original_amount");

export function toCharge(r: Row): Charge {
  return {
    id: str(r.id),
    caseId: str(r.case_id),
    label: str(r.label),
    chargeType: r.charge_type as Charge["chargeType"],
    amountMinor: Number(r.amount_minor),
    currency: str(r.currency),
    originalAmount: opt(r.original_amount as Charge["originalAmount"] | null),
  };
}

export function chargeToRow(c: Charge): Row {
  return {
    id: c.id,
    case_id: c.caseId,
    label: c.label,
    charge_type: c.chargeType,
    amount_minor: c.amountMinor,
    currency: c.currency,
    original_amount: nul(c.originalAmount),
  };
}

export const PAYMENT = columns(
  "id", "case_id", "client_id", "amount_minor", "currency", "method_kind", "method_label", "transaction_reference",
  "payer_name", "paid_at", "received_by", "status", "receipt_number",
);

export const ALLOCATION = columns("id", "payment_id", "charge_id", "amount_minor");

export function toPayment(r: Row, allocations: PaymentAllocation[]): Payment {
  return {
    id: str(r.id),
    caseId: str(r.case_id),
    clientId: str(r.client_id),
    amountMinor: Number(r.amount_minor),
    currency: str(r.currency),
    methodKind: r.method_kind as Payment["methodKind"],
    methodLabel: str(r.method_label),
    transactionReference: optStr(r.transaction_reference),
    payerName: optStr(r.payer_name),
    paidAt: iso(r.paid_at),
    receivedBy: str(r.received_by),
    status: r.status as Payment["status"],
    receiptNumber: str(r.receipt_number),
    allocations,
  };
}

export function toAllocation(r: Row): PaymentAllocation & { paymentId: string } {
  return { paymentId: str(r.payment_id), chargeId: str(r.charge_id), amountMinor: Number(r.amount_minor) };
}

export function paymentToRow(p: Payment): Row {
  return {
    id: p.id,
    case_id: p.caseId,
    client_id: p.clientId,
    amount_minor: p.amountMinor,
    currency: p.currency,
    method_kind: p.methodKind,
    method_label: p.methodLabel,
    transaction_reference: nul(p.transactionReference),
    payer_name: nul(p.payerName),
    paid_at: p.paidAt,
    received_by: p.receivedBy,
    status: p.status,
    receipt_number: p.receiptNumber,
  };
}

export const EXPENSE = columns("id", "case_id", "expense_type", "label", "supplier", "amount_minor", "currency", "paid_at", "recorded_by");

export function toExpense(r: Row): Expense {
  return {
    id: str(r.id),
    caseId: optStr(r.case_id),
    expenseType: r.expense_type as Expense["expenseType"],
    label: str(r.label),
    supplier: optStr(r.supplier),
    amountMinor: Number(r.amount_minor),
    currency: str(r.currency),
    paidAt: iso(r.paid_at),
    recordedBy: str(r.recorded_by),
  };
}

export function expenseToRow(e: Expense): Row {
  return {
    id: e.id,
    case_id: nul(e.caseId),
    expense_type: e.expenseType,
    label: e.label,
    supplier: nul(e.supplier),
    amount_minor: e.amountMinor,
    currency: e.currency,
    paid_at: e.paidAt,
    recorded_by: e.recordedBy,
  };
}

// Historique et communications ------------------------------------------------------------------

export const EVENT = columns("id", "at", "actor_id", "client_id", "case_id", "text");

export function toEvent(r: Row): ActivityEvent {
  return { id: str(r.id), at: iso(r.at), actorId: str(r.actor_id), clientId: optStr(r.client_id), caseId: optStr(r.case_id), text: str(r.text) };
}

export function eventToRow(e: ActivityEvent): Row {
  return { id: e.id, at: e.at, actor_id: e.actorId, client_id: nul(e.clientId), case_id: nul(e.caseId), text: e.text };
}

export const COMMUNICATION = columns("id", "at", "client_id", "case_id", "channel", "status", "summary", "actor_id");

export function toCommunication(r: Row): CommunicationLog {
  return {
    id: str(r.id),
    at: iso(r.at),
    clientId: str(r.client_id),
    caseId: optStr(r.case_id),
    channel: r.channel as CommunicationLog["channel"],
    status: r.status as CommunicationLog["status"],
    summary: str(r.summary),
    actorId: str(r.actor_id),
  };
}

/** Toutes les lectures, pour la vérification des colonnes par le test de la base. */
export const READ_COLUMNS = {
  organizations: ORGANIZATION,
  members: MEMBER,
  clients: CLIENT,
  client_sensitive: CLIENT_SENSITIVE,
  cases: CASE,
  case_steps: STEP,
  document_requirements: REQUIREMENT,
  appointments: APPOINTMENT,
  tasks: TASK,
  charges: CHARGE,
  payments: PAYMENT,
  payment_allocations: ALLOCATION,
  expenses: EXPENSE,
  activity_events: EVENT,
  communication_logs: COMMUNICATION,
} as const;
