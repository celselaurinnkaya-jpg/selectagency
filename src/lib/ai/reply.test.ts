import { describe, expect, it } from "vitest";
import { finalizeAgentReply, TRANSFER_TAG } from "./reply";

// Dix réponses variées, comme celles du rapport de re-test du 22 novembre 2026 : aucune lettre ne doit disparaître.
const REPLIES = [
  "Bonjour et bienvenue chez *p services* ! Nous sommes ravis de vous aider.",
  "Nous accompagnons les demandes de visas (Schengen, Canada, USA, Turquie, Dubaï).",
  "Pour Campus France, la procédure se fait en ligne : Dites-m'en plus sur votre projet.",
  "Destinations : la France, l'Espagne, l'Italie, l'Allemagne, la Belgique.",
  "ÉTUDES À L'ÉTRANGER : AVI, garant, DELF, TCF et TEF Canada.",
  "Les frais de l'Ambassade de France (FR) sont fixés par l'État, pas par l'agence.",
  "MERCI ! Votre rendez-vous est noté : DÉPÔT DES PIÈCES le 25 novembre.",
  "Erasmus+, Mastère Spécialisé et Doctorat : réponse sous 48 h, sans garantie d'admission.",
  "Envoyez-nous votre passeport (PDF) ; NB : les documents doivent être lisibles.",
  "Un conseiller va prendre le relais pour votre devis personnalisé.",
];

describe("finalizeAgentReply", () => {
  it("garde toutes les lettres, majuscules comprises, sur dix réponses variées", () => {
    for (const reply of REPLIES) expect(finalizeAgentReply(reply).text).toBe(reply);
  });

  it("retire seulement la balise de transfert et la signale", () => {
    const result = finalizeAgentReply(`Nous transmettons DEMANDE_TRANSFERT et ADEFNS. ${TRANSFER_TAG}`);
    expect(result).toEqual({ text: "Nous transmettons DEMANDE_TRANSFERT et ADEFNS.", transfer: true });
  });

  it("reconnaît les formulations de transfert seulement quand on le demande", () => {
    expect(finalizeAgentReply(REPLIES[9]!).transfer).toBe(false);
    expect(finalizeAgentReply(REPLIES[9]!, { detectPhrases: true }).transfer).toBe(true);
    expect(finalizeAgentReply(REPLIES[0]!, { detectPhrases: true }).transfer).toBe(false);
  });

  it("met le gras au format WhatsApp", () => {
    expect(finalizeAgentReply("Les **pièces requises** pour la France").text).toBe("Les *pièces requises* pour la France");
  });
});
