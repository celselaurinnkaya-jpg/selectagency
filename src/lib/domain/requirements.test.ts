import { describe, expect, it } from "vitest";
import { isMissingRequired } from "./requirements";

describe("isMissingRequired", () => {
  it("compte une pièce obligatoire non reçue, à corriger ou expirée", () => {
    for (const status of ["not_received", "to_correct", "expired"] as const) expect(isMissingRequired({ isRequired: true, status })).toBe(true);
  });

  it("ne compte ni une pièce reçue ou vérifiée, ni une pièce facultative", () => {
    for (const status of ["received", "to_verify", "validated", "waived"] as const) expect(isMissingRequired({ isRequired: true, status })).toBe(false);
    expect(isMissingRequired({ isRequired: false, status: "not_received" })).toBe(false);
  });
});
