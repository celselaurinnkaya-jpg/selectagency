import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { guardAiContent, stripUnbackedAmounts, stripUnbackedClaims } = await import("./ai");
const { defaultContent } = await import("./content");

const AGENCY = { name: "Presta Services", city: "Douala", countryName: "Cameroun", phone: "+237 6 99 00 00 00", services: [] };
const BRIEF =
  "Presta Services accompagne les étudiants vers la France et le Canada depuis Douala. Frais de dossier : 50 000 FCFA. " +
  "Avis : « Grâce à Presta Services j'ai obtenu mon admission à Lyon » — Marie K.";

describe("rédaction du site par l'IA : garde-fous", () => {
  it("retire les montants qui ne figurent pas dans la description", () => {
    expect(stripUnbackedAmounts("Frais de dossier : 50 000 FCFA. Rapide.", BRIEF)).toBe("Frais de dossier : 50 000 FCFA. Rapide.");
    expect(stripUnbackedAmounts("Visa à 200 000 FCFA seulement. Équipe disponible.", BRIEF)).toBe("Équipe disponible.");
  });

  it("garde les choix de l'agence et rejette coordonnées et avis inventés", () => {
    const current = defaultContent("campus", AGENCY);
    const result = guardAiContent(
      {
        agencyName: "Presta Services",
        hero: { title: "Étudiez en France", subtitle: "Taux de réussite garanti, visa à 300 000 FCFA.", ctaLabel: "Nous écrire" },
        contact: { phone: "+237 6 11 22 33 44", email: "contact@inventé.test", address: "", hours: "", whatsapp: "", title: "Contact", text: "" },
        testimonials: {
          visible: true,
          title: "Avis",
          items: [
            { name: "Marie K.", text: "Grâce à Presta Services j'ai obtenu mon admission à Lyon" },
            { name: "Paul", text: "Service exceptionnel, je recommande à tous !" },
          ],
        },
        colors: { primary: "#000000", accent: "#FFFFFF" },
        template: "horizon",
      },
      BRIEF,
      AGENCY,
      current,
    );
    expect(result.template).toBe("campus");
    expect(result.colors).toEqual(current.colors);
    expect(result.hero.subtitle).toBe("");
    expect(stripUnbackedClaims("Visa garanti en 10 jours. Accompagnement complet.", BRIEF)).toBe("Accompagnement complet.");
    expect(stripUnbackedClaims("Nous accompagnons les étudiants.", BRIEF)).toBe("Nous accompagnons les étudiants.");
    expect(result.contact.phone).toBe("+237 6 99 00 00 00");
    expect(result.contact.email).toBe("");
    expect(result.testimonials.items.map((t) => t.name)).toEqual(["Marie K."]);
  });

  it("ne vide jamais un contact rempli et accepte une nouvelle adresse donnée dans la description (rapport du 23/11)", () => {
    const current = { ...defaultContent("horizon", AGENCY), contact: { ...defaultContent("horizon", AGENCY).contact, email: "agence@exemple.test", address: "R. Antônio Fernandes Pinheiro, 815" } };
    const brief = "Notre agence est située avenue de la Paix à Brazzaville. Ouvert du lundi au samedi de 8 h à 18 h.";
    const result = guardAiContent(
      { contact: { title: "", text: "", phone: "", whatsapp: "", email: "", address: "Avenue de la Paix, Brazzaville", hours: "Du lundi au samedi, de 8 h à 18 h" } },
      brief,
      AGENCY,
      current,
    );
    expect(result.contact.email).toBe("agence@exemple.test");
    expect(result.contact.address).toBe("Avenue de la Paix, Brazzaville");
    expect(result.contact.hours).toBe("Du lundi au samedi, de 8 h à 18 h");
    expect(result.contact.phone).toBe("+237 6 99 00 00 00");
  });
});
