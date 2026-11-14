import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

const create = vi.fn();
const clientState = { configured: true };
vi.mock("./client", () => ({
  getAnthropicClient: () => (clientState.configured ? { messages: { create } } : null),
  isAnthropicConfigured: () => clientState.configured,
}));

import { buildSystemPrompt } from "./prompts";
import { AI_NOT_CONFIGURED, AiUnavailableError, runAgentConversation } from "./runner";
import type { AiAgentRecord } from "@/lib/domain/ai";

const mockAgent: Pick<
  AiAgentRecord,
  "name" | "role" | "tone" | "personality" | "systemInstructions" | "servicesScope" | "restrictedTopics" | "transferConditions" | "modelTier"
> = {
  name: "Amina",
  role: "Conseillère Visas & Mobilité",
  tone: "courtois",
  personality: "Patiente, professionnelle et bienveillante",
  systemInstructions: "Accueillir le client, vérifier la destination demandée et les dates de départ.",
  servicesScope: "Visas Schengen, Canada, Chine, Campus France",
  restrictedTopics: "Ne pas aborder de promesse d'emploi à l'étranger",
  transferConditions: "Si le client a déjà eu un refus de visa consulaire",
  modelTier: "haiku",
};

describe("Moteur IA — Prompts et Conformité", () => {
  it("construit un prompt système conforme à la directive Meta 2026 et aux règles SELECT Agency", () => {
    const prompt = buildSystemPrompt(mockAgent, "Voyages Excellence");

    // Identité
    expect(prompt).toContain("Amina");
    expect(prompt).toContain("Voyages Excellence");
    expect(prompt).toContain("Conseillère Visas & Mobilité");

    // Ton et personnalité
    expect(prompt).toContain("Ton professionnel, poli, posé et respectueux");
    expect(prompt).toContain("Patiente, professionnelle et bienveillante");

    // Règle Meta 2026 : interdiction des chatbots généralistes hors-sujet
    expect(prompt).toContain("RÈGLE META (15 JANVIER 2026)");
    expect(prompt).toContain("REFUSER POLIMENT tout sujet sans rapport direct avec l'agence");

    // Règle de non-garantie de visa
    expect(prompt).toContain("AUCUNE PROMESSE DE VISA");
    expect(prompt).toContain("Tu ne dois JAMAIS affirmer ni garantir l'obtention d'un visa");

    // Transfert vers conseiller humain
    expect(prompt).toContain("TRANSFERT VERS UN CONSEILLER HUMAIN");
    expect(prompt).toContain("[DEMANDE_TRANSFERT]");
    expect(prompt).toContain("Si le client a déjà eu un refus de visa consulaire");
  });
});

describe("Moteur IA — Appel à Anthropic (sans réponse inventée)", () => {
  const ask = [{ role: "user" as const, content: "Bonjour, quels documents pour un visa étudiant ?" }];

  it("sans clé configurée, renvoie une erreur claire au lieu d'inventer une réponse", async () => {
    clientState.configured = false;
    await expect(runAgentConversation(mockAgent, "Agence Test", ask)).rejects.toThrow(AI_NOT_CONFIGURED);
    clientState.configured = true;
  });

  it("utilise Claude Haiku 5.5 par défaut et retire le marqueur de transfert du texte", async () => {
    create.mockResolvedValueOnce({
      content: [{ type: "text", text: "Je vous passe un conseiller. [DEMANDE_TRANSFERT]" }],
      usage: { input_tokens: 1000, output_tokens: 200 },
    });
    const result = await runAgentConversation(mockAgent, "Agence Test", ask);
    expect(create.mock.calls.at(-1)?.[0].model).toBe("claude-haiku-5-5");
    expect(result.model).toBe("claude-haiku-5-5");
    expect(result.replyText).toBe("Je vous passe un conseiller.");
    expect(result.transferSuggested).toBe(true);
    // 1 000 × 0,10 $ + 200 × 0,50 $ par million = 0,0002 $ ≈ 0,12 FCFA
    expect(result.estimatedCostFcfa).toBeCloseTo(0.12, 2);
  });

  it("utilise Claude Sonnet 5.5 pour un agent réglé sur le modèle avancé", async () => {
    create.mockResolvedValueOnce({ content: [{ type: "text", text: "Réponse." }], usage: { input_tokens: 10, output_tokens: 5 } });
    const result = await runAgentConversation({ ...mockAgent, modelTier: "sonnet" }, "Agence Test", ask);
    expect(result.model).toBe("claude-sonnet-5-5");
    expect(result.transferSuggested).toBe(false);
  });

  it("si le service ne répond pas, renvoie un message simple sans détail technique", async () => {
    create.mockRejectedValueOnce(new Error("401 invalid x-api-key"));
    const error = await runAgentConversation(mockAgent, "Agence Test", ask).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiUnavailableError);
    expect((error as Error).message).toBe("Le service d'IA n'a pas répondu. Réessayez dans un instant.");
  });
});
