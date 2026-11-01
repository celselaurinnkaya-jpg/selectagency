import { minorUnits } from "./format";

// Fichiers CSV pour Excel et LibreOffice en français : séparateur « ; », virgule décimale,
// marque UTF-8 en tête (accents corrects à l'ouverture) et fins de ligne Windows.
// Une cellule qui commence par = + - @ serait exécutée comme une formule par le tableur : elle est
// préfixée d'une apostrophe (protection contre l'injection de formules).

export type Cell = string | number | null | undefined;

export function csvCell(value: Cell): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: Cell[][]): string {
  return `﻿${[header, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n")}\r\n`;
}

/** Montant en unités mineures → nombre lisible par le tableur (« 1500,5 »), sans séparateur de milliers. */
export function csvAmount(amountMinor: number, currency: string): string {
  const digits = minorUnits(currency);
  return digits === 0 ? String(amountMinor) : (amountMinor / 10 ** digits).toFixed(digits).replace(".", ",");
}
