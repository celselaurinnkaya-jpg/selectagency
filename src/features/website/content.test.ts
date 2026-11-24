import { describe, expect, it } from "vitest";
import {
  cleanSlugInput,
  contrastRatio,
  defaultContent,
  finalizeSlug,
  internationalPhone,
  missingForPublication,
  normalizeContent,
  pageTitle,
  publicationChecks,
  readableOn,
  serviceMotive,
  slugify,
  TEMPLATES,
  whatsappHref,
  withInternationalPhones,
} from "./content";

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

  it("adresse sans accents, numéros internationaux, titre court et projet du prospect (rapport du 23/11)", () => {
    expect(cleanSlugInput("Test Claude é!")).toBe("test-claude-e-");
    expect(finalizeSlug("Test Claude é!")).toBe("test-claude-e");
    expect(finalizeSlug("--Agence  ÉCLAIR--")).toBe("agence-eclair");
    expect(internationalPhone("069141360", "CG")).toBe("+242 06 914 1360");
    expect(whatsappHref("069141360", "CG")).toBe("https://wa.me/242069141360");
    expect(whatsappHref("+242 06 914 13 60", "CM")).toBe("https://wa.me/242069141360");
    expect(whatsappHref("12", "CG")).toBeUndefined();
    const long = { ...defaultContent("horizon", AGENCY), tagline: "Votre partenaire de confiance pour tous vos voyages, études et démarches en Afrique et ailleurs" };
    expect(pageTitle(long)).toBe("Presta Services");
    expect(pageTitle(defaultContent("horizon", AGENCY)).length).toBeLessThanOrEqual(60);
    expect(serviceMotive("Hébergement")).toBe("custom_trip");
    expect(serviceMotive("Visa étudiant")).toBe("study_abroad");
    expect(serviceMotive("Légalisation de documents")).toBe("administrative");
    expect(serviceMotive("")).toBeUndefined();
  });

  it("liste ce qu'il faut vérifier avant de publier", () => {
    const content = defaultContent("evasion", { ...AGENCY, phone: "069141360" });
    const { blocking, warnings } = publicationChecks(content);
    expect(blocking).toEqual([]);
    expect(warnings.join(" ")).toMatch(/texte d'exemple/);
    expect(warnings.join(" ")).toMatch(/aucune adresse e-mail/);
    expect(warnings.join(" ")).toMatch(/sans indicatif/);
    expect(publicationChecks(withInternationalPhones(content, "CG")).warnings.join(" ")).not.toMatch(/sans indicatif/);
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
