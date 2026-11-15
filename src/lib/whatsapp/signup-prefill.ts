import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

// Pré-remplissage de la fenêtre officielle de Meta (Embedded Signup, « extras.setup »), pour que l'agence n'ait
// presque rien à saisir. Documentation de Meta (consultée le 15 novembre 2026, « Pre-filling screens ») :
// - « business » remplit l'écran de création du portefeuille Business. Si l'agence a déjà un portefeuille, Meta
//   le présélectionne et ces données ne servent pas. L'agence peut toujours les modifier (« Modifier »).
// - L'écran du portefeuille reste affiché : Meta ne permet pas de le sauter.
// - Le profil public du numéro (« phone » : nom affiché, catégorie, description) n'est volontairement PAS envoyé :
//   avec l'application WhatsApp Business (coexistence), le numéro a déjà son profil, qu'on ne veut pas écraser.
// Seules les valeurs valides sont envoyées ; un champ douteux est omis et l'agence le remplit chez Meta.

export interface SignupPrefillSource {
  agencyName: string;
  legalName?: string;
  email?: string;
  address?: string;
  city?: string;
  countryCode?: string;
  phone?: string;
  timezone?: string;
}

export interface EmbeddedSignupSetup {
  business?: {
    name?: string;
    email?: string;
    address?: { streetAddress1?: string; city?: string; country?: string };
    phone?: { code: number; number: string };
    timezone?: string;
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Fuseau au format attendu par Meta (« UTC+01:00 ») à la date donnée, d'après le fuseau de l'agence (« Africa/Brazzaville »). */
export function utcOffset(timeZone: string, at: Date = new Date()): string | undefined {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value;
    if (part === "GMT") return "UTC+00:00";
    const match = part?.match(/^GMT([+-])(\d{2}):(\d{2})$/);
    return match ? `UTC${match[1]}${match[2]}:${match[3]}` : undefined;
  } catch {
    return undefined;
  }
}

/** Données de l'agence → objet « setup » de la fenêtre Meta (champs vides ou invalides omis). */
export function buildSignupSetup(src: SignupPrefillSource, at: Date = new Date()): EmbeddedSignupSetup {
  const business: NonNullable<EmbeddedSignupSetup["business"]> = {};

  const name = (src.legalName?.trim() || src.agencyName.trim()).slice(0, 75).trim();
  if (name) business.name = name;

  const email = src.email?.trim().toLowerCase();
  if (email && email.length <= 254 && EMAIL.test(email)) business.email = email;

  const country = src.countryCode?.trim().toUpperCase();
  const address: NonNullable<NonNullable<EmbeddedSignupSetup["business"]>["address"]> = {};
  const street = src.address?.trim().replace(/\s+/g, " ");
  if (street && street.length <= 100) address.streetAddress1 = street;
  const city = src.city?.trim();
  if (city) address.city = city;
  if (country && /^[A-Z]{2}$/.test(country)) address.country = country;
  if (Object.keys(address).length) business.address = address;

  if (src.phone?.trim()) {
    const parsed = parsePhoneNumberFromString(src.phone.trim(), country && /^[A-Z]{2}$/.test(country) ? (country as CountryCode) : undefined);
    if (parsed?.isValid()) business.phone = { code: Number(parsed.countryCallingCode), number: String(parsed.nationalNumber) };
  }

  const timezone = src.timezone ? utcOffset(src.timezone, at) : undefined;
  if (timezone) business.timezone = timezone;

  return Object.keys(business).length ? { business } : {};
}
