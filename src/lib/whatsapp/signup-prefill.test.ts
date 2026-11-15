import { describe, expect, it } from "vitest";
import { buildSignupSetup, utcOffset } from "./signup-prefill";

const AT = new Date("2026-11-15T10:00:00Z");

describe("pré-remplissage de la fenêtre Meta", () => {
  it("remplit le portefeuille Business avec les données de l'agence, au format de Meta", () => {
    expect(
      buildSignupSetup(
        {
          agencyName: "SELECT Voyages",
          legalName: "SELECT Voyages SARL",
          email: " Contact@Select-Voyages.cg ",
          address: "12 avenue de la Paix",
          city: "Brazzaville",
          countryCode: "CG",
          phone: "06 400 99 99",
          timezone: "Africa/Brazzaville",
        },
        AT,
      ),
    ).toEqual({
      business: {
        name: "SELECT Voyages SARL",
        email: "contact@select-voyages.cg",
        address: { streetAddress1: "12 avenue de la Paix", city: "Brazzaville", country: "CG" },
        phone: { code: 242, number: "064009999" },
        timezone: "UTC+01:00",
      },
    });
  });

  it("omet les valeurs vides ou invalides au lieu d'envoyer n'importe quoi à Meta", () => {
    expect(buildSignupSetup({ agencyName: "Agence Dakar", email: "pas-un-email", phone: "123", countryCode: "SN", timezone: "Pas/UnFuseau" }, AT)).toEqual({
      business: { name: "Agence Dakar", address: { country: "SN" } },
    });
    expect(buildSignupSetup({ agencyName: "  " }, AT)).toEqual({});
  });

  it("limite le nom à 75 caractères (règle de Meta)", () => {
    expect(buildSignupSetup({ agencyName: "A".repeat(90) }, AT).business?.name).toHaveLength(75);
  });

  it("convertit le fuseau de l'agence en décalage UTC", () => {
    expect(utcOffset("Africa/Dakar", AT)).toBe("UTC+00:00");
    expect(utcOffset("Africa/Kinshasa", AT)).toBe("UTC+01:00");
    expect(utcOffset("Africa/Lubumbashi", AT)).toBe("UTC+02:00");
    expect(utcOffset("Fuseau/Inconnu", AT)).toBeUndefined();
  });
});
