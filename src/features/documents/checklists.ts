import type { ApplicantTag, CaseCategory, DocumentRequirement } from "@/lib/domain/types";

// Types de documents et checklists de départ (plan §8.4). Aucune checklist universelle :
// la liste d'un dossier dépend de sa catégorie, de sa destination et du profil du demandeur,
// puis le conseiller peut la compléter.

export interface DocumentType {
  code: string;
  label: string;
  category: "Identité" | "Scolarité" | "Finances" | "Voyage" | "Professionnel" | "Famille";
  hasExpiry: boolean;
}

export const DOCUMENT_TYPES: DocumentType[] = [
  { code: "passport", label: "Passeport", category: "Identité", hasExpiry: true },
  { code: "id_photo", label: "Photo d'identité récente", category: "Identité", hasExpiry: false },
  { code: "national_id", label: "Carte nationale d'identité", category: "Identité", hasExpiry: true },
  { code: "birth_certificate", label: "Acte de naissance", category: "Identité", hasExpiry: false },
  { code: "transcripts", label: "Relevés de notes", category: "Scolarité", hasExpiry: false },
  { code: "diplomas", label: "Diplômes obtenus", category: "Scolarité", hasExpiry: false },
  { code: "admission_letter", label: "Lettre d'admission de l'établissement", category: "Scolarité", hasExpiry: false },
  { code: "language_test", label: "Attestation de niveau de langue", category: "Scolarité", hasExpiry: true },
  { code: "funding_proof", label: "Justificatif de ressources", category: "Finances", hasExpiry: false },
  { code: "sponsor_statement", label: "Engagement de prise en charge du garant", category: "Finances", hasExpiry: false },
  { code: "sponsor_bank_statement", label: "Relevés bancaires du garant (3 derniers mois)", category: "Finances", hasExpiry: false },
  { code: "bank_statements", label: "Relevés bancaires personnels (3 derniers mois)", category: "Finances", hasExpiry: false },
  { code: "employment_certificate", label: "Attestation de travail", category: "Professionnel", hasExpiry: false },
  { code: "invitation_letter", label: "Lettre d'invitation", category: "Professionnel", hasExpiry: false },
  { code: "mission_order", label: "Ordre de mission", category: "Professionnel", hasExpiry: false },
  { code: "business_registration", label: "Registre de commerce de l'entreprise", category: "Professionnel", hasExpiry: false },
  { code: "accommodation_proof", label: "Justificatif d'hébergement", category: "Voyage", hasExpiry: false },
  { code: "travel_insurance", label: "Assurance voyage", category: "Voyage", hasExpiry: true },
  { code: "flight_booking", label: "Réservation de transport", category: "Voyage", hasExpiry: false },
  { code: "parental_consent", label: "Autorisation parentale", category: "Famille", hasExpiry: false },
];

export interface Checklist {
  key: string;
  name: string;
  category: CaseCategory;
  /** Destinations concernées ; absent = toutes les destinations. */
  destinations?: string[];
  /** Profils concernés ; absent = tous les demandeurs. */
  tags?: ApplicantTag[];
  items: { code: string; required: boolean }[];
}

export const CHECKLIST_DISCLAIMER =
  "Liste indicative à adapter : les pièces réellement exigées dépendent de la destination, du consulat et de la situation du demandeur.";

const req = (code: string) => ({ code, required: true });
const opt = (code: string) => ({ code, required: false });

export const CHECKLISTS: Checklist[] = [
  {
    key: "study_base",
    name: "Études : pièces de base",
    category: "study_abroad",
    items: [req("passport"), req("id_photo"), req("birth_certificate"), req("transcripts"), req("diplomas"), req("admission_letter"), req("funding_proof"), req("accommodation_proof"), opt("language_test")],
  },
  {
    key: "study_sponsored",
    name: "Études : demandeur pris en charge par un garant",
    category: "study_abroad",
    tags: ["sponsored"],
    items: [req("sponsor_statement"), req("sponsor_bank_statement")],
  },
  { key: "minor", name: "Demandeur mineur", category: "study_abroad", tags: ["minor"], items: [req("parental_consent")] },
  {
    key: "tourist_base",
    name: "Visa touristique : pièces de base",
    category: "tourist_visa",
    items: [req("passport"), req("id_photo"), req("bank_statements"), req("accommodation_proof"), req("travel_insurance"), req("flight_booking"), opt("employment_certificate")],
  },
  { key: "tourist_minor", name: "Visa touristique : demandeur mineur", category: "tourist_visa", tags: ["minor"], items: [req("parental_consent")] },
  {
    key: "business_base",
    name: "Voyage d'affaires : pièces de base",
    category: "business_travel",
    items: [req("passport"), req("invitation_letter"), req("mission_order"), opt("business_registration"), opt("bank_statements")],
  },
  { key: "admin_base", name: "Démarche administrative", category: "administrative_support", items: [req("national_id"), opt("birth_certificate")] },
  { key: "custom_base", name: "Séjour personnalisé", category: "custom_trip", items: [req("passport"), opt("travel_insurance")] },
  { key: "other_base", name: "Autre mobilité", category: "other_mobility", items: [req("passport")] },
];

export function documentType(code: string): DocumentType {
  const type = DOCUMENT_TYPES.find((t) => t.code === code);
  if (!type) throw new Error(`Type de document inconnu : ${code}`);
  return type;
}

/** Fusionne les checklists applicables, sans doublon (« obligatoire » l'emporte sur « facultatif »). */
export function matchChecklistItems(category: CaseCategory, destination: string, tags: ApplicantTag[]) {
  const merged = new Map<string, boolean>();
  for (const checklist of CHECKLISTS) {
    if (checklist.category !== category) continue;
    if (checklist.destinations && !checklist.destinations.includes(destination)) continue;
    if (checklist.tags && !checklist.tags.some((tag) => tags.includes(tag))) continue;
    for (const item of checklist.items) merged.set(item.code, (merged.get(item.code) ?? false) || item.required);
  }
  return [...merged.entries()].map(([code, required]) => ({ code, required }));
}

export function buildRequirements(
  caseId: string,
  category: CaseCategory,
  destination: string,
  tags: ApplicantTag[],
): DocumentRequirement[] {
  return matchChecklistItems(category, destination, tags).map(({ code, required }) => {
    const type = documentType(code);
    return {
      id: `${caseId}-doc-${code}`,
      caseId,
      documentTypeCode: code,
      label: type.label,
      category: type.category,
      isRequired: required,
      status: "not_received",
    };
  });
}
