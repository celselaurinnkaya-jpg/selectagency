// Calcul des montants d'une facture, identique à celui de la base (fonction save_invoice) : l'aperçu
// affiche exactement ce qui sera enregistré. Montants en unités mineures (entiers) ; taux en %.
//   ligne = quantité × prix unitaire ; taxe = ligne × taux, arrondie à l'unité ;
//   total = lignes + taxes − remise.

export interface InvoiceLine {
  quantity: number;
  unitAmountMinor: number;
  taxRate: number;
}

export const lineAmount = (line: InvoiceLine) => line.quantity * line.unitAmountMinor;

/** Le taux passe en centièmes de point (19,25 % → 1925) : le calcul reste entier, sans erreur d'arrondi. */
export const lineTax = (line: InvoiceLine) => Math.round((lineAmount(line) * Math.round(line.taxRate * 100)) / 10000);

export function invoiceTotals(lines: InvoiceLine[], discountMinor = 0) {
  const subtotalMinor = lines.reduce((sum, l) => sum + lineAmount(l), 0);
  const taxMinor = lines.reduce((sum, l) => sum + lineTax(l), 0);
  return { subtotalMinor, taxMinor, discountMinor, totalMinor: subtotalMinor + taxMinor - discountMinor };
}

/** « 19,25 » ou « 19.25 » → 19.25 ; vide → 0. Au plus deux décimales, entre 0 et 100. */
export function parseTaxRate(input: string): number | null {
  const compact = input.replace(/[\s%]/g, "").replace(",", ".");
  if (compact === "") return 0;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(compact)) return null;
  const rate = Number(compact);
  return rate <= 100 ? rate : null;
}

/** Taux affiché : « 19,25 % », « 0 % ». */
export const formatTaxRate = (rate: number) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(rate)} %`;
