import { describe, expect, it } from "vitest";
import type { Bureau } from "@/lib/domain/types";
import { bureauLimit, bureauOptions, defaultBureauFor, matchesBureau, parseBureauParam, textOn } from "./display";

const bureau = (id: string, code: string, archived = false): Bureau => ({
  id, name: `Bureau ${code}`, code, city: "", color: "#023764", address: "", phone: "", email: "", archived,
});
const DLA = bureau("b-dla", "DLA");
const YDE = bureau("b-yde", "YDE");
const OLD = bureau("b-old", "OLD", true);
const ALL = [DLA, YDE, OLD];

describe("bureaux de l'agence", () => {
  it("limite le nombre de bureaux selon la formule, comme la base", () => {
    const plan = (tier: "starter" | "pro" | "business") => ({ status: "active" as const, plan: { id: "p", name: tier, tier } });
    expect(bureauLimit(false, plan("starter"))).toBe(1);
    expect(bureauLimit(false, plan("pro"))).toBe(3);
    expect(bureauLimit(false, plan("business"))).toBeUndefined();
    expect(bureauLimit(false, { status: "trialing" })).toBeUndefined();
    expect(bureauLimit(true, plan("starter"))).toBeUndefined();
  });

  it("filtre une liste par bureau (un bureau, ou les fiches sans bureau)", () => {
    expect(parseBureauParam("b-dla", ALL)).toBe("b-dla");
    expect(parseBureauParam("aucun", ALL)).toBe("aucun");
    expect(parseBureauParam("inconnu", ALL)).toBeUndefined();
    expect(matchesBureau(undefined, "b-yde")).toBe(true);
    expect(matchesBureau("b-dla", "b-dla")).toBe(true);
    expect(matchesBureau("b-dla", "b-yde")).toBe(false);
    expect(matchesBureau("aucun", undefined)).toBe(true);
    expect(matchesBureau("aucun", "b-dla")).toBe(false);
  });

  it("propose les bureaux ouverts, le bureau actuel fermé, et seulement les siens à un membre cloisonné", () => {
    expect(bureauOptions(ALL).map((o) => o.value)).toEqual(["b-dla", "b-yde"]);
    expect(bureauOptions(ALL, "b-old").map((o) => o.label)).toContain("OLD — Bureau OLD (fermé)");
    const agent = { role: "agent" as const, bureauIds: ["b-yde"] };
    expect(bureauOptions(ALL, undefined, { restrictByBureau: true, member: agent }).map((o) => o.value)).toEqual(["b-yde"]);
    expect(bureauOptions(ALL, undefined, { restrictByBureau: false, member: agent }).map((o) => o.value)).toEqual(["b-dla", "b-yde"]);
    expect(bureauOptions(ALL, undefined, { restrictByBureau: true, member: { role: "owner", bureauIds: [] } }).length).toBe(2);
  });

  it("remplit le bureau d'une nouvelle fiche avec celui du conseiller s'il n'en a qu'un", () => {
    expect(defaultBureauFor({ bureauIds: ["b-dla"] }, ALL)).toBe("b-dla");
    expect(defaultBureauFor({ bureauIds: ["b-dla", "b-yde"] }, ALL)).toBeUndefined();
    expect(defaultBureauFor({ bureauIds: ["b-old"] }, ALL)).toBeUndefined();
    expect(defaultBureauFor(undefined, ALL)).toBeUndefined();
  });

  it("écrit le code du badge dans une couleur lisible", () => {
    expect(textOn("#023764")).toBe("#FFFFFF");
    expect(textOn("#F0FF0A")).toBe("#0F172A");
  });
});
