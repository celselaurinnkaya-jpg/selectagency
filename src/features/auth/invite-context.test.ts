import { describe, expect, it } from "vitest";
import { inviteFromNext, inviteHref, signupDescription } from "./invite-context";

const TOKEN = "3f2b8c1e-9a4d-4c2b-8e1f-0a1b2c3d4e5f";

describe("inviteFromNext", () => {
  it("reconnaît les trois liens d'invitation", () => {
    expect(inviteFromNext(`/invite/${TOKEN}`)).toEqual({ kind: "team", token: TOKEN });
    expect(inviteFromNext(`/acces-client/${TOKEN.toUpperCase()}`)).toEqual({ kind: "client", token: TOKEN });
    expect(inviteFromNext(`/acces-partenaire/${TOKEN}`)).toEqual({ kind: "partner", token: TOKEN });
  });

  it("ignore toute autre adresse de retour", () => {
    expect(inviteFromNext(undefined)).toBeUndefined();
    expect(inviteFromNext("/dashboard")).toBeUndefined();
    expect(inviteFromNext("/invite/pas-un-jeton")).toBeUndefined();
    expect(inviteFromNext(`/invite/${TOKEN}/autre`)).toBeUndefined();
    expect(inviteFromNext(`//exemple.com/invite/${TOKEN}`)).toBeUndefined();
  });

  it("refait l'adresse du lien", () => {
    expect(inviteHref("client", TOKEN)).toBe(`/acces-client/${TOKEN}`);
    expect(inviteHref("partner", TOKEN)).toBe(`/acces-partenaire/${TOKEN}`);
  });
});

describe("signupDescription", () => {
  it("ne parle de créer une agence que sans invitation", () => {
    expect(signupDescription()).toMatch(/créerez ensuite votre agence/);
    for (const kind of ["team", "client", "partner"] as const) expect(signupDescription(kind, "Agence U")).not.toMatch(/agence\b.*créer|créerez/i);
    expect(signupDescription("team", "Agence U")).toBe("Créez votre compte pour rejoindre l'équipe de Agence U.");
    expect(signupDescription("client", "Agence U")).toBe("Créez votre compte pour ouvrir votre espace client chez Agence U.");
    expect(signupDescription("team")).toBe("Créez votre compte pour rejoindre l'équipe de l'agence qui vous a invité.");
  });
});
