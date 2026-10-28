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
  Task,
  TravelCase,
} from "@/lib/domain/types";
import { buildRequirements } from "@/features/documents/checklists";
import { instantiateSteps } from "@/features/workflows/instantiate";
import { templateByKey } from "@/features/workflows/templates";

// Données FICTIVES de démonstration. Elles sont cohérentes entre elles (montants, reçus, étapes)
// pour que chaque écran raconte la même histoire. Aucune n'est issue d'une agence réelle.

export interface DemoDatabase {
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
  counters: Record<string, number>;
}

const t = (date: string, time = "09:00") => `${date}T${time}:00+01:00`;

function requirements(
  base: DocumentRequirement[],
  updates: Record<string, Partial<DocumentRequirement>>,
): DocumentRequirement[] {
  return base.map((r) => ({ ...r, ...updates[r.documentTypeCode] }));
}

const validated = (fileName: string, receivedAt: string, reviewedBy: string, expiresAt?: string): Partial<DocumentRequirement> => ({
  status: "validated",
  fileName,
  receivedAt,
  reviewedAt: receivedAt,
  reviewedBy,
  expiresAt,
});

export function createSeed(): DemoDatabase {
  const members: Member[] = [
    { id: "m1", fullName: "Celse Laurin Nkaya", email: "direction@horizon-voyages.example", role: "owner", jobTitle: "Directeur d'agence" },
    { id: "m2", fullName: "Marcelle Eboa", email: "marcelle.eboa@horizon-voyages.example", role: "agent", jobTitle: "Conseillère principale" },
    { id: "m3", fullName: "Jean-Paul Kamga", email: "jp.kamga@horizon-voyages.example", role: "agent", jobTitle: "Conseiller études" },
    { id: "m4", fullName: "Rose Ngo Bassong", email: "comptabilite@horizon-voyages.example", role: "accountant", jobTitle: "Comptable" },
  ];

  const clients: Client[] = [
    { id: "cli-42", reference: "CLI-2026-00042", clientType: "student", firstName: "Arnaud", lastName: "Tchouameni", email: "arnaud.t@example.com", phoneE164: "+237690000142", whatsappE164: "+237690000142", residenceCountry: "CM", city: "Douala", preferredLanguage: "fr", registeredAt: t("2026-09-12"), assignedTo: "m1", passportLast4: "8472", notes: "Projet de master en informatique en France, rentrée de janvier 2027.", isDemoFixture: true },
    { id: "cli-43", reference: "CLI-2026-00043", clientType: "professional", firstName: "Aminata", lastName: "Diallo", email: "aminata.diallo@example.com", phoneE164: "+237690000143", whatsappE164: "+237690000143", residenceCountry: "CM", city: "Douala", preferredLanguage: "fr", registeredAt: t("2026-10-08"), assignedTo: "m2", passportLast4: "1923", notes: "Déplacements professionnels réguliers ; salon à Dubaï en novembre.", isDemoFixture: true },
    { id: "cli-44", reference: "CLI-2026-00044", clientType: "student", firstName: "Koffi", lastName: "Mensah", email: "k.mensah@example.com", phoneE164: "+237690000144", residenceCountry: "CM", city: "Yaoundé", preferredLanguage: "fr", registeredAt: t("2026-10-01"), assignedTo: "m3", passportLast4: "5501", notes: "Candidature en génie logiciel au Canada ; le garant est son oncle.", isDemoFixture: true },
    { id: "cli-45", reference: "CLI-2026-00045", clientType: "individual", firstName: "Marie-Louise", lastName: "Banyingela", email: "ml.banyingela@example.com", phoneE164: "+237690000145", whatsappE164: "+237690000145", residenceCountry: "CM", city: "Douala", preferredLanguage: "fr", registeredAt: t("2026-10-14"), assignedTo: "m1", passportLast4: "3389", notes: "Visite familiale en Belgique, séjour de trois semaines.", isDemoFixture: true },
    { id: "cli-46", reference: "CLI-2026-00046", clientType: "company", firstName: "Christian", lastName: "Fotso", email: "c.fotso@example.com", phoneE164: "+237690000146", residenceCountry: "CM", city: "Yaoundé", preferredLanguage: "fr", registeredAt: t("2026-08-28"), assignedTo: "m2", passportLast4: "9042", notes: "Dirigeant d'entreprise ; voyages d'affaires fréquents.", isDemoFixture: true },
    { id: "cli-47", reference: "CLI-2026-00047", clientType: "student", firstName: "Samuel", lastName: "Ebongue", email: "s.ebongue@example.com", phoneE164: "+237690000147", residenceCountry: "CM", city: "Douala", preferredLanguage: "fr", registeredAt: t("2026-10-24"), assignedTo: "m3", notes: "Premier contact : projet d'études au Canada, à évaluer.", isDemoFixture: true },
  ];

  const cases: TravelCase[] = [
    { id: "dos-115", reference: "DOS-2026-00115", clientId: "cli-46", category: "business_travel", title: "Foire commerciale — Canton (Chine)", destinationCountry: "CN", residenceCountry: "CM", status: "closed", outcome: "approved", priority: "low", assignedTo: "m2", billingCurrency: "XAF", applicantTags: ["self_employed"], details: {}, openedAt: t("2026-09-01"), closedAt: t("2026-10-15", "11:00"), templateKey: "business_travel", plannedDepartureDate: "2026-10-12" },
    { id: "dos-117", reference: "DOS-2026-00117", clientId: "cli-42", category: "study_abroad", title: "Master 1 Informatique — Université Lyon 1", destinationCountry: "FR", residenceCountry: "CM", status: "active", outcome: "pending", priority: "high", assignedTo: "m1", nextAction: "Vérifier le justificatif de ressources et obtenir le justificatif d'hébergement", nextActionDueAt: t("2026-10-29", "17:00"), plannedDepartureDate: "2027-01-05", billingCurrency: "XAF", applicantTags: ["student"], details: { institution: "Université Claude Bernard Lyon 1", program: "Master 1 Informatique", intake: "Janvier 2027" }, openedAt: t("2026-09-15"), templateKey: "study_abroad" },
    { id: "dos-118", reference: "DOS-2026-00118", clientId: "cli-43", category: "business_travel", title: "Salon professionnel — Dubaï (e-Visa)", destinationCountry: "AE", residenceCountry: "CM", status: "active", outcome: "pending", priority: "urgent", assignedTo: "m2", nextAction: "Consulter le statut de la demande d'e-Visa", nextActionDueAt: t("2026-10-26", "12:00"), plannedDepartureDate: "2026-11-08", billingCurrency: "XAF", applicantTags: ["employee"], details: {}, openedAt: t("2026-10-10"), templateKey: "business_travel" },
    { id: "dos-119", reference: "DOS-2026-00119", clientId: "cli-44", category: "study_abroad", title: "Baccalauréat en génie logiciel — Université Laval", destinationCountry: "CA", residenceCountry: "CM", status: "active", outcome: "pending", priority: "normal", assignedTo: "m3", nextAction: "Obtenir les relevés bancaires du garant", nextActionDueAt: t("2026-10-30", "17:00"), plannedDepartureDate: "2027-08-15", billingCurrency: "XAF", applicantTags: ["student", "sponsored"], details: { institution: "Université Laval (Québec)", program: "Génie logiciel", intake: "Automne 2027" }, openedAt: t("2026-10-02"), templateKey: "study_abroad" },
    { id: "dos-120", reference: "DOS-2026-00120", clientId: "cli-45", category: "tourist_visa", title: "Visite familiale — Belgique (court séjour)", destinationCountry: "BE", residenceCountry: "CM", status: "active", outcome: "pending", priority: "normal", assignedTo: "m1", nextAction: "Obtenir la confirmation du rendez-vous de dépôt", nextActionDueAt: t("2026-10-29", "12:00"), plannedDepartureDate: "2026-12-12", billingCurrency: "XAF", applicantTags: ["employee"], details: {}, openedAt: t("2026-10-15"), templateKey: "tourist_visa" },
  ];

  const tpl = (key: string) => templateByKey(key)!;
  const steps: CaseStep[] = [
    ...instantiateSteps("dos-115", tpl("business_travel"), "closed", {
      visa_submission: { confirmationLevel: "confirmed", evidenceRef: "Récépissé de dépôt n° 2026-CN-0912 (copie au dossier)" },
      visa_decision_wait: { confirmationLevel: "confirmed", evidenceRef: "Page visa du passeport (copie au dossier)" },
      visa_granted: { confirmationLevel: "confirmed", evidenceRef: "Page visa du passeport (copie au dossier)" },
      visa_refused: { status: "skipped", note: "Non concerné" },
      bookings: { confirmationLevel: "confirmed", evidenceRef: "Confirmations de la compagnie et de l'hôtel" },
    }),
    ...instantiateSteps("dos-117", tpl("study_abroad"), "visa_prep", {
      study_procedure: { confirmationLevel: "confirmed", evidenceRef: "Référence de candidature enregistrée (capture au dossier)" },
      institution_response: { confirmationLevel: "confirmed", evidenceRef: "Lettre d'admission vérifiée par l'agence" },
    }),
    ...instantiateSteps("dos-118", tpl("business_travel"), "visa_decision_wait", {
      visa_submission: { confirmationLevel: "confirmed", evidenceRef: "Accusé de dépôt de la demande d'e-Visa (copie au dossier)" },
    }),
    ...instantiateSteps("dos-119", tpl("study_abroad"), "documents"),
    ...instantiateSteps("dos-120", tpl("tourist_visa"), "appointment_booking"),
  ];
  // L'étape courante d'un dossier externe en attente reste « prévue » tant que rien n'est confirmé.
  for (const step of steps) {
    if (step.status === "in_progress" && step.kind === "external_event") step.confirmationLevel = "expected";
  }

  const req = (c: TravelCase) => buildRequirements(c.id, c.category, c.destinationCountry, c.applicantTags);
  const [k115, k117, k118, k119, k120] = cases as [TravelCase, TravelCase, TravelCase, TravelCase, TravelCase];
  const requirementsList: DocumentRequirement[] = [
    ...requirements(req(k115), {
      passport: validated("passeport_fotso.pdf", t("2026-09-02"), "m2", "2031-02-10"),
      invitation_letter: validated("invitation_canton.pdf", t("2026-09-02"), "m2"),
      mission_order: validated("ordre_mission.pdf", t("2026-09-03"), "m2"),
      business_registration: validated("rccm_entreprise.pdf", t("2026-09-03"), "m2"),
      bank_statements: { status: "waived" },
    }),
    ...requirements(req(k117), {
      passport: validated("passeport_tchouameni.pdf", t("2026-09-16"), "m1", "2031-03-14"),
      id_photo: validated("photo_identite.jpg", t("2026-09-16"), "m1"),
      birth_certificate: validated("acte_naissance.pdf", t("2026-09-16"), "m1"),
      transcripts: validated("releves_notes_licence.pdf", t("2026-09-20"), "m1"),
      diplomas: validated("diplome_licence.pdf", t("2026-09-20"), "m1"),
      admission_letter: validated("lettre_admission_lyon1.pdf", t("2026-10-05"), "m1"),
      funding_proof: { status: "to_verify", fileName: "justificatif_ressources.pdf", receivedAt: t("2026-10-27", "09:30") },
    }),
    ...requirements(req(k118), {
      passport: validated("passeport_diallo.pdf", t("2026-10-10"), "m2", "2027-01-20"),
      invitation_letter: validated("invitation_salon.pdf", t("2026-10-10"), "m2"),
      mission_order: validated("ordre_mission_diallo.pdf", t("2026-10-10"), "m2"),
    }),
    ...requirements(req(k119), {
      passport: { status: "received", fileName: "passeport_mensah.jpg", receivedAt: t("2026-10-25", "16:10"), expiresAt: "2030-09-01" },
      id_photo: validated("photo_mensah.jpg", t("2026-10-03"), "m3"),
      birth_certificate: validated("acte_naissance_mensah.pdf", t("2026-10-03"), "m3"),
      transcripts: validated("releves_notes_mensah.pdf", t("2026-10-08"), "m3"),
      diplomas: { status: "to_correct", fileName: "diplomes_mensah.jpg", receivedAt: t("2026-10-08"), reviewedBy: "m3", reviewedAt: t("2026-10-26", "10:00"), reviewComment: "Copie illisible : demander un scan en couleur, page entière." },
      admission_letter: validated("admission_laval.pdf", t("2026-10-20"), "m3"),
      sponsor_statement: validated("engagement_garant.pdf", t("2026-10-08"), "m3"),
    }),
    ...requirements(req(k120), {
      passport: validated("passeport_banyingela.pdf", t("2026-10-16"), "m1", "2030-05-02"),
      id_photo: validated("photo_banyingela.jpg", t("2026-10-16"), "m1"),
      bank_statements: validated("releves_banyingela.pdf", t("2026-10-18"), "m1"),
      accommodation_proof: validated("attestation_accueil.pdf", t("2026-10-18"), "m1"),
      employment_certificate: validated("attestation_travail.pdf", t("2026-10-18"), "m1"),
    }),
  ];

  const appointments: Appointment[] = [
    { id: "rdv-1", caseId: "dos-117", clientId: "cli-42", kind: "prep_interview", title: "Préparation à l'entretien", startsAt: t("2026-10-28", "10:30"), endsAt: t("2026-10-28", "11:30"), allDay: false, location: "Agence — salle de réunion", assignedTo: "m1", status: "confirmed" },
    { id: "rdv-2", caseId: "dos-119", clientId: "cli-44", kind: "document_deadline", title: "Date limite : relevés bancaires du garant", startsAt: t("2026-10-30", "17:00"), allDay: false, assignedTo: "m3", status: "planned" },
    { id: "rdv-3", clientId: "cli-47", kind: "consultation", title: "Première consultation — projet d'études", startsAt: t("2026-10-31", "14:00"), endsAt: t("2026-10-31", "15:00"), allDay: false, location: "Agence — bureau 2", assignedTo: "m3", status: "planned" },
    { id: "rdv-4", caseId: "dos-117", clientId: "cli-42", kind: "follow_up", title: "Point d'étape avec le client", startsAt: t("2026-11-03", "15:00"), endsAt: t("2026-11-03", "15:30"), allDay: false, location: "Appel téléphonique", assignedTo: "m1", status: "planned" },
    { id: "rdv-5", caseId: "dos-120", clientId: "cli-45", kind: "administrative", title: "Dépôt de la demande de visa (centre de dépôt)", startsAt: t("2026-11-05", "09:00"), endsAt: t("2026-11-05", "10:00"), allDay: false, location: "Centre de dépôt des demandes de visa, Douala", assignedTo: "m1", status: "awaiting_confirmation" },
    { id: "rdv-6", caseId: "dos-118", clientId: "cli-43", kind: "departure", title: "Départ prévu — Dubaï", startsAt: t("2026-11-08", "00:00"), allDay: true, assignedTo: "m2", status: "planned" },
  ];

  const tasks: Task[] = [
    { id: "tache-1", title: "Vérifier le justificatif de ressources reçu", caseId: "dos-117", clientId: "cli-42", assignedTo: "m1", dueAt: t("2026-10-27", "15:00"), priority: "high", status: "todo" },
    { id: "tache-2", title: "Relancer le client : relevés bancaires du garant", caseId: "dos-119", clientId: "cli-44", assignedTo: "m3", dueAt: t("2026-10-27", "17:30"), priority: "high", status: "todo" },
    { id: "tache-3", title: "Préparer la simulation d'entretien", caseId: "dos-117", clientId: "cli-42", assignedTo: "m1", dueAt: t("2026-10-28", "09:00"), priority: "normal", status: "todo" },
    { id: "tache-4", title: "Demander un nouveau scan des diplômes", caseId: "dos-119", clientId: "cli-44", assignedTo: "m3", dueAt: t("2026-10-28", "12:00"), priority: "normal", status: "todo" },
    { id: "tache-5", title: "Obtenir la confirmation du rendez-vous de dépôt", caseId: "dos-120", clientId: "cli-45", assignedTo: "m1", dueAt: t("2026-10-29", "12:00"), priority: "normal", status: "in_progress" },
    { id: "tache-6", title: "Consulter le statut de la demande d'e-Visa", caseId: "dos-118", clientId: "cli-43", assignedTo: "m2", dueAt: t("2026-10-26", "12:00"), priority: "high", status: "todo" },
    { id: "tache-7", title: "Remettre le passeport au client", caseId: "dos-115", clientId: "cli-46", assignedTo: "m2", dueAt: t("2026-10-14", "16:00"), priority: "normal", status: "done", completedAt: t("2026-10-14", "15:20") },
  ];

  const charges: Charge[] = [
    { id: "pr-1", caseId: "dos-115", label: "Accompagnement voyage d'affaires", chargeType: "agency_fee", amountMinor: 400000, currency: "XAF" },
    { id: "pr-2", caseId: "dos-115", label: "Frais officiels de visa", chargeType: "third_party", amountMinor: 250000, currency: "XAF" },
    { id: "pr-3", caseId: "dos-117", label: "Accompagnement études à l'étranger", chargeType: "agency_fee", amountMinor: 800000, currency: "XAF" },
    { id: "pr-4", caseId: "dos-117", label: "Frais de procédure de candidature", chargeType: "third_party", amountMinor: 50000, currency: "XAF" },
    { id: "pr-5", caseId: "dos-117", label: "Frais de demande de visa long séjour", chargeType: "third_party", amountMinor: 65000, currency: "XAF", originalAmount: { amountMinor: 9900, currency: "EUR", rateNote: "taux saisi : 1 EUR = 655,957 XAF" } },
    { id: "pr-6", caseId: "dos-118", label: "Accompagnement voyage d'affaires", chargeType: "agency_fee", amountMinor: 150000, currency: "XAF" },
    { id: "pr-7", caseId: "dos-118", label: "Frais de demande d'e-Visa", chargeType: "third_party", amountMinor: 120000, currency: "XAF" },
    { id: "pr-8", caseId: "dos-119", label: "Accompagnement études à l'étranger", chargeType: "agency_fee", amountMinor: 900000, currency: "XAF" },
    { id: "pr-9", caseId: "dos-119", label: "Frais de dossier de l'établissement", chargeType: "third_party", amountMinor: 60000, currency: "XAF" },
    { id: "pr-10", caseId: "dos-120", label: "Accompagnement visa court séjour", chargeType: "agency_fee", amountMinor: 200000, currency: "XAF" },
    { id: "pr-11", caseId: "dos-120", label: "Frais de visa court séjour", chargeType: "third_party", amountMinor: 55000, currency: "XAF" },
  ];

  const payments: Payment[] = [
    { id: "pay-84", caseId: "dos-115", clientId: "cli-46", amountMinor: 400000, currency: "XAF", methodKind: "bank_transfer", methodLabel: "Virement bancaire", transactionReference: "VIR-0902-118", payerName: "Christian Fotso", paidAt: t("2026-09-02", "10:15"), receivedBy: "m4", status: "recorded", receiptNumber: "REC-2026-00084", allocations: [{ chargeId: "pr-1", amountMinor: 400000 }] },
    { id: "pay-85", caseId: "dos-115", clientId: "cli-46", amountMinor: 250000, currency: "XAF", methodKind: "bank_transfer", methodLabel: "Virement bancaire", transactionReference: "VIR-0910-204", payerName: "Christian Fotso", paidAt: t("2026-09-10", "11:40"), receivedBy: "m4", status: "recorded", receiptNumber: "REC-2026-00085", allocations: [{ chargeId: "pr-2", amountMinor: 250000 }] },
    { id: "pay-86", caseId: "dos-117", clientId: "cli-42", amountMinor: 500000, currency: "XAF", methodKind: "mobile_money", methodLabel: "Orange Money", transactionReference: "OM-260918-4471", payerName: "Arnaud Tchouameni", paidAt: t("2026-09-18", "14:22"), receivedBy: "m1", status: "recorded", receiptNumber: "REC-2026-00086", allocations: [{ chargeId: "pr-3", amountMinor: 500000 }] },
    { id: "pay-87", caseId: "dos-119", clientId: "cli-44", amountMinor: 450000, currency: "XAF", methodKind: "mobile_money", methodLabel: "MTN Mobile Money", transactionReference: "MOMO-261003-9923", payerName: "Paul Mensah (garant)", paidAt: t("2026-10-03", "10:15"), receivedBy: "m3", status: "recorded", receiptNumber: "REC-2026-00087", allocations: [{ chargeId: "pr-8", amountMinor: 450000 }] },
    { id: "pay-88", caseId: "dos-118", clientId: "cli-43", amountMinor: 270000, currency: "XAF", methodKind: "bank_transfer", methodLabel: "Virement bancaire", transactionReference: "VIR-1010-077", payerName: "Aminata Diallo", paidAt: t("2026-10-10", "11:05"), receivedBy: "m4", status: "recorded", receiptNumber: "REC-2026-00088", allocations: [{ chargeId: "pr-6", amountMinor: 150000 }, { chargeId: "pr-7", amountMinor: 120000 }] },
    { id: "pay-89", caseId: "dos-117", clientId: "cli-42", amountMinor: 250000, currency: "XAF", methodKind: "cash", methodLabel: "Espèces", payerName: "Arnaud Tchouameni", paidAt: t("2026-10-12", "16:05"), receivedBy: "m1", status: "recorded", receiptNumber: "REC-2026-00089", allocations: [{ chargeId: "pr-3", amountMinor: 200000 }, { chargeId: "pr-4", amountMinor: 50000 }] },
    { id: "pay-90", caseId: "dos-120", clientId: "cli-45", amountMinor: 200000, currency: "XAF", methodKind: "mobile_money", methodLabel: "Orange Money", transactionReference: "OM-261015-1180", payerName: "Marie-Louise Banyingela", paidAt: t("2026-10-15", "16:40"), receivedBy: "m2", status: "recorded", receiptNumber: "REC-2026-00090", allocations: [{ chargeId: "pr-10", amountMinor: 200000 }] },
  ];

  const expenses: Expense[] = [
    { id: "dep-1", caseId: "dos-115", expenseType: "client_disbursement", label: "Frais officiels de visa reversés", supplier: "Centre de dépôt des demandes de visa", amountMinor: 250000, currency: "XAF", paidAt: t("2026-09-11", "10:00"), recordedBy: "m4" },
    { id: "dep-2", expenseType: "operating", label: "Loyer du bureau — octobre", supplier: "Bailleur", amountMinor: 150000, currency: "XAF", paidAt: t("2026-10-01", "09:00"), recordedBy: "m4" },
    { id: "dep-3", expenseType: "operating", label: "Internet et téléphonie — octobre", supplier: "Fournisseur d'accès", amountMinor: 50000, currency: "XAF", paidAt: t("2026-10-01", "09:30"), recordedBy: "m4" },
    { id: "dep-4", expenseType: "operating", label: "Électricité — septembre", supplier: "Fournisseur d'électricité", amountMinor: 65000, currency: "XAF", paidAt: t("2026-10-05", "11:00"), recordedBy: "m4" },
    { id: "dep-5", caseId: "dos-118", expenseType: "client_disbursement", label: "Frais d'e-Visa reversés", supplier: "Portail officiel e-Visa", amountMinor: 120000, currency: "XAF", paidAt: t("2026-10-11", "09:15"), recordedBy: "m2" },
    { id: "dep-6", caseId: "dos-117", expenseType: "client_disbursement", label: "Frais de procédure de candidature reversés", supplier: "Plateforme de candidature", amountMinor: 50000, currency: "XAF", paidAt: t("2026-10-13", "10:20"), recordedBy: "m1" },
  ];

  const events: ActivityEvent[] = [
    { id: "ev-1", at: t("2026-09-01", "10:00"), actorId: "m2", clientId: "cli-46", caseId: "dos-115", text: "Dossier DOS-2026-00115 ouvert (voyage d'affaires, Chine)." },
    { id: "ev-2", at: t("2026-09-12", "15:00"), actorId: "m2", clientId: "cli-46", caseId: "dos-115", text: "Dépôt de la demande de visa confirmé (récépissé au dossier)." },
    { id: "ev-3", at: t("2026-09-15", "11:00"), actorId: "m1", clientId: "cli-42", caseId: "dos-117", text: "Dossier DOS-2026-00117 ouvert (études, France)." },
    { id: "ev-4", at: t("2026-09-18", "14:22"), actorId: "m1", clientId: "cli-42", caseId: "dos-117", text: "Paiement de 500 000 FCFA enregistré par Orange Money (reçu REC-2026-00086)." },
    { id: "ev-5", at: t("2026-10-02", "09:40"), actorId: "m3", clientId: "cli-44", caseId: "dos-119", text: "Dossier DOS-2026-00119 ouvert (études, Canada)." },
    { id: "ev-6", at: t("2026-10-08", "16:00"), actorId: "m2", clientId: "cli-46", caseId: "dos-115", text: "Visa accordé : confirmé par la copie de la page visa." },
    { id: "ev-7", at: t("2026-10-10", "11:05"), actorId: "m4", clientId: "cli-43", caseId: "dos-118", text: "Paiement de 270 000 FCFA enregistré par virement (reçu REC-2026-00088)." },
    { id: "ev-8", at: t("2026-10-12", "15:30"), actorId: "m2", clientId: "cli-43", caseId: "dos-118", text: "Demande d'e-Visa déposée : confirmé par l'accusé de dépôt." },
    { id: "ev-9", at: t("2026-10-15", "11:00"), actorId: "m2", clientId: "cli-46", caseId: "dos-115", text: "Dossier DOS-2026-00115 clôturé." },
    { id: "ev-10", at: t("2026-10-15", "16:40"), actorId: "m2", clientId: "cli-45", caseId: "dos-120", text: "Paiement de 200 000 FCFA enregistré par Orange Money (reçu REC-2026-00090)." },
    { id: "ev-11", at: t("2026-10-24", "10:10"), actorId: "m3", clientId: "cli-47", text: "Fiche client CLI-2026-00047 créée." },
    { id: "ev-12", at: t("2026-10-25", "09:00"), actorId: "m1", clientId: "cli-45", caseId: "dos-120", text: "Étape en cours : « Prise de rendez-vous de dépôt »." },
    { id: "ev-13", at: t("2026-10-26", "10:00"), actorId: "m3", clientId: "cli-44", caseId: "dos-119", text: "Document à corriger : diplômes (copie illisible)." },
    { id: "ev-14", at: t("2026-10-27", "09:30"), actorId: "m1", clientId: "cli-42", caseId: "dos-117", text: "Document reçu : justificatif de ressources (à vérifier)." },
  ];

  return {
    agency: { name: "Horizon Voyages & Études", city: "Douala", countryCode: "CM", currency: "XAF", timezone: "Africa/Douala", receiptPrefix: "REC" },
    currentMemberId: "m1",
    members,
    clients,
    cases,
    steps,
    requirements: requirementsList,
    appointments,
    tasks,
    charges,
    payments,
    expenses,
    events,
    communications: [],
    counters: { client: 47, case: 120, receipt: 90, task: 7, event: 14, communication: 0 },
  };
}
