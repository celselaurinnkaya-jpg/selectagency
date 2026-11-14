import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { chunkText, formatKnowledgeForPrompt } from "./knowledge";
import { buildSystemPrompt } from "./prompts";
import type { AiAgentRecord } from "@/lib/domain/ai";

const sampleAgent: Pick<
  AiAgentRecord,
  "name" | "role" | "tone" | "personality" | "systemInstructions" | "servicesScope" | "restrictedTopics" | "transferConditions" | "modelTier"
> = {
  name: "Amina",
  role: "Conseillère Visas",
  tone: "courtois",
  personality: "Précise et professionnelle",
  systemInstructions: "Accueillir et orienter les clients.",
  servicesScope: "Visas Schengen, Canada",
  restrictedTopics: "",
  transferConditions: "",
  modelTier: "haiku",
};

describe("Base de connaissances — Découpage (Chunking) et Formatage RAG", () => {
  it("découpe un texte court en un seul fragment sans perte", () => {
    const text = "Le visa Schengen court séjour coûte 80 EUR au consulat.";
    const chunks = chunkText(text, 500);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it("découpe un texte long en plusieurs fragments cohérents respectant les paragraphes", () => {
    const p1 = "Premier paragraphe détaillant les pièces justificatives requises pour le visa de tourisme Schengen : passeport valide au moins 6 mois, deux photos d'identité aux normes, attestation d'assurance voyage internationale.";
    const p2 = "Deuxième paragraphe expliquant les frais : les droits de visa perçus par le consulat sont de 80 EUR. Les frais de service du centre de visa sont de 20 000 FCFA. Les frais d'assistance de l'agence sont de 50 000 FCFA.";
    const p3 = "Troisième paragraphe sur les délais : le délai légal standard d'instruction est de 15 jours calendaires à partir du dépôt biométrique.";

    const fullText = `${p1}\n\n${p2}\n\n${p3}`;
    const chunks = chunkText(fullText, 250);

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // Vérifie qu'aucun morceau ne contient du texte tronqué
    expect(chunks[0]).toContain("Premier paragraphe");
  });

  it("formate correctement les fragments pour le prompt système", () => {
    const snippets = [
      { sourceTitle: "Tarifs 2026", content: "Frais agence : 50 000 FCFA." },
      { sourceTitle: "Délais", content: "Délais consulaires : 15 jours ouvrés." },
    ];

    const formatted = formatKnowledgeForPrompt(snippets);
    expect(formatted).toContain('[Source 1 : "Tarifs 2026"]');
    expect(formatted).toContain("Frais agence : 50 000 FCFA.");
    expect(formatted).toContain('[Source 2 : "Délais"]');
  });

  it("injecte les extraits documentaires dans buildSystemPrompt", () => {
    const snippets = [{ sourceTitle: "Fiche Tarifs", content: "Frais de dossier agence : 50 000 FCFA." }];
    const ragContext = formatKnowledgeForPrompt(snippets);

    const prompt = buildSystemPrompt(sampleAgent, "Select Travel", ragContext);
    expect(prompt).toContain("EXTRAITS DE LA BASE DE CONNAISSANCES OFFICIELLE DE L'AGENCE");
    expect(prompt).toContain("Frais de dossier agence : 50 000 FCFA.");
  });
});

