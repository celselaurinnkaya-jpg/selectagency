import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

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
