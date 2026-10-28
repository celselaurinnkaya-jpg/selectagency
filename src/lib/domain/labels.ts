import type {
  AppointmentKind,
  AppointmentStatus,
  ApplicantTag,
  CaseCategory,
  CaseOutcome,
  CasePriority,
  CaseStatus,
  ClientType,
  ConfirmationLevel,
  MemberRole,
  RequirementStatus,
  StepKind,
  TaskStatus,
} from "./types";

// Libellés affichés et tonalités de badge. Une seule table par énumération :
// le même statut a toujours la même couleur, le même libellé et la même icône partout.

export type Tone = "navy" | "success" | "warning" | "danger" | "info" | "external" | "neutral";

export interface LabelSpec {
  label: string;
  tone: Tone;
}

export const CATEGORY_LABELS: Record<CaseCategory, string> = {
  study_abroad: "Études à l'étranger",
  tourist_visa: "Visa touristique",
  business_travel: "Voyage d'affaires",
  administrative_support: "Accompagnement administratif",
  other_mobility: "Autre projet de mobilité",
  custom_trip: "Voyage ou séjour personnalisé",
};

export const CATEGORY_SHORT_LABELS: Record<CaseCategory, string> = {
  study_abroad: "Études",
  tourist_visa: "Tourisme",
  business_travel: "Affaires",
  administrative_support: "Démarches",
  other_mobility: "Autre mobilité",
  custom_trip: "Séjour sur mesure",
};

export const CASE_STATUS: Record<CaseStatus, LabelSpec> = {
  active: { label: "Actif", tone: "navy" },
  on_hold: { label: "En pause", tone: "warning" },
  cancelled: { label: "Annulé", tone: "neutral" },
  closed: { label: "Clôturé", tone: "success" },
};

export const CASE_OUTCOME: Record<CaseOutcome, LabelSpec> = {
  pending: { label: "Décision en attente", tone: "neutral" },
  approved: { label: "Accordé", tone: "success" },
  refused: { label: "Refusé", tone: "danger" },
  withdrawn: { label: "Abandonné", tone: "neutral" },
  completed: { label: "Réalisé", tone: "success" },
};

export const PRIORITY: Record<CasePriority, LabelSpec> = {
  low: { label: "Basse", tone: "neutral" },
  normal: { label: "Normale", tone: "info" },
  high: { label: "Haute", tone: "warning" },
  urgent: { label: "Urgente", tone: "danger" },
};

/** Qui doit agir à cette étape : c'est la distinction exigée entre l'agence, le client et les tiers. */
export const STEP_KIND: Record<StepKind, LabelSpec & { waitingLabel: string }> = {
  agency_action: { label: "Action de l'agence", tone: "navy", waitingLabel: "À traiter par l'agence" },
  client_action: { label: "Action du client", tone: "warning", waitingLabel: "En attente du client" },
  external_event: { label: "Organisme extérieur", tone: "external", waitingLabel: "En attente d'un tiers" },
  outcome: { label: "Résultat", tone: "success", waitingLabel: "Résultat enregistré" },
  closure: { label: "Clôture", tone: "neutral", waitingLabel: "Clôture" },
};

export const CONFIRMATION: Record<ConfirmationLevel, LabelSpec> = {
  expected: { label: "Prévu", tone: "neutral" },
  declared: { label: "Déclaré, non vérifié", tone: "warning" },
  confirmed: { label: "Confirmé, justificatif au dossier", tone: "success" },
};

export const REQUIREMENT_STATUS: Record<RequirementStatus, LabelSpec> = {
  not_received: { label: "Non reçu", tone: "danger" },
  received: { label: "Reçu", tone: "info" },
  to_verify: { label: "À vérifier", tone: "warning" },
  validated: { label: "Vérifié par l'agence", tone: "success" },
  to_correct: { label: "À corriger", tone: "danger" },
  expired: { label: "Expiré", tone: "danger" },
  waived: { label: "Non applicable", tone: "neutral" },
};

export const APPOINTMENT_KIND: Record<AppointmentKind, string> = {
  consultation: "Consultation",
  prep_interview: "Préparation d'entretien",
  administrative: "Rendez-vous administratif",
  application_deadline: "Échéance de candidature",
  document_deadline: "Date limite de pièces",
  follow_up: "Suivi",
  departure: "Départ prévu",
};

export const APPOINTMENT_STATUS: Record<AppointmentStatus, LabelSpec> = {
  planned: { label: "Prévu", tone: "info" },
  awaiting_confirmation: { label: "En attente de confirmation", tone: "warning" },
  confirmed: { label: "Confirmé", tone: "success" },
  done: { label: "Terminé", tone: "neutral" },
  cancelled: { label: "Annulé", tone: "neutral" },
};

export const TASK_STATUS: Record<TaskStatus, LabelSpec> = {
  todo: { label: "À faire", tone: "info" },
  in_progress: { label: "En cours", tone: "navy" },
  done: { label: "Terminée", tone: "success" },
  cancelled: { label: "Annulée", tone: "neutral" },
};

export const CLIENT_TYPE: Record<ClientType, string> = {
  individual: "Particulier",
  student: "Étudiant",
  professional: "Professionnel",
  company: "Entreprise",
};

export const ROLE: Record<MemberRole, LabelSpec & { description: string }> = {
  owner: { label: "Propriétaire", tone: "navy", description: "Tous les droits, abonnement et fermeture de l'agence." },
  admin: { label: "Administrateur", tone: "navy", description: "Gestion de l'équipe, des paramètres et de tous les dossiers." },
  agent: { label: "Agent", tone: "info", description: "Clients, dossiers, documents, rendez-vous et tâches." },
  accountant: { label: "Comptable", tone: "success", description: "Paiements, reçus, dépenses et rapports financiers." },
  viewer: { label: "Lecture seule", tone: "neutral", description: "Consultation, sans finance ni documents." },
};

export const APPLICANT_TAGS: Record<ApplicantTag, string> = {
  student: "Étudiant",
  employee: "Salarié",
  self_employed: "Indépendant",
  minor: "Mineur",
  sponsored: "Pris en charge par un garant",
};

export const LANGUAGES: Record<string, string> = {
  fr: "Français",
  en: "Anglais (English)",
  ar: "Arabe (العربية)",
  es: "Espagnol (Español)",
  pt: "Portugais (Português)",
  de: "Allemand (Deutsch)",
  ln: "Lingala",
  sw: "Swahili (Kiswahili)",
  wo: "Wolof",
  bm: "Bambara / Dioula",
  ha: "Haoussa",
  yo: "Yoruba",
  ff: "Peul (Fulfulde)",
  other: "Autre langue",
};

export const GENDER_OPTIONS: Record<string, string> = {
  M: "Masculin (Homme)",
  F: "Féminin (Femme)",
  other: "Non précisé",
};

export const MARITAL_STATUS: Record<string, string> = {
  single: "Célibataire",
  married: "Marié(e)",
  divorced: "Divorcé(e)",
  widowed: "Veuf / Veuve",
  other: "Autre situation",
};

export const ID_DOC_TYPES: Record<string, string> = {
  passport: "Passeport ordinaire / biométrique",
  cni: "Carte Nationale d'Identité (CNI)",
  residence_permit: "Titre ou carte de séjour",
  other: "Autre pièce officielle",
};

export const SERVICE_MOTIVES: Record<string, string> = {
  study_abroad: "Études à l'étranger (Campus / Admission / Visa)",
  tourist_visa: "Visa touristique / Visite privée ou familiale",
  business_travel: "Voyage d'affaires / Mission professionnelle",
  family_reunion: "Regroupement familial / Installation",
  administrative: "Démarche et accompagnement administratif",
  custom_trip: "Séjour personnalisé / Billetterie",
  other: "Autre projet de mobilité",
};

