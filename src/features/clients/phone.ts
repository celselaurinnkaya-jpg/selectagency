import { getExampleNumber, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import examples from "libphonenumber-js/mobile/examples";

/** Exemple de numéro mobile du pays choisi, au format international (ex. « +33 6 12 34 56 78 ») ; absent si pays inconnu. */
export function phoneExample(country: string | undefined): string | undefined {
  if (!country || !/^[A-Z]{2}$/.test(country)) return undefined;
  try {
    return getExampleNumber(country as CountryCode, examples)?.formatInternational();
  } catch {
    return undefined;
  }
}

/** Message d'erreur d'un numéro invalide, avec l'exemple du pays choisi (et non plus toujours celui du Cameroun). */
export function invalidPhoneMessage(country: string | undefined): string {
  const example = phoneExample(country);
  return example
    ? `Numéro invalide pour le pays choisi. Exemple : ${example}.`
    : "Numéro invalide pour le pays choisi : saisissez-le avec l'indicatif international (+…).";
}

/** Numéro au format international (+237…). Sans validation possible, on garde les seuls chiffres. */
export function toE164(raw: string | undefined, country: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (country && country.length === 2) {
    const parsed = parsePhoneNumberFromString(trimmed, country as CountryCode);
    if (parsed?.isValid()) return parsed.number;
  }
  const parsedDirect = parsePhoneNumberFromString(trimmed.startsWith("+") ? trimmed : `+${trimmed}`);
  if (parsedDirect?.isValid()) return parsedDirect.number;
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 6 && digits.length <= 15 ? `+${digits}` : null;
}
