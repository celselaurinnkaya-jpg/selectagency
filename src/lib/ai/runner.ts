import "server-only";
import { getAnthropicClient } from "./client";
import { buildSystemPrompt } from "./prompts";
import { toWhatsAppText } from "./whatsapp-format";
import type { AiAgentRecord } from "@/lib/domain/ai";

// Une passe de dialogue avec l'agent IA, par l'API officielle d'Anthropic.
// Pas de réponse inventée : sans clé configurée, ou si le service ne répond pas, l'appelant reçoit une erreur
// claire en français (le détail technique reste dans les journaux du serveur, jamais la clé).

export interface ChatMessageInput {
  role: "user" | "assistant";
  content: string;
}

export interface AiRunExecutionResult {
  replyText: string;
  /** Modèle réellement utilisé (identifiant Anthropic). */
  model: string;
  tokensPrompt: number;
  tokensCompletion: number;
  durationMs: number;
  estimatedCostFcfa: number;
  /** Coût réel de l'appel en dollars (tarifs Anthropic), pour le suivi de consommation. */
  estimatedCostUsd: number;
  transferSuggested: boolean;
  transferReason?: string;
}

/** L'IA ne peut pas répondre (clé absente ou service indisponible) : message prêt à afficher. */
export class AiUnavailableError extends Error {}

export const AI_NOT_CONFIGURED_GEMINI = "L'IA n'est pas encore configurée : la clé Gemini de SELECT doit être ajoutée (GEMINI_API_KEY).";

export const AI_NOT_CONFIGURED ="L'IA n'est pas encore configurée : la clé Anthropic de SELECT doit être ajoutée (ANTHROPIC_API_KEY).";

/** Modèles retenus (docs/ARCHITECTURE_AGENT_IA.md, § 5.2). */
const MODELS = {
  haiku: { id: "claude-haiku-5-5", inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.5 },
  sonnet: { id: "claude-sonnet-5-5", inputUsdPerMillion: 2, outputUsdPerMillion: 10 },
} as const;

/** Taux indicatif pour l'estimation affichée : 1 USD ≈ 587 FCFA. */
const FCFA_PER_USD = 587;

function costUsd(model: (typeof MODELS)[keyof typeof MODELS], promptTokens: number, completionTokens: number): number {
  return (promptTokens * model.inputUsdPerMillion + completionTokens * model.outputUsdPerMillion) / 1_000_000;
}

export async function runAgentConversation(
  agent: Pick<AiAgentRecord, "name" | "role" | "tone" | "personality" | "systemInstructions" | "servicesScope" | "restrictedTopics" | "transferConditions" | "modelTier">,
  agencyName: string,
  messages: ChatMessageInput[],
  knowledgeContext?: string,
): Promise<AiRunExecutionResult> {
  const client = getAnthropicClient();
  if (!client) throw new AiUnavailableError(AI_NOT_CONFIGURED);

  const model = agent.modelTier === "sonnet" ? MODELS.sonnet : MODELS.haiku;
  const startedAt = Date.now();
  let response;
  try {
    response = await client.messages.create({
      model: model.id,
      max_tokens: 1000,
      system: buildSystemPrompt(agent, agencyName, knowledgeContext),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
  } catch (err) {
    console.error("Agent IA : l'appel à Anthropic a échoué :", err instanceof Error ? err.message : err);
    throw new AiUnavailableError("Le service d'IA n'a pas répondu. Réessayez dans un instant.");
  }

  const rawText = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
  const hasTransfer = rawText.includes("[DEMANDE_TRANSFERT]");
  const tokensPrompt = response.usage.input_tokens;
  const tokensCompletion = response.usage.output_tokens;
  const usd = costUsd(model, tokensPrompt, tokensCompletion);

  return {
    replyText: toWhatsAppText(rawText.replace(/\[DEMANDE_TRANSFERT\]/g, "")),
    model: model.id,
    tokensPrompt,
    tokensCompletion,
    durationMs: Date.now() - startedAt,
    estimatedCostFcfa: Number((usd * FCFA_PER_USD).toFixed(2)),
    estimatedCostUsd: Number(usd.toFixed(6)),
    transferSuggested: hasTransfer,
    transferReason: hasTransfer ? "L'IA a détecté un besoin d'intervention humaine ou une condition de transfert." : undefined,
  };
}
