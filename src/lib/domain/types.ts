// Types métier partagés. Ils reprennent le modèle de données du plan (docs/PLAN_IMPLEMENTATION.md §6) ;
// la correspondance avec les colonnes Supabase est dans src/lib/data/rows.ts.

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
  /** Membre retiré de l'équipe : son nom reste dans l'historique, il n'a plus accès à l'agence. */
  removedAt?: string;
  /** Faux pour un collègue fictif de la démonstration ou un membre retiré (aucun compte rattaché). */
  hasAccount?: boolean;
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
  /** Verrou optimiste : incrémenté par la base à chaque changement d'étape. */
  version?: number;
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
  /** Emplacement du fichier dans Supabase Storage (bucket privé « documents »). */
  storagePath?: string;
  receivedAt?: string;
  expiresAt?: string;
  reviewComment?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

/** Un fichier d'une pièce (une pièce peut en compter plusieurs : recto-verso, plusieurs relevés…). */
export interface DocumentFile {
  id: string;
  requirementId: string;
  fileName: string;
  storagePath: string;
  uploadedBy?: string;
  createdAt: string;
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
  voidedAt?: string;
  voidedBy?: string;
  voidReason?: string;
}

export type QuoteStatus = "draft" | "sent" | "accepted" | "refused" | "cancelled";

export interface QuoteItem {
  id: string;
  quoteId: string;
  position: number;
  label: string;
  chargeType: ChargeType;
  quantity: number;
  unitAmountMinor: number;
}

/** Devis rattaché à un dossier, dans sa devise. Accepté, il devient des prestations convenues. */
export interface Quote {
  id: string;
  reference: string;
  caseId: string;
  clientId: string;
  currency: string;
  status: QuoteStatus;
  validUntil?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  sentAt?: string;
  decidedAt?: string;
  items: QuoteItem[];
}

// Factures ------------------------------------------------------------------------------------------

export type InvoiceStatus = "draft" | "issued" | "paid" | "cancelled";
export type InvoiceImageKind = "logo" | "stamp" | "signature";

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  position: number;
  label: string;
  quantity: number;
  unitAmountMinor: number;
  /** Taux de taxe en pourcentage (ex. 19.25). */
  taxRate: number;
}

/** Facture adressée à un client : un document remis au client, sans effet sur les prestations ni les paiements. */
export interface Invoice {
  id: string;
  number: string;
  clientId: string;
  caseId?: string;
  status: InvoiceStatus;
  currency: string;
  /** Dates du document (AAAA-MM-JJ). */
  issueDate: string;
  dueDate: string;
  discountLabel?: string;
  discountMinor: number;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  paymentDetails?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  issuedAt?: string;
  paidAt?: string;
  cancelledAt?: string;
  items: InvoiceItem[];
}

/** Coordonnées et images imprimées sur les factures de l'agence. */
export interface InvoiceSettings {
  legalName: string;
  address: string;
  phone: string;
  email: string;
  taxId: string;
  signatoryName: string;
  paymentDetails: string;
  footerNote: string;
  logoPath?: string;
  stampPath?: string;
  signaturePath?: string;
}

// Services de l'agence ------------------------------------------------------------------------------

/** Service proposé par l'agence (hébergement, garant, AVI…), avec un tarif indicatif facultatif. */
export interface AgencyService {
  id: string;
  name: string;
  description: string;
  priceMinor?: number;
  currency?: string;
  isActive: boolean;
  createdAt: string;
}

export type ServiceClientStatus = "in_progress" | "waiting_client" | "waiting_external" | "completed" | "cancelled";

/** Client suivi dans un service, avec le dossier concerné s'il y en a un. */
export interface ServiceClient {
  id: string;
  serviceId: string;
  clientId: string;
  caseId?: string;
  status: ServiceClientStatus;
  note: string;
  addedBy: string;
  addedAt: string;
  updatedAt: string;
}

// Abonnement à SELECT Agency et support ---------------------------------------------------------

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "suspended" | "cancelled";
export type BillingPeriod = "monthly" | "quarterly" | "yearly";

export interface Plan {
  id: string;
  name: string;
  description: string;
  priceMinor: number;
  currency: string;
  billingPeriod: BillingPeriod;
  /** Nombre de membres actifs autorisés ; absent = sans limite. */
  maxMembers?: number;
}

export interface Subscription {
  status: SubscriptionStatus;
  plan?: Pick<Plan, "id" | "name" | "maxMembers">;
  trialEndsAt?: string;
  currentPeriodEnd?: string;
}

export type TicketStatus = "open" | "answered" | "resolved";
export type TicketCategory = "question" | "problem" | "billing" | "account" | "suggestion";

export interface SupportTicket {
  id: string;
  reference: string;
  subject: string;
  category: TicketCategory;
  status: TicketStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupportMessage {
  id: string;
  ticketId: string;
  authorKind: "agency" | "platform";
  authorName: string;
  body: string;
  createdAt: string;
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

/** Données d'une agence telles que les écrans les calculent (chargées depuis Supabase, ou fictives). */
export interface AgencyData {
  agency: Agency;
  currentMemberId: string;
  members: Member[];
  clients: Client[];
  cases: TravelCase[];
  steps: CaseStep[];
  requirements: DocumentRequirement[];
  appointments: Appointment[];
  tasks: Task[];
  charges: Charge[];
  payments: Payment[];
  expenses: Expense[];
  events: ActivityEvent[];
  communications: CommunicationLog[];
}
