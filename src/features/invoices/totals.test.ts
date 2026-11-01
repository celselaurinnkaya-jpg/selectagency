import { describe, expect, it } from "vitest";
import { formatTaxRate, invoiceTotals, lineTax, parseTaxRate } from "./totals";

describe("montants d'une facture", () => {
  it("calcule lignes, taxes, remise et total comme la base", () => {
    const lines = [
      { quantity: 2, unitAmountMinor: 150000, taxRate: 19.25 },
      { quantity: 1, unitAmountMinor: 25000, taxRate: 0 },
    ];
    expect(invoiceTotals(lines, 15000)).toEqual({ subtotalMinor: 325000, taxMinor: 57750, discountMinor: 15000, totalMinor: 367750 });
  });

  it("arrondit la taxe de chaque ligne à l'unité, la moitié vers le haut", () => {
    expect(lineTax({ quantity: 1, unitAmountMinor: 333, taxRate: 19.25 })).toBe(64); // 64,1025
    expect(lineTax({ quantity: 1, unitAmountMinor: 10, taxRate: 5 })).toBe(1); // 0,5
    expect(lineTax({ quantity: 3, unitAmountMinor: 1999, taxRate: 0.1 })).toBe(6); // 5,997
  });

  it("lit un taux saisi à la française", () => {
    expect(parseTaxRate("19,25")).toBe(19.25);
    expect(parseTaxRate(" 18 % ")).toBe(18);
    expect(parseTaxRate("")).toBe(0);
    expect(parseTaxRate("101")).toBeNull();
    expect(parseTaxRate("1,234")).toBeNull();
    expect(parseTaxRate("-5")).toBeNull();
    expect(formatTaxRate(19.25)).toBe("19,25 %");
  });
});
