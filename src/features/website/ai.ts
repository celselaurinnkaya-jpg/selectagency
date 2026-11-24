import "server-only";
import { GoogleGenAI } from "@google/genai";
import { AI_NOT_CONFIGURED_GEMINI, AiUnavailableError } from "@/lib/ai/runner";
import { normalizeContent, type AgencyFacts, type SiteContent } from "./content";

// Rédaction du site par l'IA (Gemini) à partir de la description donnée par l'agence, et de rien d'autre.
// Garde-fous, en plus des consignes : les coordonnées, les avis de clients et les montants absents de la
// description sont retirés de la réponse ; les couleurs, les images et le modèle restent ceux de l'agence.

const MODELS = ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-2.5-flash"];

export function websiteAiConfigured(): boolean {
  return Boolean((process.env.GEMINI_API_KEY || process.env["Gemini API Key"] || "").trim());
}

const str = (maxLength: number) => ({ type: "string", maxLength });
const items = (properties: Record<string, unknown>, maxItems: number) => ({
  type: "object",
  properties: {
    visible: { type: "boolean" },
    title: str(80),
    items: { type: "array", maxItems, items: { type: "object", properties, required: Object.keys(properties) } },
  },
  required: ["visible", "title", "items"],
});

/** Forme attendue de la réponse (sans couleurs, images ni modèle : ce sont les choix de l'agence). */
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    agencyName: str(120),
    tagline: str(140),
    hero: { type: "object", properties: { title: str(120), subtitle: str(300), ctaLabel: str(40) }, required: ["title", "subtitle", "ctaLabel"] },
    about: { type: "object", properties: { visible: { type: "boolean" }, title: str(80), text: str(1500) }, required: ["visible", "title", "text"] },
    services: items({ name: str(80), description: str(300) }, 8),
    destinations: items({ name: str(80), description: str(240) }, 8),
    steps: items({ title: str(80), text: str(240) }, 6),
    why: items({ title: str(80), text: str(240) }, 6),
    testimonials: items({ name: str(80), text: str(400) }, 6),
    faq: items({ question: str(160), answer: str(600) }, 8),
    contact: {
      type: "object",
      properties: { title: str(80), text: str(300), phone: str(40), whatsapp: str(40), email: str(254), address: str(200), hours: str(120) },
      required: ["title", "text", "phone", "whatsapp", "email", "address", "hours"],
    },
    seoDescription: str(160),
  },
  required: ["agencyName", "tagline", "hero", "about", "services", "destinations", "steps", "why", "testimonials", "faq", "contact", "seoDescription"],
};

function prompt(brief: string, agency: AgencyFacts): string {
  return `Tu rédiges le site web (une page d'accueil) d'une agence de voyages, d'études à l'étranger ou d'accompagnement administratif en Afrique francophone.

RÈGLES ABSOLUES
- Utilise UNIQUEMENT les informations de la DESCRIPTION DE L'AGENCE et des INFORMATIONS CONNUES ci-dessous. N'invente rien.
- N'invente jamais : prix, tarifs, frais, réductions, délais garantis, taux de réussite, garantie d'obtenir un visa ou une admission, partenariats, agréments, nombre de clients, années d'expérience, adresse, téléphone, e-mail, horaires.
- « testimonials » : seulement des avis cités mot pour mot dans la description, avec le nom indiqué. Sinon, laisse la liste vide et mets "visible" à false.
- Une section sans information dans la description : liste vide et "visible" à false (sauf « steps », « why » et « faq » que tu peux rédiger de façon générale, sans promesse ni chiffre).
- Coordonnées (contact.phone, contact.whatsapp, contact.email, contact.address, contact.hours) : recopie-les seulement si elles figurent dans la description ou les informations connues, sinon chaîne vide.
- Français correct, avec TOUS les accents (é, è, ê, à, ç, ô…), même si la description est écrite sans accents : corrige l'orthographe.
- Phrases courtes, ton chaleureux et professionnel. Pas d'emoji. Pas de majuscules partout.
- hero.ctaLabel : un appel à l'action court (par exemple « Demander un devis »).
- seoDescription : une phrase de 160 caractères au plus qui résume l'agence.

INFORMATIONS CONNUES (fiche de l'agence dans SELECT Agency)
Nom : ${agency.name}
Ville et pays : ${[agency.city, agency.countryName].filter(Boolean).join(", ") || "non indiqués"}
Téléphone : ${agency.phone || "non indiqué"}
E-mail : ${agency.email || "non indiqué"}
Adresse : ${agency.address || "non indiquée"}
Services enregistrés : ${agency.services.length ? agency.services.map((s) => s.name).join(", ") : "aucun"}

DESCRIPTION DE L'AGENCE (écrite par l'agence)
"""
${brief}
"""

Réponds uniquement avec l'objet JSON demandé.`;
}

const digits = (v: string) => v.replace(/\D/g, "");
const fold = (v: string) =>
  v
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Montants (« 150 000 FCFA », « 200 € »…) absents de la description : la phrase qui les contient est retirée. */
export function stripUnbackedAmounts(value: string, source: string): string {
  const sourceDigits = digits(source);
  const amount = /\d[\d\s.,]*\s?(fcfa|f\s?cfa|xaf|xof|cfa|€|eur|euros?|\$|usd|dollars?|cdf|ngn|ghs|mad|dh)\b|[€$]\s?\d/i;
  if (!amount.test(value)) return value;
  return value
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => {
      const match = sentence.match(/\d[\d\s.,]*/g) ?? [];
      return !amount.test(sentence) || match.every((m) => sourceDigits.includes(digits(m)));
    })
    .join(" ")
    .trim();
}

/** Promesses de résultat (« visa garanti », « 100 % de réussite »…) absentes de la description : la phrase est retirée. */
export function stripUnbackedClaims(value: string, source: string): string {
  const claim = /garanti|100\s?%|taux de r[ée]ussite|sans risque|r[ée]ussite assur[ée]e/i;
  if (!claim.test(value)) return value;
  return value
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => {
      const found = sentence.match(claim);
      return !found || fold(source).includes(fold(found[0]));
    })
    .join(" ")
    .trim();
}

/** Applique les garde-fous à la réponse de l'IA, puis complète avec le brouillon actuel (choix de l'agence). */
export function guardAiContent(raw: unknown, brief: string, agency: AgencyFacts, current: SiteContent): SiteContent {
  const ai = normalizeContent({ ...(raw && typeof raw === "object" ? raw : {}), template: current.template, colors: current.colors });
  const source = `${brief}\n${agency.name} ${agency.phone ?? ""} ${agency.email ?? ""} ${agency.address ?? ""} ${agency.services.map((s) => `${s.name} ${s.description}`).join(" ")}`;
  const sourceFolded = fold(source);
  const sourceDigits = digits(source);
  const inSource = (v: string) => sourceFolded.includes(fold(v));
  const phoneInSource = (v: string) => digits(v).length >= 6 && sourceDigits.includes(digits(v).slice(-8));
  // Adresse ou horaires reformulés par l'IA : acceptés si tous leurs mots significatifs viennent de la description.
  const wordsInSource = (v: string) => {
    const words = fold(v).split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
    return words.length > 0 && words.every((w) => sourceFolded.includes(w));
  };
  const clean = (v: string) => stripUnbackedClaims(stripUnbackedAmounts(v, source), source);
  // Un contact déjà rempli n'est jamais vidé : il est remplacé seulement par une valeur venue de la description.
  const contactField = (aiValue: string, currentValue: string, accept: (v: string) => boolean) =>
    aiValue.trim() && accept(aiValue) ? aiValue : currentValue;

  const contact = {
    ...ai.contact,
    title: ai.contact.title || current.contact.title,
    text: clean(ai.contact.text) || current.contact.text,
    phone: contactField(ai.contact.phone, current.contact.phone, phoneInSource),
    whatsapp: contactField(ai.contact.whatsapp, current.contact.whatsapp, phoneInSource),
    email: contactField(ai.contact.email, current.contact.email, inSource),
    address: contactField(ai.contact.address, current.contact.address, (v) => inSource(v) || wordsInSource(v)),
    hours: contactField(ai.contact.hours, current.contact.hours, (v) => inSource(v) || wordsInSource(v)),
  };
  // Un avis n'est gardé que s'il figure dans la description (au moins ses 40 premiers caractères).
  const testimonials = ai.testimonials.items.filter((t) => t.text.length > 0 && sourceFolded.includes(fold(t.text.slice(0, 40))));

  return normalizeContent({
    ...ai,
    template: current.template,
    colors: current.colors,
    logoUrl: current.logoUrl,
    heroImageUrl: current.heroImageUrl,
    agencyName: ai.agencyName || current.agencyName || agency.name,
    tagline: clean(ai.tagline),
    hero: { title: clean(ai.hero.title), subtitle: clean(ai.hero.subtitle), ctaLabel: ai.hero.ctaLabel || "Demander un devis" },
    about: { ...ai.about, text: clean(ai.about.text) },
    services: { ...ai.services, items: ai.services.items.map((s) => ({ name: s.name, description: clean(s.description) })) },
    destinations: { ...ai.destinations, items: ai.destinations.items.map((d) => ({ name: d.name, description: clean(d.description) })) },
    steps: { ...ai.steps, items: ai.steps.items.map((s) => ({ title: s.title, text: clean(s.text) })) },
    why: { ...ai.why, items: ai.why.items.map((s) => ({ title: s.title, text: clean(s.text) })) },
    faq: { ...ai.faq, items: ai.faq.items.map((f) => ({ question: f.question, answer: clean(f.answer) })) },
    testimonials: { ...ai.testimonials, visible: ai.testimonials.visible && testimonials.length > 0, items: testimonials },
    contact,
    seoDescription: clean(ai.seoDescription),
  });
}

/** Rédige le site à partir de la description de l'agence. Erreur claire si l'IA n'est pas configurée ou ne répond pas. */
export async function generateSiteContent(brief: string, agency: AgencyFacts, current: SiteContent): Promise<SiteContent> {
  const key = (process.env.GEMINI_API_KEY || process.env["Gemini API Key"] || "").trim();
  if (!key) throw new AiUnavailableError(AI_NOT_CONFIGURED_GEMINI);
  const client = new GoogleGenAI({ apiKey: key });
  let lastError: unknown = null;
  for (const model of MODELS) {
    try {
      const response = await client.models.generateContent({
        model,
        contents: prompt(brief, agency),
        config: { responseMimeType: "application/json", responseJsonSchema: RESPONSE_SCHEMA, temperature: 0.3 },
      });
      const body = response.text?.trim();
      if (!body) continue;
      return guardAiContent(JSON.parse(body), brief, agency, current);
    } catch (error) {
      lastError = error;
      console.warn(`[Site web] Le modèle ${model} n'a pas répondu (${error instanceof Error ? error.message : String(error)}).`);
    }
  }
  console.error("[Site web] Aucun modèle n'a répondu :", lastError);
  throw new AiUnavailableError("Le service d'IA n'a pas répondu. Réessayez dans un instant, ou modifiez le texte à la main.");
}
