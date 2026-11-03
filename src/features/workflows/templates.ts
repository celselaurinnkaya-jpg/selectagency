import type { CaseCategory, CaseOutcome, StepKind, StepTransitionOption } from "@/lib/domain/types";

// Modèles de départ (plan §8.2). Ce sont des exemples indicatifs : les démarches réelles dépendent
// de la destination, du pays de résidence et de la situation du demandeur.
// Chaque dossier reçoit une COPIE de son modèle à la création : modifier un modèle ne change pas
// les dossiers en cours.

export interface TemplateStep {
  key: string;
  label: string;
  kind: StepKind;
  optional?: boolean;
  outcome?: CaseOutcome;
  /** Transitions explicites. Sans précision, on passe à l'étape suivante du modèle. */
  next?: StepTransitionOption[];
}

export interface WorkflowTemplate {
  key: string;
  name: string;
  category: CaseCategory;
  description: string;
  steps: TemplateStep[];
}

export const WORKFLOW_DISCLAIMER =
  "Modèle indicatif : les démarches réelles dépendent de la destination, du pays de résidence et de la situation du demandeur. Vérifiez auprès des sources officielles.";

const closeOption: StepTransitionOption = { to: "closed", label: "Clôturer le dossier" };

/** Fin commune des procédures d'études : visa, décision, départ. */
const studyVisaSteps = (retryKey: string): TemplateStep[] => [
  { key: "visa_prep", label: "Préparation du dossier de visa", kind: "agency_action" },
  { key: "visa_submission", label: "Rendez-vous et dépôt du dossier de visa", kind: "external_event" },
  {
    key: "visa_decision_wait",
    label: "Attente de la décision de visa",
    kind: "external_event",
    next: [
      { to: "visa_granted", label: "Visa accordé" },
      { to: "visa_refused", label: "Visa refusé" },
    ],
  },
  { key: "visa_granted", label: "Visa accordé", kind: "outcome", outcome: "approved", next: [{ to: "departure_prep", label: "Préparer le départ" }] },
  {
    key: "visa_refused",
    label: "Visa refusé",
    kind: "outcome",
    outcome: "refused",
    next: [{ to: "visa_prep", label: "Préparer une nouvelle demande" }, { to: retryKey, label: "Reprendre les candidatures" }, closeOption],
  },
  { key: "departure_prep", label: "Préparation du départ", kind: "agency_action" },
  { key: "closed", label: "Dossier clôturé", kind: "closure" },
];

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    key: "campus_france",
    name: "Études en France — Campus France",
    category: "study_abroad",
    description: "Procédure Études en France : dossier en ligne, entretien, réponses des établissements, puis visa.",
    steps: [
      { key: "new_candidate", label: "Nouveau candidat", kind: "agency_action" },
      { key: "account", label: "Création du compte Études en France", kind: "agency_action" },
      { key: "documents", label: "Collecte des documents", kind: "client_action" },
      { key: "programs", label: "Choix des formations et saisie du dossier", kind: "agency_action" },
      { key: "fees", label: "Paiement des frais de dossier", kind: "client_action" },
      { key: "interview", label: "Entretien pédagogique", kind: "external_event" },
      {
        key: "institution_response",
        label: "Réponses des établissements",
        kind: "external_event",
        next: [
          { to: "visa_prep", label: "Admission acceptée : préparer le visa" },
          { to: "programs", label: "Pas d'admission : choisir d'autres formations" },
          closeOption,
        ],
      },
      ...studyVisaSteps("programs"),
    ],
  },
  {
    key: "parcoursup",
    name: "Études en France — Parcoursup",
    category: "study_abroad",
    description: "Admission en première année : vœux, dossier, propositions des formations, puis visa.",
    steps: [
      { key: "new_candidate", label: "Nouveau candidat", kind: "agency_action" },
      { key: "registration", label: "Inscription sur la plateforme", kind: "agency_action" },
      { key: "documents", label: "Collecte des bulletins et documents", kind: "client_action" },
      { key: "wishes", label: "Formulation des vœux", kind: "agency_action" },
      { key: "file", label: "Projets de formation motivés et confirmation des vœux", kind: "agency_action" },
      {
        key: "institution_response",
        label: "Propositions des formations",
        kind: "external_event",
        next: [
          { to: "visa_prep", label: "Proposition acceptée : préparer le visa" },
          { to: "wishes", label: "Aucune proposition : phase complémentaire" },
          closeOption,
        ],
      },
      ...studyVisaSteps("wishes"),
    ],
  },
  {
    key: "private_school",
    name: "Admission dans une école privée",
    category: "study_abroad",
    description: "Candidature directe auprès d'une école privée : dossier, entretien, inscription, puis visa.",
    steps: [
      { key: "new_candidate", label: "Nouveau candidat", kind: "agency_action" },
      { key: "school_choice", label: "Choix de l'école et du programme", kind: "agency_action" },
      { key: "documents", label: "Collecte des documents", kind: "client_action" },
      { key: "application", label: "Envoi du dossier de candidature", kind: "agency_action" },
      { key: "admission_test", label: "Entretien ou test d'admission", kind: "external_event", optional: true },
      {
        key: "institution_response",
        label: "Décision de l'école",
        kind: "external_event",
        next: [
          { to: "enrolment", label: "Admis : inscription" },
          { to: "school_choice", label: "Refusé : choisir une autre école" },
          closeOption,
        ],
      },
      { key: "enrolment", label: "Inscription et paiement de l'acompte", kind: "client_action" },
      { key: "enrolment_proof", label: "Attestation d'inscription reçue", kind: "external_event" },
      ...studyVisaSteps("school_choice"),
    ],
  },
  {
    key: "study_abroad",
    name: "Études à l'étranger (autre procédure)",
    category: "study_abroad",
    description: "Candidature dans un établissement puis demande de visa d'études.",
    steps: [
      { key: "new_candidate", label: "Nouveau candidat", kind: "agency_action" },
      { key: "registration", label: "Inscription auprès de l'agence", kind: "agency_action" },
      { key: "initial_check", label: "Vérification initiale", kind: "agency_action" },
      { key: "documents", label: "Collecte des documents", kind: "client_action" },
      { key: "application_prep", label: "Préparation de la candidature", kind: "agency_action" },
      { key: "study_procedure", label: "Procédure liée aux études, si applicable", kind: "external_event", optional: true },
      { key: "interview_prep", label: "Préparation de l'entretien", kind: "agency_action", optional: true },
      {
        key: "institution_response",
        label: "Attente de la réponse de l'établissement",
        kind: "external_event",
        next: [
          { to: "visa_prep", label: "Admission obtenue : préparer le dossier de visa" },
          { to: "application_prep", label: "Pas d'admission : candidater ailleurs" },
          closeOption,
        ],
      },
      { key: "visa_prep", label: "Préparation du dossier de visa", kind: "agency_action" },
      { key: "visa_submission", label: "Rendez-vous et dépôt du dossier", kind: "external_event" },
      {
        key: "visa_decision_wait",
        label: "Attente de la décision",
        kind: "external_event",
        next: [
          { to: "visa_granted", label: "Visa accordé" },
          { to: "visa_refused", label: "Visa refusé" },
        ],
      },
      { key: "visa_granted", label: "Visa accordé", kind: "outcome", outcome: "approved", next: [{ to: "departure_prep", label: "Préparer le départ" }] },
      {
        key: "visa_refused",
        label: "Visa refusé",
        kind: "outcome",
        outcome: "refused",
        next: [{ to: "visa_prep", label: "Préparer une nouvelle demande" }, closeOption],
      },
      { key: "departure_prep", label: "Préparation du départ", kind: "agency_action" },
      { key: "closed", label: "Dossier clôturé", kind: "closure" },
    ],
  },
  {
    key: "tourist_visa",
    name: "Visa touristique (avec rendez-vous)",
    category: "tourist_visa",
    description: "Demande de visa court séjour avec rendez-vous de dépôt.",
    steps: [
      { key: "request", label: "Demande reçue", kind: "agency_action" },
      { key: "assessment", label: "Évaluation du profil et de la destination", kind: "agency_action" },
      { key: "quote_deposit", label: "Devis et acompte", kind: "agency_action" },
      { key: "documents", label: "Collecte des documents", kind: "client_action" },
      { key: "internal_check", label: "Vérification interne des pièces", kind: "agency_action" },
      { key: "appointment_booking", label: "Prise de rendez-vous de dépôt", kind: "external_event" },
      { key: "travel_proofs", label: "Justificatifs de voyage réels (hébergement, transport, assurance)", kind: "client_action" },
      { key: "submission", label: "Dépôt du dossier et biométrie", kind: "external_event" },
      {
        key: "decision_wait",
        label: "Attente de la décision",
        kind: "external_event",
        next: [
          { to: "visa_granted", label: "Visa accordé" },
          { to: "visa_refused", label: "Visa refusé" },
        ],
      },
      { key: "visa_granted", label: "Visa accordé", kind: "outcome", outcome: "approved", next: [{ to: "passport_return", label: "Remettre le passeport" }] },
      {
        key: "visa_refused",
        label: "Visa refusé",
        kind: "outcome",
        outcome: "refused",
        next: [{ to: "internal_check", label: "Préparer une nouvelle demande" }, closeOption],
      },
      { key: "passport_return", label: "Remise du passeport", kind: "agency_action" },
      { key: "closed", label: "Dossier clôturé", kind: "closure" },
    ],
  },
  {
    key: "business_travel",
    name: "Voyage d'affaires",
    category: "business_travel",
    description: "Mission professionnelle, avec demande de visa si nécessaire.",
    steps: [
      { key: "request", label: "Demande reçue", kind: "agency_action" },
      { key: "invitation", label: "Invitation ou ordre de mission", kind: "client_action" },
      { key: "visa_prep", label: "Préparation de la demande de visa", kind: "agency_action", optional: true },
      { key: "visa_submission", label: "Dépôt de la demande de visa", kind: "external_event", optional: true },
      {
        key: "visa_decision_wait",
        label: "Attente de la décision du visa",
        kind: "external_event",
        optional: true,
        next: [
          { to: "visa_granted", label: "Visa accordé" },
          { to: "visa_refused", label: "Visa refusé" },
        ],
      },
      { key: "visa_granted", label: "Visa accordé", kind: "outcome", outcome: "approved", next: [{ to: "bookings", label: "Passer aux réservations" }] },
      {
        key: "visa_refused",
        label: "Visa refusé",
        kind: "outcome",
        outcome: "refused",
        next: [{ to: "visa_prep", label: "Préparer une nouvelle demande" }, closeOption],
      },
      { key: "bookings", label: "Réservations confirmées par les prestataires", kind: "external_event" },
      { key: "departure", label: "Départ", kind: "agency_action" },
      { key: "closed", label: "Dossier clôturé", kind: "closure" },
    ],
  },
  {
    key: "administrative_support",
    name: "Accompagnement administratif",
    category: "administrative_support",
    description: "Constitution et suivi d'un dossier auprès d'une administration.",
    steps: [
      { key: "request", label: "Demande reçue", kind: "agency_action" },
      { key: "analysis", label: "Analyse de la démarche", kind: "agency_action" },
      { key: "documents", label: "Collecte des documents", kind: "client_action" },
      { key: "file_build", label: "Constitution du dossier", kind: "agency_action" },
      { key: "submission", label: "Dépôt auprès de l'administration", kind: "external_event" },
      { key: "follow_up", label: "Suivi de la demande", kind: "agency_action" },
      { key: "result", label: "Réponse de l'administration", kind: "external_event" },
      { key: "closed", label: "Dossier clôturé", kind: "closure" },
    ],
  },
  {
    key: "custom_trip",
    name: "Voyage ou séjour personnalisé",
    category: "custom_trip",
    description: "Organisation d'un séjour sur mesure.",
    steps: [
      { key: "request", label: "Demande reçue", kind: "agency_action" },
      { key: "proposal", label: "Proposition et devis", kind: "agency_action" },
      { key: "agreement_deposit", label: "Accord du client et acompte", kind: "client_action" },
      { key: "bookings", label: "Réservations confirmées par les prestataires", kind: "external_event" },
      { key: "balance", label: "Paiement du solde", kind: "client_action" },
      { key: "travel_docs", label: "Remise des documents de voyage", kind: "agency_action" },
      { key: "travel", label: "Voyage", kind: "agency_action" },
      { key: "feedback", label: "Retour et avis du client", kind: "agency_action", optional: true },
      { key: "closed", label: "Dossier clôturé", kind: "closure" },
    ],
  },
  {
    key: "other_mobility",
    name: "Autre projet de mobilité",
    category: "other_mobility",
    description: "Modèle court et générique, à adapter par l'agence.",
    steps: [
      { key: "request", label: "Demande reçue", kind: "agency_action" },
      { key: "analysis", label: "Analyse du projet", kind: "agency_action" },
      { key: "file_build", label: "Constitution du dossier", kind: "agency_action" },
      { key: "external_step", label: "Démarche auprès d'un organisme", kind: "external_event" },
      { key: "result", label: "Résultat de la démarche", kind: "external_event" },
      { key: "closed", label: "Dossier clôturé", kind: "closure" },
    ],
  },
];

/** Modèle par défaut d'un type de projet (pour les études : la procédure générale). */
export function templateForCategory(category: CaseCategory): WorkflowTemplate {
  const template = WORKFLOW_TEMPLATES.find((t) => t.category === category && t.key === category) ?? WORKFLOW_TEMPLATES.find((t) => t.category === category);
  if (!template) throw new Error(`Aucun modèle de workflow pour la catégorie ${category}`);
  return template;
}

/** Nom affiché du type de dossier : la procédure pour les études (Campus France, Parcoursup…), sinon le libellé donné. */
export function caseKindLabel(templateKey: string | undefined, fallback: string): string {
  const template = templateKey ? templateByKey(templateKey) : undefined;
  return template && template.category === "study_abroad" && template.key !== "study_abroad" ? template.name : fallback;
}

/** Procédures proposées pour un type de projet (plusieurs pour les études : Campus France, Parcoursup…). */
export function templatesForCategory(category: CaseCategory): WorkflowTemplate[] {
  return WORKFLOW_TEMPLATES.filter((t) => t.category === category);
}

/** Modèle choisi à la création d'un dossier : la procédure demandée si elle va avec le type de projet. */
export function resolveTemplate(category: CaseCategory, key?: string): WorkflowTemplate {
  return WORKFLOW_TEMPLATES.find((t) => t.key === key && t.category === category) ?? templateForCategory(category);
}

/**
 * Une étape peut-elle être retirée d'un modèle personnalisé ? Non pour les décisions, la clôture,
 * les étapes qui proposent un choix et celles vers lesquelles un choix renvoie : le dossier doit
 * toujours pouvoir avancer.
 */
export function isStructuralStep(step: TemplateStep, steps: TemplateStep[]): boolean {
  return step.kind === "outcome" || step.kind === "closure" || !!step.next?.length || steps.some((s) => s.next?.some((n) => n.to === step.key));
}

export function templateByKey(key: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.key === key);
}
