import { describe, expect, it } from "vitest";
import { FEATURES, lockedFeatures } from "./features";
import type { Subscription } from "./types";

// Même règle que private.org_has_feature (supabase/migrations/20261106110000_formules.sql).
const sub = (status: Subscription["status"], tier?: "starter" | "pro" | "business"): Subscription => ({
  status,
  plan: tier ? { id: "p", name: tier.toUpperCase(), tier } : undefined,
});

describe("options selon la formule (src/lib/domain/features.ts)", () => {
  it("ferme les options PRO en STARTER, et seulement en STARTER", () => {
    expect(lockedFeatures(false, sub("active", "starter"))).toEqual([...FEATURES]);
    expect(lockedFeatures(false, sub("past_due", "starter"))).toEqual([...FEATURES]);
    expect(lockedFeatures(false, sub("active", "pro"))).toEqual([]);
    expect(lockedFeatures(false, sub("active", "business"))).toEqual([]);
    // Ancienne formule sans palier : tout est ouvert.
    expect(lockedFeatures(false, sub("active"))).toEqual([]);
  });

  it("ouvre tout pendant l'essai et dans une démonstration", () => {
    expect(lockedFeatures(false, sub("trialing", "starter"))).toEqual([]);
    expect(lockedFeatures(true, undefined)).toEqual([]);
    expect(lockedFeatures(false, undefined)).toEqual([]);
  });
});
