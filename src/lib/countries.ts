// Pays proposés dans les formulaires. Les noms viennent d'Intl (français), les codes sont ISO 3166-1.
// Les drapeaux emoji ne sont pas utilisés : Windows les affiche en lettres (« FR », « CA »).

const regionNames = new Intl.DisplayNames(["fr"], { type: "region" });

export function countryName(code: string): string {
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Pays de résidence prioritaires pour le lancement, puis les autres pays d'Afrique les plus fréquents. */
export const RESIDENCE_COUNTRIES = ["CM", "CI", "SN", "BJ", "TG", "CD", "GA", "CG", "BF", "ML", "GN", "NE", "TD", "CF", "NG", "GH"];

/** Destinations les plus fréquentes, complétées par une liste plus large. */
export const DESTINATION_COUNTRIES = [
  "FR", "BE", "CA", "DE", "CH", "GB", "US", "AE", "CN", "TR", "MA", "TN", "SN", "CI", "ES", "IT", "PT", "NL", "RU", "IN", "SA", "QA", "ZA", "RW",
];

/** Tous les pays et territoires habités (ISO 3166-1) : diaspora, clients déjà installés à l'étranger. */
export const WORLD_COUNTRIES = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AR", "AS", "AT", "AU", "AW", "AX", "AZ", "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ",
  "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BW", "BY", "BZ", "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CR",
  "CU", "CV", "CW", "CX", "CY", "CZ", "DE", "DJ", "DK", "DM", "DO", "DZ", "EC", "EE", "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK", "FM", "FO",
  "FR", "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GT", "GU", "GW", "GY", "HK", "HN", "HR", "HT", "HU",
  "ID", "IE", "IL", "IM", "IN", "IQ", "IR", "IS", "IT", "JE", "JM", "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ",
  "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP",
  "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ", "NA", "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ", "OM", "PA",
  "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY", "QA", "RE", "RO", "RS", "RU", "RW", "SA", "SB", "SC", "SD", "SE",
  "SG", "SH", "SI", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SX", "SY", "SZ", "TC", "TD", "TG", "TH", "TJ", "TK", "TL", "TM", "TN",
  "TO", "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VI", "VN", "VU", "WF", "WS", "XK", "YE", "YT", "ZA",
  "ZM", "ZW",
];

/** Pays prioritaires en tête (par ordre alphabétique), puis tous les autres pays du monde. */
export function countryOptions(priority: string[]) {
  const sorted = (codes: string[]) => codes.map((code) => ({ code, name: countryName(code) })).sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const first = new Set(priority);
  return [...sorted(priority), ...sorted(WORLD_COUNTRIES.filter((code) => !first.has(code)))];
}
