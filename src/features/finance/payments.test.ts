import { describe, expect, it } from "vitest";
import type { Charge } from "@/lib/domain/types";
import { allocateFifo, parseAmount } from "./payments";

const charge = (id: string, amountMinor: number): Charge => ({ id, caseId: "c", label: id, chargeType: "agency_fee", amountMinor, currency: "XAF" });

describe("saisie des montants", () => {
  it("accepte les séparateurs de milliers et refuse les décimales en francs CFA", () => {
    expect(parseAmount("150 000", "XAF")).toBe(150000);
    expect(parseAmount("150 000", "XAF")).toBe(150000);
    expect(parseAmount("1500,5", "XAF")).toBeNull();
  });

  it("convertit en centimes pour l'euro, sans erreur d'arrondi", () => {
    expect(parseAmount("99,90", "EUR")).toBe(9990);
    expect(parseAmount("0.1", "EUR")).toBe(10);
    expect(parseAmount("12,345", "EUR")).toBeNull();
  });

  it("refuse zéro, les nombres négatifs et le texte", () => {
    expect(parseAmount("0", "XAF")).toBeNull();
    expect(parseAmount("-500", "XAF")).toBeNull();
    expect(parseAmount("cinq mille", "XAF")).toBeNull();
  });
});

describe("répartition d'un paiement", () => {
  const charges = [
    { charge: charge("frais", 100000), allocatedMinor: 100000, remainingMinor: 0 },
    { charge: charge("visa", 50000), allocatedMinor: 0, remainingMinor: 50000 },
    { charge: charge("dossier", 30000), allocatedMinor: 10000, remainingMinor: 20000 },
  ];

  it("solde les prestations dans l'ordre, en sautant celles déjà payées", () => {
    expect(allocateFifo(60000, charges)).toEqual([
      { chargeId: "visa", amountMinor: 50000 },
      { chargeId: "dossier", amountMinor: 10000 },
    ]);
  });

  it("refuse un paiement supérieur au reste à payer", () => {
    expect(allocateFifo(70001, charges)).toBeNull();
  });
});
