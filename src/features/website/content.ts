import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { z } from "zod";

// Site web de l'agence : modèles de page, contenu et règles communes à l'éditeur, à l'IA et à la page publique.
// Le contenu est un document JSON (brouillon ou version publiée), validé ici avant chaque enregistrement.

export const TEMPLATE_KEYS = ["horizon", "campus", "evasion"] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export interface TemplateSpec {
  key: TemplateKey;
  name: string;
  description: string;
  /** Pour quel type d'agence le modèle est pensé. */
  bestFor: string;
  colors: { primary: string; accent: string };
  heroImage: string;
}

/** Modèles de page prêts à publier : même contenu, mise en page et couleurs différentes. */
export const TEMPLATES: Record<TemplateKey, TemplateSpec> = {
  horizon: {
    key: "horizon",
    name: "Horizon",
    description: "Grande photo d'accueil, services en cartes, avis et questions fréquentes.",
    bestFor: "Agence de voyages généraliste",
    colors: { primary: "#0B3B66", accent: "#F2B705" },
    heroImage: "/images/voyage-sur-mesure.jpg",
  },
  campus: {
    key: "campus",
    name: "Campus",
    description: "Accueil en deux colonnes, étapes de l'accompagnement mises en avant.",
    bestFor: "Études à l'étranger et visas",
    colors: { primary: "#1E3A8A", accent: "#10B981" },
    heroImage: "/images/etudes-etranger.jpg",
  },
  evasion: {
    key: "evasion",
    name: "Évasion",
    description: "Accueil centré, destinations en grandes cartes arrondies.",
    bestFor: "Tourisme, circuits et voyages organisés",
    colors: { primary: "#0F766E", accent: "#F97316" },
    heroImage: "/images/visa-tourisme.jpg",
  },
};

const text = (max: number) => z.string().trim().max(max).catch("");
const list = <T extends z.ZodTypeAny>(item: T, max: number) =>
  z
    .array(z.unknown())
    .catch([])
    .transform((items) => items.map((i) => item.safeParse(i)).flatMap((r) => (r.success ? [r.data as z.infer<T>] : [])).slice(0, max));
const hex = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((v) => v.toUpperCase());
/** Image du site : chemin d'une image de SELECT (/images/…) ou adresse https (bucket public des sites). */
const imageUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || /^\/images\/[a-z0-9-]+\.(jpg|png|webp)$/.test(v) || /^https:\/\/[^\s"'<>]+$/.test(v))
  .catch("");

const titled = <T extends z.ZodTypeAny>(item: T, max: number) =>
  z.object({ visible: z.boolean().catch(true), title: text(80), items: list(item, max) }).catch({ visible: false, title: "", items: [] });

export const siteContentSchema = z.object({
  template: z.enum(TEMPLATE_KEYS).catch("horizon"),
  colors: z.object({ primary: hex, accent: hex }).catch(TEMPLATES.horizon.colors),
  logoUrl: imageUrl,
  heroImageUrl: imageUrl,
  agencyName: text(120),
  tagline: text(140),
  hero: z.object({ title: text(120), subtitle: text(300), ctaLabel: text(40) }).catch({ title: "", subtitle: "", ctaLabel: "" }),
  about: z.object({ visible: z.boolean().catch(true), title: text(80), text: text(1500) }).catch({ visible: false, title: "", text: "" }),
  services: titled(z.object({ name: text(80), description: text(300) }), 8),
  destinations: titled(z.object({ name: text(80), description: text(240) }), 8),
  steps: titled(z.object({ title: text(80), text: text(240) }), 6),
  why: titled(z.object({ title: text(80), text: text(240) }), 6),
  testimonials: titled(z.object({ name: text(80), text: text(400) }), 6),
  faq: titled(z.object({ question: text(160), answer: text(600) }), 8),
  contact: z
    .object({ title: text(80), text: text(300), phone: text(40), whatsapp: text(40), email: text(254), address: text(200), hours: text(120) })
    .catch({ title: "", text: "", phone: "", whatsapp: "", email: "", address: "", hours: "" }),
  seoDescription: text(160),
});

export type SiteContent = z.infer<typeof siteContentSchema>;

/** Contenu lu dans la base (brouillon ou version publiée), réparé s'il manque des champs. */
export function normalizeContent(raw: unknown): SiteContent {
  return siteContentSchema.parse(raw && typeof raw === "object" ? raw : {});
}

/** Les sections affichables, dans l'ordre de la page. */
export const SECTION_KEYS = ["about", "services", "destinations", "steps", "why", "testimonials", "faq"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_LABELS: Record<SectionKey, string> = {
  about: "Qui sommes-nous",
  services: "Services",
  destinations: "Destinations",
  steps: "Comment ça marche",
  why: "Pourquoi nous choisir",
  testimonials: "Avis de clients",
  faq: "Questions fréquentes",
};

/** Adresse du site à partir du nom de l'agence : « Presta Services » → « presta-services ». */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug.length >= 3 ? slug : `agence-${slug || "site"}`.slice(0, 48);
}

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/;

/** Luminance relative (WCAG) d'une couleur « #RRGGBB ». */
function luminance(hexColor: string): number {
  const channel = (i: number) => {
    const c = parseInt(hexColor.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Rapport de contraste (WCAG) entre deux couleurs. */
export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1! + 0.05) / (l2! + 0.05);
}

/** Texte lisible posé sur une couleur choisie par l'agence : blanc ou presque noir, le plus contrasté. */
export function readableOn(background: string): string {
  return contrastRatio(background, "#FFFFFF") >= contrastRatio(background, "#0F172A") ? "#FFFFFF" : "#0F172A";
}

export interface AgencyFacts {
  name: string;
  city: string;
  countryName: string;
  phone?: string;
  email?: string;
  address?: string;
  services: { name: string; description: string }[];
}

/**
 * Page prête à publier pour un modèle : textes d'exemple neutres (aucun prix, aucune promesse de résultat),
 * complétés avec les informations déjà connues de l'agence (nom, ville, services, coordonnées).
 */
export function defaultContent(template: TemplateKey, agency: AgencyFacts): SiteContent {
  const spec = TEMPLATES[template];
  const place = [agency.city, agency.countryName].filter(Boolean).join(", ");
  const study = template === "campus";
  const tourism = template === "evasion";
  const services =
    agency.services.length > 0
      ? agency.services.slice(0, 8)
      : study
        ? [
            { name: "Orientation et choix de formation", description: "Nous vous aidons à choisir le pays, l'école et la formation adaptés à votre projet." },
            { name: "Admission", description: "Préparation et suivi de vos candidatures auprès des établissements." },
            { name: "Visa étudiant", description: "Constitution du dossier, prise de rendez-vous et préparation à l'entretien." },
            { name: "Logement et départ", description: "Conseils pour le logement, le billet d'avion et votre arrivée." },
          ]
        : [
            { name: "Billets d'avion", description: "Recherche et réservation de vos vols, au meilleur rapport qualité-prix." },
            { name: "Visas", description: "Accompagnement pour constituer votre dossier de visa." },
            { name: "Hôtels et séjours", description: "Réservation d'hébergements et de séjours sur mesure." },
            { name: "Voyages organisés", description: "Circuits et voyages de groupe, préparés de A à Z." },
          ];
  return normalizeContent({
    template,
    colors: spec.colors,
    logoUrl: "",
    heroImageUrl: spec.heroImage,
    agencyName: agency.name,
    tagline: study ? "Votre projet d'études à l'étranger, accompagné" : tourism ? "Des voyages qui vous ressemblent" : "Votre agence de voyages de confiance",
    hero: {
      title: study ? "Étudiez à l'étranger, sereinement" : tourism ? "Partez à la découverte du monde" : `${agency.name}, votre partenaire voyage`,
      subtitle: `${agency.name}${place ? ` vous accompagne depuis ${place}` : " vous accompagne"} : ${services
        .slice(0, 3)
        .map((s) => s.name.toLowerCase())
        .join(", ")}.`,
      ctaLabel: "Demander un devis",
    },
    about: {
      visible: true,
      title: "Qui sommes-nous",
      text: `${agency.name} est une agence${place ? ` basée à ${place}` : ""}. Présentez ici votre histoire, votre équipe et ce qui fait votre différence.`,
    },
    services: { visible: true, title: "Nos services", items: services },
    destinations: {
      visible: !study,
      title: "Destinations",
      items: tourism
        ? [
            { name: "Destination 1", description: "Présentez une destination que vous proposez." },
            { name: "Destination 2", description: "Présentez une autre destination." },
            { name: "Destination 3", description: "Et une troisième." },
          ]
        : [],
    },
    steps: {
      visible: true,
      title: "Comment ça marche",
      items: [
        { title: "Vous nous contactez", text: "Par le formulaire, WhatsApp ou en agence : dites-nous votre projet." },
        { title: "Nous préparons votre dossier", text: "Un conseiller vous accompagne et vous indique les pièces à fournir." },
        { title: "Vous partez", text: "Nous suivons votre dossier jusqu'au départ." },
      ],
    },
    why: {
      visible: true,
      title: "Pourquoi nous choisir",
      items: [
        { title: "Un conseiller dédié", text: "Une personne suit votre dossier du début à la fin." },
        { title: "Un suivi clair", text: "Vous savez à chaque étape où en est votre dossier." },
        { title: "Proche de vous", text: place ? `Une agence à ${place}, joignable par WhatsApp.` : "Une agence joignable par WhatsApp." },
      ],
    },
    testimonials: { visible: false, title: "Ils nous ont fait confiance", items: [] },
    faq: {
      visible: true,
      title: "Questions fréquentes",
      items: [
        { question: "Comment obtenir un devis ?", answer: "Remplissez le formulaire de contact : un conseiller vous rappelle rapidement." },
        { question: "Où se trouve l'agence ?", answer: agency.address || (place ? `Nous sommes à ${place}.` : "Contactez-nous pour connaître notre adresse.") },
      ],
    },
    contact: {
      title: "Contactez-nous",
      text: "Décrivez votre projet : un conseiller vous recontacte rapidement.",
      phone: agency.phone ?? "",
      whatsapp: agency.phone ?? "",
      email: agency.email ?? "",
      address: agency.address ?? "",
      hours: "",
    },
    seoDescription: `${agency.name}${place ? `, ${place}` : ""} : ${services
      .slice(0, 3)
      .map((s) => s.name.toLowerCase())
      .join(", ")}.`.slice(0, 160),
  });
}

/** Adresse pendant la saisie : accents retirés (« é » → « e »), espaces et signes → un seul tiret. */
export function cleanSlugInput(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 48);
}

/** Adresse enregistrée : comme pendant la saisie, sans tiret au début ni à la fin. */
export function finalizeSlug(value: string): string {
  return cleanSlugInput(value).replace(/-+$/g, "");
}

/**
 * Numéro affiché sur le site, au format international (« 069141360 » au Congo → « +242 06 914 13 60 »).
 * Un numéro qu'on ne sait pas lire est gardé tel quel.
 */
export function internationalPhone(raw: string, countryCode: string): string {
  const value = raw.trim();
  if (!value) return "";
  const parsed = parsePhoneNumberFromString(value, /^[A-Z]{2}$/.test(countryCode) ? (countryCode as CountryCode) : undefined);
  return parsed?.isValid() ? parsed.formatInternational() : value;
}

/** Lien WhatsApp (wa.me) : indicatif du pays de l'agence ajouté si le numéro n'en a pas. */
export function whatsappHref(raw: string, countryCode: string): string | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  const parsed = parsePhoneNumberFromString(value, /^[A-Z]{2}$/.test(countryCode) ? (countryCode as CountryCode) : undefined);
  if (parsed?.isValid()) return `https://wa.me/${parsed.number.replace(/\D/g, "")}`;
  // Sans pays connu : seulement un numéro déjà international (+…).
  const digits = value.replace(/\D/g, "");
  return value.startsWith("+") && digits.length >= 8 ? `https://wa.me/${digits}` : undefined;
}

/** Numéros du contact au format international, avec le pays de l'agence. */
export function withInternationalPhones(content: SiteContent, countryCode: string): SiteContent {
  return {
    ...content,
    contact: {
      ...content.contact,
      phone: internationalPhone(content.contact.phone, countryCode),
      whatsapp: internationalPhone(content.contact.whatsapp, countryCode),
    },
  };
}

/** Titre de l'onglet et de Google : 60 caractères au plus (le slogan seulement s'il tient). */
export function pageTitle(content: SiteContent): string {
  const name = content.agencyName.trim() || "Agence";
  const withTagline = content.tagline ? `${name} · ${content.tagline}` : name;
  if (withTagline.length <= 60) return withTagline;
  return name.length <= 60 ? name : `${name.slice(0, 59).trimEnd()}…`;
}

/** « Projet » de la fiche prospect, d'après le service choisi dans le formulaire du site. */
export function serviceMotive(service: string): string | undefined {
  const s = service.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  if (!s.trim()) return undefined;
  if (/etud|campus|admission|universit|ecole|bourse|inscription|stage/.test(s)) return "study_abroad";
  if (/regroupement|installation|immigration|residence/.test(s)) return "family_reunion";
  if (/affaire|business|mission|professionnel|salon|seminaire/.test(s)) return "business_travel";
  if (/administrati|demarche|legalisation|traduction|apostille|passeport|document/.test(s)) return "administrative";
  if (/visa|touris|visite|famil/.test(s)) return "tourist_visa";
  if (/billet|vol|avion|sejour|hotel|heberg|voyage|circuit|croisiere|vacance|reservation/.test(s)) return "custom_trip";
  return "other";
}

/** Textes d'exemple des modèles : à remplacer avant de publier. */
const EXAMPLE_TEXTS = [
  "Présentez ici",
  "Présentez une destination",
  "Présentez une autre destination",
  "Et une troisième",
  "Destination 1",
  "Destination 2",
  "Destination 3",
];

/**
 * Liste de vérification avant publication. « blocking » : la publication est refusée ; « warnings » : la personne
 * confirme qu'elle publie quand même (texte d'exemple restant, e-mail absent, numéro sans indicatif…).
 */
export function publicationChecks(content: SiteContent): { blocking: string[]; warnings: string[] } {
  const warnings: string[] = [];
  const texts = JSON.stringify({ ...content, logoUrl: "", heroImageUrl: "" });
  const examples = EXAMPLE_TEXTS.filter((t) => texts.includes(t));
  if (examples.length) warnings.push(`du texte d'exemple reste à remplacer (« ${examples[0]} »…)`);
  if (!content.contact.email) warnings.push("aucune adresse e-mail de contact");
  const local = [content.contact.phone, content.contact.whatsapp].filter((p) => p && !p.trim().startsWith("+"));
  if (local.length) warnings.push(`numéro sans indicatif du pays (${local[0]}) : le bouton WhatsApp risque de ne pas fonctionner`);
  if (!content.contact.address) warnings.push("aucune adresse de l'agence");
  if (content.services.visible && content.services.items.length === 0) warnings.push("la section « Services » est vide");
  return { blocking: missingForPublication(content), warnings };
}

/** Le contenu est-il assez rempli pour être publié ? Renvoie ce qui manque (liste vide si tout va bien). */
export function missingForPublication(content: SiteContent): string[] {
  const missing: string[] = [];
  if (!content.agencyName) missing.push("le nom de l'agence");
  if (!content.hero.title) missing.push("le titre de l'accueil");
  if (!content.contact.phone && !content.contact.whatsapp && !content.contact.email) missing.push("au moins un moyen de contact (téléphone, WhatsApp ou e-mail)");
  return missing;
}
