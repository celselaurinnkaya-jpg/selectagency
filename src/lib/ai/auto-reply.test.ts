import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { autoReply, delaySeconds, toChatMessages, type AutoReplyDeps, type ReplyContext } from "./auto-reply";
import { AiUnavailableError, type AiRunExecutionResult } from "./runner";

const READY: ReplyContext = {
  reply: true,
  agency_name: "Agence Horizon",
  phone_number_id: "phone_1",
  to: "237670001122",
  agent: {
    id: "agent-1",
    name: "Assistant",
    role: "Service client",
    tone: "chaleureux",
    personality: null,
    system_instructions: "Consignes",
    services_scope: null,
    restricted_topics: null,
    transfer_conditions: null,
    model_tier: "haiku",
    response_delay_seconds: 15,
  },
  messages: [
    { direction: "inbound", body: "Bonjour" },
    { direction: "inbound", body: "Quelles pièces pour un visa étudiant ?" },
  ],
  knowledge: [{ source_title: "Brochure", content: "Passeport, photos, attestation d'admission." }],
};

const RESULT: AiRunExecutionResult = {
  replyText: "Il faut un passeport, des photos et l'attestation d'admission.",
  model: "claude-haiku-5-5",
  tokensPrompt: 900,
  tokensCompletion: 60,
  durationMs: 800,
  estimatedCostFcfa: 0.07,
  estimatedCostUsd: 0.00012,
  transferSuggested: false,
};

function deps(contexts: ReplyContext[], overrides: Partial<AutoReplyDeps> = {}) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const queue = [...contexts];
  const d: AutoReplyDeps = {
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      if (fn === "ai_reply_context") return { data: queue.shift() ?? { reply: false, reason: "none" }, error: null };
      return { data: "message-1", error: null };
    },
    secret: "secret-serveur-0123456789abcdef-0123456789",
    accessToken: "jeton-meta",
    sleep: vi.fn(async () => undefined),
    run: vi.fn(async () => RESULT),
    send: vi.fn(async () => ({ ok: true, metaMessageId: "wamid.reponse" })),
    ...overrides,
  };
  return { d, calls };
}

describe("toChatMessages", () => {
  it("regroupe les messages successifs d'une même personne, commence et finit par le client", () => {
    expect(
      toChatMessages([
        { direction: "outbound", body: "Message de bienvenue" },
        { direction: "inbound", body: "Bonjour" },
        { direction: "inbound", body: "Vous êtes ouverts ?" },
        { direction: "outbound", body: "Oui" },
        { direction: "inbound", body: "Merci" },
        { direction: "outbound", body: "Réponse en attente" },
      ]),
    ).toEqual([
      { role: "user", content: "Bonjour\nVous êtes ouverts ?" },
      { role: "assistant", content: "Oui" },
      { role: "user", content: "Merci" },
    ]);
  });
});

describe("delaySeconds", () => {
  it("garde le délai choisi, dans la limite de 45 secondes", () => {
    expect(delaySeconds(15)).toBe(15);
    expect(delaySeconds(120)).toBe(45);
    expect(delaySeconds(-3)).toBe(0);
    expect(delaySeconds("n'importe quoi")).toBe(15);
  });
});

describe("autoReply", () => {
  it("attend le délai, vérifie de nouveau, répond par Meta et enregistre la réponse avec l'identifiant de Meta", async () => {
    const { d, calls } = deps([READY, READY]);
    expect(await autoReply(d, "conv-1", "wamid.client")).toEqual({ status: "sent" });
    expect(d.sleep).toHaveBeenCalledWith(15_000);
    expect(calls.filter((c) => c.fn === "ai_reply_context")).toHaveLength(2);
    expect(d.send).toHaveBeenCalledWith({ phoneNumberId: "phone_1", to: "237670001122", text: RESULT.replyText, accessToken: "jeton-meta" });
    const record = calls.find((c) => c.fn === "record_ai_reply")!;
    expect(record.args).toMatchObject({ p_conversation_id: "conv-1", p_meta_message_id: "wamid.reponse", p_model: "claude-haiku-5-5", p_transfer: false });
    // Les connaissances de l'agence sont transmises à l'IA.
    expect(vi.mocked(d.run).mock.calls[0]![3]).toContain("Passeport, photos");
  });

  it("se tait si un conseiller a repris la main pendant le délai", async () => {
    const { d, calls } = deps([READY, { reply: false, reason: "mode" }]);
    expect(await autoReply(d, "conv-1", "wamid.client")).toEqual({ status: "skipped", reason: "mode" });
    expect(d.run).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
    expect(calls.some((c) => c.fn === "record_ai_reply")).toBe(false);
  });

  it("n'attend pas et ne répond pas quand la base refuse dès le départ (quota, mode, abonnement)", async () => {
    const { d } = deps([{ reply: false, reason: "quota" }]);
    expect(await autoReply(d, "conv-1", "wamid.client")).toEqual({ status: "skipped", reason: "quota" });
    expect(d.sleep).not.toHaveBeenCalled();
  });

  it("enregistre un échec (sans identifiant Meta) quand Meta refuse le message", async () => {
    const { d, calls } = deps([READY, READY], { send: vi.fn(async () => ({ ok: false, error: "refusé" })) });
    expect(await autoReply(d, "conv-1", "wamid.client")).toEqual({ status: "failed", reason: "meta-refused" });
    expect(calls.find((c) => c.fn === "record_ai_reply")!.args.p_meta_message_id).toBeNull();
  });

  it("ne fait rien sans jeton WhatsApp, et se tait si l'IA n'est pas disponible", async () => {
    const noToken = deps([READY, READY], { accessToken: undefined });
    expect(await autoReply(noToken.d, "conv-1", "wamid.client")).toEqual({ status: "skipped", reason: "whatsapp-token" });

    const noAi = deps([READY, READY], {
      run: vi.fn(async () => {
        throw new AiUnavailableError("clé absente");
      }),
    });
    expect(await autoReply(noAi.d, "conv-1", "wamid.client")).toEqual({ status: "skipped", reason: "ai-unavailable" });
    expect(noAi.d.send).not.toHaveBeenCalled();
  });
});
