// Conversion de devises de la calculatrice (sans appel réseau : les cours sont fournis par la page).

/** Cours pour 1 euro : la date de publication de la BCE et le nombre d'unités de chaque devise. */
export interface EuroRates {
  date: string;
  rates: Record<string, number>;
}

/** Devises à parité fixe avec l'euro (toujours disponibles, même sans les cours du jour). */
export const FIXED_PER_EURO: Record<string, number> = { EUR: 1, XAF: 655.957, XOF: 655.957 };

/** Devises proposées en premier (zone franc, puis destinations d'études et de voyage fréquentes). */
const FIRST = ["XAF", "XOF", "EUR", "USD", "CAD", "GBP", "CHF", "CNY", "TRY", "ZAR"];

/** Les deux devises ont-elles une parité fixe entre elles (euro et franc CFA) ? */
export const isFixedPair = (from: string, to: string) => from in FIXED_PER_EURO && to in FIXED_PER_EURO;

/** Montant converti, en passant par l'euro ; undefined si une devise n'a pas de cours. */
export function convert(amount: number, from: string, to: string, rates: Record<string, number>): number | undefined {
  const a = rates[from];
  const b = rates[to];
  if (!a || !b) return undefined;
  return (amount / a) * b;
}

/** Nombre de décimales usuel de la devise (0 pour le franc CFA et le yen, 2 pour l'euro). */
export function fractionDigits(currency: string): number {
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/** Arrondi à la précision de la devise. */
export function roundFor(amount: number, currency: string): number {
  const factor = 10 ** fractionDigits(currency);
  return Math.round(amount * factor) / factor;
}

/** Liste des devises disponibles, avec leur nom en français : « XAF — franc CFA (BEAC) ». */
export function currencyOptions(rates: Record<string, number>): { code: string; label: string }[] {
  let names: Intl.DisplayNames | undefined;
  try {
    names = new Intl.DisplayNames(["fr"], { type: "currency" });
  } catch {
    names = undefined;
  }
  const codes = Object.keys(rates).sort((a, b) => {
    const ia = FIRST.indexOf(a);
    const ib = FIRST.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b);
  });
  return codes.map((code) => ({ code, label: `${code} — ${names?.of(code) ?? code}` }));
}
