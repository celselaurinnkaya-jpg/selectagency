import { describe, expect, it } from "vitest";
import type { Charge, Expense, Payment } from "@/lib/domain/types";
import { agencyFinance, caseFinance, chargeProgress } from "./calculations";

const charges: Charge[] = [
  { id: "fee", caseId: "c1", label: "Accompagnement", chargeType: "agency_fee", amountMinor: 800000, currency: "XAF" },
  { id: "visa", caseId: "c1", label: "Frais de visa", chargeType: "third_party", amountMinor: 65000, currency: "XAF" },
];
const payment = (id: string, amount: number, allocations: Payment["allocations"], status: Payment["status"] = "recorded", paidAt = "2026-10-10T10:00:00Z"): Payment => ({
  id, caseId: "c1", clientId: "x", amountMinor: amount, currency: "XAF", methodKind: "cash", methodLabel: "Espèces", paidAt, receivedBy: "m1", status, receiptNumber: id, allocations,
});

describe("finances d'un dossier", () => {
  it("calcule le convenu, l'encaissé et le solde en séparant frais de l'agence et montants tiers", () => {
    const f = caseFinance("XAF", charges, [payment("p1", 500000, [{ chargeId: "fee", amountMinor: 500000 }])]);
    expect(f).toMatchObject({ agreedAgencyMinor: 800000, agreedThirdPartyMinor: 65000, agreedMinor: 865000, paidMinor: 500000, balanceMinor: 365000, overpaidMinor: 0, unallocatedMinor: 0 });
  });

  it("ignore les paiements annulés", () => {
    const f = caseFinance("XAF", charges, [payment("p1", 500000, [{ chargeId: "fee", amountMinor: 500000 }], "voided")]);
    expect(f.paidMinor).toBe(0);
    expect(f.balanceMinor).toBe(865000);
  });

  it("signale un trop-perçu et un montant non affecté", () => {
    const f = caseFinance("XAF", charges, [payment("p1", 900000, [{ chargeId: "fee", amountMinor: 800000 }])]);
    expect(f.overpaidMinor).toBe(35000);
    expect(f.unallocatedMinor).toBe(100000);
  });

  it("refuse de mélanger deux devises dans un même dossier", () => {
    expect(() => caseFinance("XAF", [{ ...charges[0]!, currency: "EUR" }], [])).toThrow(/Devise incohérente/);
  });

  it("donne le reste à payer par prestation", () => {
    const progress = chargeProgress(charges, [payment("p1", 850000, [{ chargeId: "fee", amountMinor: 800000 }, { chargeId: "visa", amountMinor: 50000 }])]);
    expect(progress.map((p) => p.remainingMinor)).toEqual([0, 15000]);
  });
});

describe("finances de l'agence", () => {
  const expenses: Expense[] = [
    { id: "e1", expenseType: "operating", label: "Loyer", amountMinor: 150000, currency: "XAF", paidAt: "2026-10-01T09:00:00Z", recordedBy: "m4" },
    { id: "e2", expenseType: "client_disbursement", label: "Frais de visa reversés", amountMinor: 50000, currency: "XAF", paidAt: "2026-10-12T09:00:00Z", recordedBy: "m4" },
    { id: "e3", expenseType: "operating", label: "Licence", amountMinor: 1000, currency: "USD", paidAt: "2026-10-12T09:00:00Z", recordedBy: "m4" },
  ];
  const payments = [payment("p1", 850000, [{ chargeId: "fee", amountMinor: 800000 }, { chargeId: "visa", amountMinor: 50000 }])];

  it("ne compte pas les fonds destinés à des tiers comme revenus de l'agence", () => {
    const [xaf] = agencyFinance(charges, payments, expenses, {}).filter((f) => f.currency === "XAF");
    expect(xaf).toMatchObject({ receivedMinor: 850000, agencyRevenueMinor: 800000, thirdPartyReceivedMinor: 50000, disbursementsMinor: 50000, thirdPartyHeldMinor: 0, estimatedMarginMinor: 650000 });
  });

  it("présente chaque devise séparément, sans conversion", () => {
    const totals = agencyFinance(charges, payments, expenses, {});
    expect(totals.map((t) => t.currency)).toEqual(["USD", "XAF"]);
    expect(totals.find((t) => t.currency === "USD")?.operatingExpensesMinor).toBe(1000);
  });

  it("filtre la période mais garde le cumul des fonds de tiers détenus", () => {
    const [xaf] = agencyFinance(charges, payments, expenses, { from: new Date("2026-10-11T00:00:00Z") }).filter((f) => f.currency === "XAF");
    expect(xaf!.receivedMinor).toBe(0);
    expect(xaf!.thirdPartyHeldMinor).toBe(0);
  });
});
