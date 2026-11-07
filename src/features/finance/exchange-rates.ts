import "server-only";
import { cacheLife } from "next/cache";
import { FIXED_PER_EURO, type EuroRates } from "./currency-converter";

// Cours des devises pour la calculatrice : taux de référence de la Banque centrale européenne (BCE), publiés chaque
// jour ouvré vers 16 h (heure de Francfort), lus par le service public et gratuit Frankfurter. Le franc CFA (XAF,
// XOF) s'en déduit par sa parité fixe avec l'euro. Indicatifs : une banque applique son propre taux et ses frais.

const SOURCE = "https://api.frankfurter.dev/v1/latest?base=EUR";

/** Cours du jour pour 1 euro ; null si la source ne répond pas (la calculatrice garde alors l'euro et le FCFA). */
export async function getEuroRates(): Promise<EuroRates | null> {
  "use cache";
  cacheLife("hours");
  try {
    const response = await fetch(SOURCE, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) return null;
    const body = (await response.json()) as { date?: unknown; rates?: unknown };
    if (typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date) || !body.rates || typeof body.rates !== "object") return null;
    const rates: Record<string, number> = {};
    for (const [code, value] of Object.entries(body.rates as Record<string, unknown>)) {
      if (/^[A-Z]{3}$/.test(code) && typeof value === "number" && Number.isFinite(value) && value > 0) rates[code] = value;
    }
    if (!rates.USD) return null;
    return { date: body.date, rates: { ...rates, ...FIXED_PER_EURO } };
  } catch {
    return null;
  }
}
