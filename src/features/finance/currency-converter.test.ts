import { describe, expect, it } from "vitest";
import { convert, currencyOptions, FIXED_PER_EURO, fractionDigits, isFixedPair, roundFor } from "./currency-converter";

// Cours BCE du 6 novembre 2026 (extrait) pour 1 euro, plus la parité fixe du franc CFA.
const rates = { ...FIXED_PER_EURO, USD: 1.1165, CAD: 1.5705, JPY: 176.77 };

describe("conversion de devises (src/features/finance/currency-converter.ts)", () => {
  it("convertit dans les deux sens en passant par l'euro", () => {
    expect(convert(50, "EUR", "XAF", rates)).toBeCloseTo(32797.85, 2);
    expect(roundFor(convert(50, "EUR", "XAF", rates)!, "XAF")).toBe(32798);
    expect(roundFor(convert(32798, "XAF", "EUR", rates)!, "EUR")).toBe(50);
    expect(roundFor(convert(100, "USD", "XOF", rates)!, "XOF")).toBe(58751);
    expect(roundFor(convert(1000, "CAD", "USD", rates)!, "USD")).toBe(710.92);
    expect(convert(10, "EUR", "MAD", rates)).toBeUndefined();
  });

  it("arrondit selon la devise et reconnaît la parité fixe", () => {
    expect(fractionDigits("XAF")).toBe(0);
    expect(fractionDigits("JPY")).toBe(0);
    expect(fractionDigits("EUR")).toBe(2);
    expect(isFixedPair("EUR", "XAF")).toBe(true);
    expect(isFixedPair("XOF", "XAF")).toBe(true);
    expect(isFixedPair("USD", "XAF")).toBe(false);
  });

  it("propose d'abord le franc CFA, l'euro et les devises fréquentes, avec leur nom en français", () => {
    const codes = currencyOptions(rates).map((o) => o.code);
    expect(codes.slice(0, 5)).toEqual(["XAF", "XOF", "EUR", "USD", "CAD"]);
    expect(codes).toContain("JPY");
    expect(currencyOptions({ EUR: 1 })[0]!.label).toMatch(/^EUR — euro/);
  });
});
