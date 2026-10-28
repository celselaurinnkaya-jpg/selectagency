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

export function countryOptions(codes: string[]) {
  return codes
    .map((code) => ({ code, name: countryName(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}
