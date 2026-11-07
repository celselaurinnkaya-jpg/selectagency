import { describe, expect, it } from "vitest";
import { evaluate, formatNumber } from "./pocket-calculator";

const value = (input: string) => {
  const r = evaluate(input);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe("calculatrice (src/features/finance/pocket-calculator.ts)", () => {
  it("calcule avec les signes usuels, les parenthèses et la virgule", () => {
    expect(value("150 000 + 25 000")).toBe(175000);
    expect(value("3 × 45 000")).toBe(135000);
    expect(value("90 000 ÷ 4")).toBe(22500);
    expect(value("(150000 - 50000) / 2")).toBe(50000);
    expect(value("2,5 × 4")).toBe(10);
    expect(value("0,1 + 0,2")).toBe(0.3);
    expect(value("-5 + 8")).toBe(3);
    expect(value("10 − 3 − 2")).toBe(5);
    expect(value("2 + 3 × 4")).toBe(14);
  });

  it("traite le pourcentage comme une calculatrice de poche", () => {
    expect(value("150000 + 10%")).toBe(165000);
    expect(value("150000 - 10%")).toBe(135000);
    expect(value("150000 × 10%")).toBe(15000);
    expect(value("25%")).toBe(0.25);
  });

  it("explique les erreurs en français, sans planter", () => {
    expect(evaluate("")).toEqual({ ok: false, error: "Saisissez un calcul." });
    expect(evaluate("10 ÷ 0")).toEqual({ ok: false, error: "Division par zéro impossible." });
    expect(evaluate("(2 + 3")).toEqual({ ok: false, error: "Parenthèse non fermée." });
    expect(evaluate("2 + 3)")).toEqual({ ok: false, error: "Parenthèse fermée en trop." });
    expect(evaluate("2 +")).toEqual({ ok: false, error: "Calcul incomplet." });
    expect(evaluate("alert(1)").ok).toBe(false);
    expect(evaluate("1.2.3").ok).toBe(false);
  });

  it("affiche les nombres au format français", () => {
    expect(formatNumber(1234567.5).replace(/\s/g, " ")).toBe("1 234 567,5");
  });
});
