import "server-only";
import { cacheLife } from "next/cache";
import { FIXED_PER_EURO, type EuroRates } from "./currency-converter";

// Cours des devises pour la calculatrice : taux de référence de la Banque centrale européenne (BCE), publiés chaque
// jour ouvré vers 16 h (heure de Francfort), lus par le service public et gratuit Frankfurter. Le franc CFA (XAF,
// XOF) s'en déduit par sa parité fixe avec l'euro. Indicatifs : une banque applique son propre taux et ses frais.
//
// La BCE ne publie pas certaines devises utiles aux agences (franc congolais CDF, naira NGN, cedi GHS…) : elles sont
// complétées par ExchangeRate-API (accès ouvert, mis à jour une fois par jour), uniquement pour les devises absentes
// de la BCE, et cette source est citée à l'écran comme ses conditions d'utilisation le demandent.

const SOURCE = "https://api.frankfurter.dev/v1/latest?base=EUR";
const COMPLEMENT = "https://open.er-api.com/v6/latest/EUR";

/** Devises reprises du complément si la BCE ne les publie pas (agences et destinations africaines). */
export const COMPLEMENT_CURRENCIES = ["CDF", "NGN", "GHS", "MAD", "TND", "DZD", "EGP", "KES", "RWF", "GNF", "MGA"];

const validRates = (raw: unknown): Record<string, number> => {
  const rates: Record<string, number> = {};
  if (!raw || typeof raw !== "object") return rates;
  for (const [code, value] of Object.entries(raw as Record<string, unknown>)) {
    if (/^[A-Z]{3}$/.test(code) && typeof value === "number" && Number.isFinite(value) && value > 0) rates[code] = value;
  }
  return rates;
};

/** Cours complémentaires (devises absentes de la BCE) ; null si le service ne répond pas. */
async function complementRates(): Promise<{ date: string; rates: Record<string, number> } | null> {
  try {
    const response = await fetch(COMPLEMENT, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) return null;
    const body = (await response.json()) as { result?: unknown; time_last_update_unix?: unknown; rates?: unknown };
    if (body.result !== "success" || typeof body.time_last_update_unix !== "number") return null;
    const all = validRates(body.rates);
    const rates: Record<string, number> = {};
    for (const code of COMPLEMENT_CURRENCIES) if (all[code]) rates[code] = all[code];
    return Object.keys(rates).length ? { date: new Date(body.time_last_update_unix * 1000).toISOString().slice(0, 10), rates } : null;
  } catch {
    return null;
  }
}

/** Cours du jour pour 1 euro ; null si la BCE ne répond pas (la calculatrice garde alors l'euro et le FCFA). */
export async function getEuroRates(): Promise<EuroRates | null> {
  "use cache";
  cacheLife("hours");
  try {
    const [response, complement] = await Promise.all([fetch(SOURCE, { signal: AbortSignal.timeout(6000) }), complementRates()]);
    if (!response.ok) return null;
    const body = (await response.json()) as { date?: unknown; rates?: unknown };
    if (typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return null;
    const rates = validRates(body.rates);
    if (!rates.USD) return null;
    // Le complément ne remplace jamais un cours de la BCE : il ajoute seulement les devises qu'elle ne publie pas.
    const added = complement ? Object.fromEntries(Object.entries(complement.rates).filter(([code]) => !(code in rates))) : {};
    return {
      date: body.date,
      rates: { ...rates, ...added, ...FIXED_PER_EURO },
      complement: complement && Object.keys(added).length ? { date: complement.date, codes: Object.keys(added).sort() } : undefined,
    };
  } catch {
    return null;
  }
}
