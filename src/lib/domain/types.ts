// Types métier partagés. Ils reprennent le modèle de données du plan (docs/PLAN_IMPLEMENTATION.md §6)
// pour que le remplacement des données de démonstration par Supabase (Phase 5) ne touche pas aux écrans.

export type MemberRole = "owner" | "admin" | "agent" | "accountant" | "viewer";

export type CaseCategory =
  | "study_abroad"
  | "tourist_visa"
  | "business_travel"
  | "administrative_support"
  | "other_mobility"
  | "custom_trip";

export type CaseStatus = "active" | "on_hold" | "cancelled" | "closed";
export type CaseOutcome = "pending" | "approved" | "refused" | "withdrawn" | "completed";
export type CasePriority = "low" | "normal" | "high" | "urgent";

export type StepKind = "agency_action" | "client_action" | "external_event" | "outcome" | "closure";
export type StepStatus = "pending" | "in_progress" | "done" | "skipped";
export type ConfirmationLevel = "expected" | "declared" | "confirmed";

export type RequirementStatus =
  | "not_received"
  | "received"
  | "to_verify"
  | "validated"
  | "to_correct"
  | "expired"
  | "waived";

export type AppointmentKind =
  | "consultation"
  | "prep_interview"
  | "administrative"
  | "application_deadline"
  | "document_deadline"
  | "follow_up"
  | "departure";

export type AppointmentStatus =
  | "planned"
  | "awaiting_confirmation"
  | "confirmed"
  | "done"
  | "cancelled";

export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";
export type ClientType = "individual" | "student" | "professional" | "company";
export type ChargeType = "agency_fee" | "third_party";
export type PaymentMethodKind = "cash" | "bank_transfer" | "mobile_money" | "other";
export type ExpenseType = "operating" | "client_disbursement";
export type ApplicantTag = "student" | "employee" | "self_employed" | "minor" | "sponsored";

export interface Agency {
  name: string;
  city: string;
  countryCode: string;
  currency: string;
  timezone: string;
  receiptPrefix: string;
}

export interface Member {
  id: string;
  fullName: string;
  email: string;
  role: MemberRole;
  jobTitle: string;
}

export interface ClientGuardian {
  name: string;
  phone: string;
  whatsapp?: string;
  relationship?: string;
}

export interface Client {
  id: string;
  reference: string;
  clientType: ClientType;
  firstName: string;
  lastName: string;
  email?: string;
  phoneE164: string;
  whatsappE164?: string;
  residenceCountry: string;
  city: string;
  preferredLanguage: string;
  registeredAt: string;
  assignedTo: string;
  passportLast4?: string;
  notes?: string;
  archivedAt?: string;
  /** Client fictif livré avec la démonstration (ses numéros ne doivent jamais être contactés). */
  isDemoFixture: boolean;

  // Nouveaux champs d'identité et profil
  gender?: string;
  birthDate?: string;
  nationality?: string;
  maritalStatus?: string;
  idDocType?: string;
  idDocNumber?: string;
  address?: string;
  serviceMotive?: string;

  // Responsables
  isSelfResponsible?: boolean;
  guardian1?: ClientGuardian;
  guardian2?: ClientGuardian;
}

export interface CaseDetails {
  institution?: string;
  program?: string;
  intake?: string;
}

export interface TravelCase {
  id: string;
  reference: string;
  clientId: string;
  category: CaseCategory;
  title: string;
  destinationCountry: string;
  residenceCountry: string;
  status: CaseStatus;
  outcome: CaseOutcome;
  priority: CasePriority;
  assignedTo: string;
  nextAction?: string;
  nextActionDueAt?: string;
  plannedDepartureDate?: string;
  billingCurrency: string;
  applicantTags: ApplicantTag[];
  details: CaseDetails;
  openedAt: string;
  closedAt?: string;
  templateKey: string;
}

export interface StepTransitionOption {
  to: string;
  label: string;
}

export interface CaseStep {
  id: string;
  caseId: string;
  position: number;
  key: string;
  label: string;
  kind: StepKind;
  isOptional: boolean;
  outcome?: CaseOutcome;
  next?: StepTransitionOption[];
  status: StepStatus;
  confirmationLevel?: ConfirmationLevel;
  evidenceRef?: string;
  sourceNote?: string;
  note?: string;
  completedAt?: string;
  completedBy?: string;
}

export interface DocumentRequirement {
  id: string;
  caseId: string;
  documentTypeCode: string;
  label: string;
  category: string;
  isRequired: boolean;
  status: RequirementStatus;
  fileName?: string;
  receivedAt?: string;
  expiresAt?: string;
  reviewComment?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface Appointment {
  id: string;
  caseId?: string;
  clientId?: string;
  kind: AppointmentKind;
  title: string;
  startsAt: string;
  endsAt?: string;
  allDay: boolean;
  location?: string;
  assignedTo: string;
  status: AppointmentStatus;
  externalReference?: string;
}

export interface Task {
  id: string;
  title: string;
  caseId?: string;
  clientId?: string;
  assignedTo: string;
  dueAt: string;
  priority: CasePriority;
  status: TaskStatus;
  completedAt?: string;
}

export interface Charge {
  id: string;
  caseId: string;
  label: string;
  chargeType: ChargeType;
  amountMinor: number;
  currency: string;
  /** Montant d'origine en devise étrangère, à titre informatif (aucune conversion automatique). */
  originalAmount?: { amountMinor: number; currency: string; rateNote: string };
}

export interface PaymentAllocation {
  chargeId: string;
  amountMinor: number;
}

export interface Payment {
  id: string;
  caseId: string;
  clientId: string;
  amountMinor: number;
  currency: string;
  methodKind: PaymentMethodKind;
  methodLabel: string;
  transactionReference?: string;
  payerName?: string;
  paidAt: string;
  receivedBy: string;
  status: "recorded" | "voided";
  receiptNumber: string;
  allocations: PaymentAllocation[];
}

export interface Expense {
  id: string;
  caseId?: string;
  expenseType: ExpenseType;
  label: string;
  supplier?: string;
  amountMinor: number;
  currency: string;
  paidAt: string;
  recordedBy: string;
}

export interface ActivityEvent {
  id: string;
  at: string;
  actorId: string;
  clientId?: string;
  caseId?: string;
  text: string;
}

export interface CommunicationLog {
  id: string;
  at: string;
  clientId: string;
  caseId?: string;
  channel: "whatsapp" | "email" | "phone" | "in_person";
  status: "prepared_manual" | "logged";
  summary: string;
  actorId: string;
}
