import "server-only";
import type { AiModelTier, AiTone } from "@/lib/domain/ai";
import { formatKnowledgeForPrompt } from "./knowledge";
import { AiUnavailableError, type ChatMessageInput, type runAgentConversation } from "./runner";
import type { sendWhatsAppMessage } from "@/lib/whatsapp/client";

// Réponse automatique de l'IA à un message WhatsApp entrant, après le délai choisi dans le Studio (15 s, 20 s…).
// 1. La base dit si l'IA peut répondre (mode IA, agent actif, quota, abonnement, numéro connecté).
// 2. Attente du délai ; puis nouvelle vérification : si un conseiller a repris la main ou si le client a écrit
//    un autre message entre-temps, cette réponse est abandonnée (c'est le dernier message qui sera traité).
// 3. L'IA rédige la réponse à partir de la conversation et des connaissances de l'agent ; Meta l'envoie ;
//    la base l'enregistre avec l'identifiant de Meta (statut « envoyé » seulement si Meta l'a accepté).

/** Délai maximal réellement attendu, pour rester dans la durée d'exécution du serveur. */
export const MAX_DELAY_SECONDS = 45;

interface ContextAgent {
  id: string;
  name: string;
  role: string;
  tone: AiTone;
  personality: string | null;
  system_instructions: string;
  services_scope: string | null;
  restricted_topics: string | null;
  transfer_conditions: string | null;
  model_tier: AiModelTier;
  response_delay_seconds: number;
}

export type ReplyContext =
  | { reply: false; reason: string }
  | {
      reply: true;
      agency_name: string;
      phone_number_id: string;
      to: string;
      agent: ContextAgent;
      messages: { direction: "inbound" | "outbound"; body: string }[];
      knowledge: { source_title: string; content: string }[];
    };

export interface AutoReplyDeps {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  secret: string;
  accessToken?: string;
  sleep: (ms: number) => Promise<void>;
  run: typeof runAgentConversation;
  send: typeof sendWhatsAppMessage;
}

export type AutoReplyOutcome = { status: "sent" } | { status: "skipped"; reason: string } | { status: "failed"; reason: string };

/** Conversation WhatsApp → messages pour l'IA : rôles alternés, en commençant et en finissant par le client. */
export function toChatMessages(history: { direction: "inbound" | "outbound"; body: string }[]): ChatMessageInput[] {
  const out: ChatMessageInput[] = [];
  for (const m of history) {
    const content = (m.body ?? "").trim();
    if (!content) continue;
    const role = m.direction === "inbound" ? "user" : "assistant";
    if (!out.length && role === "assistant") continue;
    const last = out.at(-1);
    if (last && last.role === role) last.content = `${last.content}\n${content}`;
    else out.push({ role, content });
  }
  while (out.length && out.at(-1)!.role === "assistant") out.pop();
  return out;
}

export function delaySeconds(value: unknown): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), MAX_DELAY_SECONDS) : 15;
}

async function context(deps: AutoReplyDeps, conversationId: string, triggerMetaId: string): Promise<ReplyContext> {
  const { data, error } = await deps.rpc("ai_reply_context", { p_secret: deps.secret, p_conversation_id: conversationId, p_trigger_meta_id: triggerMetaId });
  if (error || !data) return { reply: false, reason: "context-error" };
  return data as ReplyContext;
}

export async function autoReply(deps: AutoReplyDeps, conversationId: string, triggerMetaId: string): Promise<AutoReplyOutcome> {
  if (!deps.accessToken) return { status: "skipped", reason: "whatsapp-token" };

  const first = await context(deps, conversationId, triggerMetaId);
  if (!first.reply) return { status: "skipped", reason: first.reason };

  const wait = delaySeconds(first.agent.response_delay_seconds);
  if (wait > 0) await deps.sleep(wait * 1000);

  // Après le délai : un conseiller a pu reprendre la main, ou le client a pu écrire un autre message.
  const ctx = await context(deps, conversationId, triggerMetaId);
  if (!ctx.reply) return { status: "skipped", reason: ctx.reason };

  const messages = toChatMessages(ctx.messages);
  if (!messages.length) return { status: "skipped", reason: "empty" };

  let result;
  try {
    result = await deps.run(
      {
        name: ctx.agent.name,
        role: ctx.agent.role,
        tone: ctx.agent.tone,
        personality: ctx.agent.personality ?? undefined,
        systemInstructions: ctx.agent.system_instructions,
        servicesScope: ctx.agent.services_scope ?? undefined,
        restrictedTopics: ctx.agent.restricted_topics ?? undefined,
        transferConditions: ctx.agent.transfer_conditions ?? undefined,
        modelTier: ctx.agent.model_tier,
      },
      ctx.agency_name,
      messages,
      formatKnowledgeForPrompt(ctx.knowledge.map((k) => ({ sourceTitle: k.source_title, content: k.content }))) || undefined,
    );
  } catch (err) {
    if (err instanceof AiUnavailableError) return { status: "skipped", reason: "ai-unavailable" };
    throw err;
  }
  if (!result.replyText) return { status: "skipped", reason: "empty-reply" };

  const sent = await deps.send({ phoneNumberId: ctx.phone_number_id, to: ctx.to, text: result.replyText, accessToken: deps.accessToken });
  const { error } = await deps.rpc("record_ai_reply", {
    p_secret: deps.secret,
    p_conversation_id: conversationId,
    p_agent_id: ctx.agent.id,
    p_body: result.replyText,
    p_meta_message_id: sent.ok && sent.metaMessageId ? sent.metaMessageId : null,
    p_model: result.model,
    p_tokens_prompt: result.tokensPrompt,
    p_tokens_completion: result.tokensCompletion,
    p_cost_usd: result.estimatedCostUsd,
    p_duration_ms: result.durationMs,
    p_transfer: result.transferSuggested,
  });
  if (error) console.error("Agent IA : réponse envoyée mais non enregistrée :", error.message);
  return sent.ok ? { status: "sent" } : { status: "failed", reason: "meta-refused" };
}
