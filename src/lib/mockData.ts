export type MemberRole = "owner" | "admin" | "agent" | "accountant" | "viewer";
export type CaseCategory =
  | "study_abroad"
  | "tourist_visa"
  | "business_travel"
  | "administrative_support"
  | "custom_trip"
  | "other_mobility";

export type CaseStatus = "active" | "on_hold" | "cancelled" | "closed";
export type CasePriority = "low" | "normal" | "high" | "urgent";
export type AppointmentKind =
  | "consultation"
  | "prep_interview"
  | "administrative"
  | "consular_deposit"
  | "follow_up";

export interface Client {
  id: string;
  reference: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  whatsapp?: string;
  country: string;
  city: string;
  type: "student" | "individual" | "professional" | "company";
  casesCount: number;
  registeredAt: string;
  lastActivity: string;
  assignedAdvisor: string;
  notes?: string;
  passportLast4?: string;
}

export interface TravelCase {
  id: string;
  reference: string;
  clientId: string;
  clientName: string;
  category: CaseCategory;
  categoryLabel: string;
  title: string;
  destinationCountry: string;
  destinationFlag: string;
  status: CaseStatus;
  stepStatusLabel: string;
  currentStep: string;
  priority: CasePriority;
  assignedTo: string;
  nextAction: string;
  nextActionDueAt: string;
  createdAt: string;
  currency: string;
  totalAmountMinor: number;
  paidAmountMinor: number;
  balanceMinor: number;
  missingDocsCount: number;
  tags?: string[];
  intakeDetails?: {
    university?: string;
    program?: string;
    intakeTerm?: string;
    consulateCenter?: string;
  };
}

export interface Task {
  id: string;
  title: string;
  category: "document" | "client_follow_up" | "appointment" | "finance" | "workflow";
  caseReference?: string;
  clientName?: string;
  dueAt: string;
  isUrgent: boolean;
  assignedTo: string;
  status: "todo" | "in_progress" | "done";
}

export interface Appointment {
  id: string;
  title: string;
  kind: AppointmentKind;
  kindLabel: string;
  clientName: string;
  caseReference?: string;
  date: string;
  time: string;
  location: string;
  assignedAdvisor: string;
  status: "confirmed" | "planned" | "done";
}

export interface PaymentRecord {
  id: string;
  receiptNumber: string;
  clientName: string;
  caseReference: string;
  amountMinor: number;
  currency: string;
  method: string;
  date: string;
  status: "recorded" | "voided";
  receivedBy: string;
}

export interface ActivityEvent {
  id: string;
  type: "status_change" | "payment" | "document" | "appointment" | "client_created";
  title: string;
  description: string;
  timestamp: string;
  actor: string;
}

// Current Mock User & Agency
export const mockCurrentUser = {
  id: "user-1",
  name: "Celse Laurin Nkaya",
  email: "celse.nkaya@select-agency.com",
  role: "Directeur d'agence" as const,
  roleKey: "owner" as MemberRole,
  agencyName: "SELECT Agency — Douala Bonanjo",
  country: "Cameroun",
  currency: "XAF",
};

// Initial Mock Clients
export const initialClients: Client[] = [
  {
    id: "cli-1",
    reference: "CLI-2026-00042",
    firstName: "Arnaud",
    lastName: "Tchouameni",
    email: "arnaud.t@gmail.com",
    phone: "+237 699 45 21 80",
    whatsapp: "+237 699 45 21 80",
    country: "Cameroun",
    city: "Douala",
    type: "student",
    casesCount: 1,
    registeredAt: "2026-09-12",
    lastActivity: "Il y a 2 heures",
    assignedAdvisor: "Celse Laurin Nkaya",
    notes: "Dossier Campus France et visa long séjour études.",
    passportLast4: "8472",
  },
  {
    id: "cli-2",
    reference: "CLI-2026-00043",
    firstName: "Aminata",
    lastName: "Diallo",
    email: "aminata.diallo@pro-consulting.ci",
    phone: "+225 07 48 92 11 30",
    whatsapp: "+225 07 48 92 11 30",
    country: "Côte d'Ivoire",
    city: "Abidjan",
    type: "professional",
    casesCount: 2,
    registeredAt: "2026-08-04",
    lastActivity: "Hier à 16:30",
    assignedAdvisor: "Marcelle Eboa",
    notes: "Missions d'affaires régulières vers Dubaï et l'espace Schengen.",
    passportLast4: "1923",
  },
  {
    id: "cli-3",
    reference: "CLI-2026-00044",
    firstName: "Koffi",
    lastName: "Mensah",
    email: "k.mensah@gmail.com",
    phone: "+228 90 12 34 56",
    whatsapp: "+228 90 12 34 56",
    country: "Togo",
    city: "Lomé",
    type: "student",
    casesCount: 1,
    registeredAt: "2026-10-01",
    lastActivity: "Il y a 3 jours",
    assignedAdvisor: "Jean-Paul Kamga",
    notes: "Candidature Université Laval (Québec, Canada).",
    passportLast4: "5501",
  },
  {
    id: "cli-4",
    reference: "CLI-2026-00045",
    firstName: "Marie-Louise",
    lastName: "Banyingela",
    email: "ml.banyingela@outlook.cd",
    phone: "+243 81 234 56 78",
    whatsapp: "+243 81 234 56 78",
    country: "RD Congo",
    city: "Kinshasa",
    type: "individual",
    casesCount: 1,
    registeredAt: "2026-10-14",
    lastActivity: "Aujourd'hui à 09:15",
    assignedAdvisor: "Celse Laurin Nkaya",
    notes: "Visa visite familiale France & Belgique.",
    passportLast4: "3389",
  },
  {
    id: "cli-5",
    reference: "CLI-2026-00046",
    firstName: "Christian",
    lastName: "Fotso",
    email: "c.fotso@groupe-fotso.cm",
    phone: "+237 677 88 99 00",
    country: "Cameroun",
    city: "Yaoundé",
    type: "company",
    casesCount: 3,
    registeredAt: "2026-07-20",
    lastActivity: "Il y a 5 jours",
    assignedAdvisor: "Marcelle Eboa",
    notes: "Dirigeant d'entreprise, voyages d'affaires fréquents Chine et UE.",
    passportLast4: "9042",
  },
];

// Initial Mock Cases
export const initialCases: TravelCase[] = [
  {
    id: "case-1",
    reference: "DOS-2026-00117",
    clientId: "cli-1",
    clientName: "Arnaud Tchouameni",
    category: "study_abroad",
    categoryLabel: "Études à l'étranger",
    title: "Master 1 Informatique — Université de Lyon (France)",
    destinationCountry: "France",
    destinationFlag: "🇫🇷",
    status: "active",
    stepStatusLabel: "Entretien pédagogique passé",
    currentStep: "Préparation dossier visa",
    priority: "high",
    assignedTo: "Celse Laurin Nkaya",
    nextAction: "Réception de l'attestation de virement irrévocable (AVI)",
    nextActionDueAt: "28/10/2026",
    createdAt: "2026-09-15",
    currency: "XAF",
    totalAmountMinor: 1250000,
    paidAmountMinor: 850000,
    balanceMinor: 400000,
    missingDocsCount: 2,
    tags: ["Étudiant", "Bourse partielle", "Schengen"],
    intakeDetails: {
      university: "Université Claude Bernard Lyon 1",
      program: "Master Informatique - Données & IA",
      intakeTerm: "Rentrée Janvier 2027",
      consulateCenter: "Consulat Général de France à Douala",
    },
  },
  {
    id: "case-2",
    reference: "DOS-2026-00118",
    clientId: "cli-2",
    clientName: "Aminata Diallo",
    category: "business_travel",
    categoryLabel: "Voyage d'affaires",
    title: "Mission d'affaires & salon Gitex — Dubaï",
    destinationCountry: "Émirats Arabes Unis",
    destinationFlag: "🇦🇪",
    status: "active",
    stepStatusLabel: "Dépôt e-Visa effectué",
    currentStep: "Attente confirmation officielle",
    priority: "urgent",
    assignedTo: "Marcelle Eboa",
    nextAction: "Vérifier le statut du visa électronique sur le portail GDRFA",
    nextActionDueAt: "27/10/2026",
    createdAt: "2026-10-10",
    currency: "XAF",
    totalAmountMinor: 450000,
    paidAmountMinor: 450000,
    balanceMinor: 0,
    missingDocsCount: 0,
    tags: ["Professionnel", "e-Visa"],
    intakeDetails: {
      program: "Salon Gitex Global Dubaï",
      consulateCenter: "Portail GDRFA Dubaï",
    },
  },
  {
    id: "case-3",
    reference: "DOS-2026-00119",
    clientId: "cli-3",
    clientName: "Koffi Mensah",
    category: "study_abroad",
    categoryLabel: "Études à l'étranger",
    title: "Baccalauréat Génie Logiciel — Université Laval (Canada)",
    destinationCountry: "Canada",
    destinationFlag: "🇨🇦",
    status: "active",
    stepStatusLabel: "Lettre d'admission reçue",
    currentStep: "Constitution demande CAQ & Permis d'études",
    priority: "normal",
    assignedTo: "Jean-Paul Kamga",
    nextAction: "Transmettre relevé de compte bancaire du garant",
    nextActionDueAt: "30/10/2026",
    createdAt: "2026-10-02",
    currency: "XAF",
    totalAmountMinor: 1800000,
    paidAmountMinor: 900000,
    balanceMinor: 900000,
    missingDocsCount: 3,
    tags: ["Étudiant", "Garant familial", "Canada"],
    intakeDetails: {
      university: "Université Laval, Québec",
      program: "Génie Logiciel",
      intakeTerm: "Automne 2027",
      consulateCenter: "CRDV VFS Global",
    },
  },
  {
    id: "case-4",
    reference: "DOS-2026-00120",
    clientId: "cli-4",
    clientName: "Marie-Louise Banyingela",
    category: "tourist_visa",
    categoryLabel: "Visa touristique",
    title: "Visite familiale et séjour touristique — Belgique",
    destinationCountry: "Belgique",
    destinationFlag: "🇧🇪",
    status: "active",
    stepStatusLabel: "Vérification interne des pièces",
    currentStep: "Prise de rendez-vous TLScontact",
    priority: "normal",
    assignedTo: "Celse Laurin Nkaya",
    nextAction: "Réserver créneau de dépôt biométrique chez TLScontact",
    nextActionDueAt: "02/11/2026",
    createdAt: "2026-10-15",
    currency: "XAF",
    totalAmountMinor: 350000,
    paidAmountMinor: 200000,
    balanceMinor: 150000,
    missingDocsCount: 1,
    tags: ["Tourisme", "Visite privée"],
    intakeDetails: {
      consulateCenter: "Centre TLScontact Kinshasa",
    },
  },
  {
    id: "case-5",
    reference: "DOS-2026-00115",
    clientId: "cli-5",
    clientName: "Christian Fotso",
    category: "business_travel",
    categoryLabel: "Voyage d'affaires",
    title: "Foire de Canton & Visite Fournisseurs — Guangzhou (Chine)",
    destinationCountry: "Chine",
    destinationFlag: "🇨🇳",
    status: "closed",
    stepStatusLabel: "Visa délivré & Dossier remis",
    currentStep: "Clôturé",
    priority: "low",
    assignedTo: "Marcelle Eboa",
    nextAction: "Dossier soldé et archivé",
    nextActionDueAt: "15/10/2026",
    createdAt: "2026-09-01",
    currency: "XAF",
    totalAmountMinor: 650000,
    paidAmountMinor: 650000,
    balanceMinor: 0,
    missingDocsCount: 0,
    tags: ["Affaires", "Terminé"],
  },
];

// Initial Tasks
export const initialTasks: Task[] = [
  {
    id: "task-1",
    title: "Vérifier l'authenticité de l'Attestation AVI reçue de la banque",
    category: "document",
    caseReference: "DOS-2026-00117",
    clientName: "Arnaud Tchouameni",
    dueAt: "Aujourd'hui à 15:00",
    isUrgent: true,
    assignedTo: "Celse Laurin Nkaya",
    status: "todo",
  },
  {
    id: "task-2",
    title: "Relancer le client pour le passeport scanné en haute résolution",
    category: "client_follow_up",
    caseReference: "DOS-2026-00119",
    clientName: "Koffi Mensah",
    dueAt: "Aujourd'hui à 17:30",
    isUrgent: true,
    assignedTo: "Jean-Paul Kamga",
    status: "todo",
  },
  {
    id: "task-3",
    title: "Préparer la simulation d'entretien consulaire Campus France",
    category: "appointment",
    caseReference: "DOS-2026-00117",
    clientName: "Arnaud Tchouameni",
    dueAt: "Demain à 10:00",
    isUrgent: false,
    assignedTo: "Celse Laurin Nkaya",
    status: "todo",
  },
  {
    id: "task-4",
    title: "Confirmer la réception du virement d'acompte de 200 000 XAF",
    category: "finance",
    caseReference: "DOS-2026-00120",
    clientName: "Marie-Louise Banyingela",
    dueAt: "28/10/2026",
    isUrgent: false,
    assignedTo: "Marcelle Eboa",
    status: "in_progress",
  },
];

// Initial Appointments
export const initialAppointments: Appointment[] = [
  {
    id: "apt-1",
    title: "Simulation & Préparation d'entretien consulaire",
    kind: "prep_interview",
    kindLabel: "Entretien de préparation",
    clientName: "Arnaud Tchouameni",
    caseReference: "DOS-2026-00117",
    date: "28/10/2026",
    time: "10:30 - 11:30",
    location: "Salle de réunion A (Agence Douala)",
    assignedAdvisor: "Celse Laurin Nkaya",
    status: "confirmed",
  },
  {
    id: "apt-2",
    title: "Dépôt des empreintes biométriques (VFS Global)",
    kind: "consular_deposit",
    kindLabel: "Dépôt consulaire",
    clientName: "Aminata Diallo",
    caseReference: "DOS-2026-00118",
    date: "29/10/2026",
    time: "08:45 - 09:30",
    location: "Centre VFS Global Bonanjo",
    assignedAdvisor: "Marcelle Eboa",
    status: "confirmed",
  },
  {
    id: "apt-3",
    title: "Consultation initiale orientation études Canada",
    kind: "consultation",
    kindLabel: "Première consultation",
    clientName: "Samuel Eto'o Junior",
    date: "31/10/2026",
    time: "14:00 - 15:00",
    location: "Bureau Direction SELECT Agency",
    assignedAdvisor: "Celse Laurin Nkaya",
    status: "planned",
  },
];

// Activity Feed
export const initialActivities: ActivityEvent[] = [
  {
    id: "act-1",
    type: "document",
    title: "Document téléversé",
    description: "Relevé de notes Licence 3 téléversé pour le dossier DOS-2026-00117.",
    timestamp: "Il y a 35 minutes",
    actor: "Arnaud Tchouameni",
  },
  {
    id: "act-2",
    type: "payment",
    title: "Paiement enregistré",
    description: "Encaissement acompte de 200 000 XAF via Orange Money pour le dossier DOS-2026-00120 (Reçu REC-2026-00088).",
    timestamp: "Il y a 2 heures",
    actor: "Marcelle Eboa",
  },
  {
    id: "act-3",
    type: "status_change",
    title: "Changement d'étape",
    description: "Dossier DOS-2026-00118 passé à l'étape 'Dépôt e-Visa effectué' après validation des pièces.",
    timestamp: "Il y a 4 heures",
    actor: "Marcelle Eboa",
  },
  {
    id: "act-4",
    type: "appointment",
    title: "Rendez-vous fixé",
    description: "Entretien de préparation programmé pour Arnaud Tchouameni le 28/10 à 10:30.",
    timestamp: "Hier à 17:15",
    actor: "Celse Laurin Nkaya",
  },
  {
    id: "act-5",
    type: "client_created",
    title: "Nouveau client enregistré",
    description: "Fiche client créée pour Marie-Louise Banyingela (CLI-2026-00045).",
    timestamp: "Le 14/10/2026",
    actor: "Celse Laurin Nkaya",
  },
];

// Dashboard Metrics
export const mockMetrics = {
  totalClients: 48,
  activeCases: 19,
  incompleteCases: 7,
  upcomingAppointments: 6,
  receivedPaymentsMinor: 14850000,
  balanceDueMinor: 5400000,
  currency: "XAF",
};

// Formatting helpers
export function formatMoney(amountMinor: number, currency: string = "XAF"): string {
  // XAF / XOF have 0 decimals
  if (currency === "XAF" || currency === "XOF") {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amountMinor);
  }

  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}
