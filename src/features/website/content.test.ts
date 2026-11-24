import { describe, expect, it } from "vitest";
import { contrastRatio, defaultContent, missingForPublication, normalizeContent, readableOn, slugify, TEMPLATES } from "./content";

const AGENCY = { name: "Presta Services", city: "Douala", countryName: "Cameroun", phone: "+237 6 99 00 00 00", services: [] };

describe("site web de l'agence", () => {
  it("propose une adresse lisible à partir du nom de l'agence", () => {
    expect(slugify("Presta Services")).toBe("presta-services");
    expect(slugify("Voyages+ Éclair d'Afrique")).toBe("voyages-eclair-d-afrique");
    expect(slugify("AB")).toBe("agence-ab");
  });

  it("choisit un texte lisible sur la couleur de l'agence", () => {
    expect(readableOn("#0B3B66")).toBe("#FFFFFF");
    expect(readableOn("#F2B705")).toBe("#0F172A");
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 0);
  });

  it("prépare une page prête à publier pour chaque modèle, avec les informations de l'agence", () => {
    for (const key of Object.keys(TEMPLATES) as (keyof typeof TEMPLATES)[]) {
      const content = defaultContent(key, AGENCY);
      expect(content.template).toBe(key);
      expect(content.agencyName).toBe("Presta Services");
      expect(content.contact.phone).toBe("+237 6 99 00 00 00");
      expect(content.services.items.length).toBeGreaterThan(0);
      // Aucun avis de client inventé.
      expect(content.testimonials.items).toEqual([]);
      expect(missingForPublication(content)).toEqual([]);
    }
  });

  it("répare un contenu incomplet et refuse les adresses d'image non sûres", () => {
    const content = normalizeContent({ template: "inconnu", heroImageUrl: "javascript:alert(1)", services: { items: [{ name: "Visa" }, 42] } });
    expect(content.template).toBe("horizon");
    expect(content.heroImageUrl).toBe("");
    expect(content.services.items).toEqual([{ name: "Visa", description: "" }]);
    expect(missingForPublication(content)).toContain("le nom de l'agence");
    expect(normalizeContent({ logoUrl: "https://projet.supabase.co/storage/v1/object/public/website-assets/a/logo.png" }).logoUrl).toMatch(/^https:/);
  });
});
