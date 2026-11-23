import { describe, expect, it } from "vitest";
import { canWrite, daysLeft, demoEndsAt, effectiveStatus, graceEndsAt } from "./subscription";

const NOW = new Date("2026-10-30T10:00:00Z");

describe("abonnement", () => {
  it("considère un essai dont la date est passée comme terminé", () => {
    expect(effectiveStatus({ status: "trialing", trialEndsAt: "2026-10-29T10:00:00Z" }, NOW)).toBe("trial_expired");
    expect(effectiveStatus({ status: "trialing", trialEndsAt: "2026-11-29T10:00:00Z" }, NOW)).toBe("trialing");
    expect(effectiveStatus({ status: "active" }, NOW)).toBe("active");
  });

  it("autorise l'écriture comme la base de données", () => {
    // Démonstration : 7 jours après sa création, puis consultation seulement.
    expect(demoEndsAt("2026-10-25T10:00:00Z")).toBe("2026-11-01T10:00:00.000Z");
    expect(canWrite(true, undefined, NOW, demoEndsAt("2026-10-25T10:00:00Z"))).toBe(true);
    expect(canWrite(true, undefined, NOW, demoEndsAt("2026-10-23T09:00:00Z"))).toBe(false);
    expect(canWrite(true, undefined, NOW)).toBe(false);
    expect(canWrite(false, undefined, NOW)).toBe(false);
    expect(canWrite(false, { status: "trialing" }, NOW)).toBe(true);
    expect(canWrite(false, { status: "trialing", trialEndsAt: "2026-10-01T00:00:00Z" }, NOW)).toBe(false);
    expect(canWrite(false, { status: "past_due" }, NOW)).toBe(true);
    expect(canWrite(false, { status: "suspended" }, NOW)).toBe(false);
    expect(canWrite(false, { status: "cancelled" }, NOW)).toBe(false);
  });

  it("met une agence cliente en retard après l'échéance, puis en lecture seule après 7 jours de grâce", () => {
    const end = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString();
    expect(effectiveStatus({ status: "active", currentPeriodEnd: end(5) }, NOW)).toBe("active");
    expect(effectiveStatus({ status: "active", currentPeriodEnd: end(-2) }, NOW)).toBe("past_due");
    expect(canWrite(false, { status: "active", currentPeriodEnd: end(-2) }, NOW)).toBe(true);
    expect(effectiveStatus({ status: "active", currentPeriodEnd: end(-7) }, NOW)).toBe("overdue");
    expect(canWrite(false, { status: "past_due", currentPeriodEnd: end(-8) }, NOW)).toBe(false);
    // Agence interne, ou abonnement sans échéance : jamais en lecture seule pour cette raison.
    expect(effectiveStatus({ status: "active", currentPeriodEnd: end(-30), isInternal: true }, NOW)).toBe("active");
    expect(canWrite(false, { status: "active" }, NOW)).toBe(true);
    expect(graceEndsAt("2026-10-01T00:00:00Z")).toBe("2026-10-08T00:00:00.000Z");
  });

  it("compte les jours restants", () => {
    expect(daysLeft("2026-11-02T09:00:00Z", NOW)).toBe(3);
    expect(daysLeft("2026-10-01T00:00:00Z", NOW)).toBe(0);
  });
});
