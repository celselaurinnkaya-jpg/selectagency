import { after, NextResponse } from "next/server";
import { autoReply } from "@/lib/ai/auto-reply";
import { runAgentConversation } from "@/lib/ai/runner";
import { cronSecret } from "@/lib/email/system-worker";
import { createSystemClient } from "@/lib/supabase/system";
import { sendWhatsAppMessage, verifyMetaWebhookSignature } from "@/lib/whatsapp/client";
import { accountAccessToken, echoMessages, historyMessages, syncedContacts, type CoexistenceMessage } from "@/lib/whatsapp/coexistence";

/** La réponse automatique attend le délai de l'agent (45 s au plus) après la réponse à Meta. */
export const maxDuration = 60;

// Webhook WhatsApp (API officielle de Meta) : messages entrants et accusés (envoyé, livré, lu, échoué).
// - Rien n'est accepté sans configuration complète : jeton de vérification, secret de l'application Meta
//   (signature X-Hub-Signature-256 vérifiée sur le corps brut) et secret serveur de SELECT (CRON_SECRET).
// - La base est appelée avec ce secret serveur, vérifié par son empreinte (comme Stripe et les e-mails).
// - Une erreur de la base renvoie 500 : Meta renverra l'événement plus tard, et un message déjà reçu n'est
//   enregistré qu'une fois.
// - La réponse ne contient ni numéro, ni texte, ni secret.
// - Un nouveau message en mode IA déclenche, après la réponse à Meta, la réponse automatique de l'agent
//   (src/lib/ai/auto-reply.ts) avec le délai choisi dans le Studio.

/** Vérification de l'adresse du webhook par Meta lors de son enregistrement. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
  if (!expectedToken) return new Response("Webhook WhatsApp non configuré.", { status: 503 });
  if (searchParams.get("hub.mode") === "subscribe" && searchParams.get("hub.verify_token") === expectedToken) {
    return new Response(searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Vérification refusée.", { status: 403 });
}

interface MetaStatusEntry {
  id: string;
  status: string;
  timestamp?: string;
}

interface MetaMessageEntry {
  id: string;
  from: string;
  type: string;
  text?: { body: string };
  timestamp?: string;
}

interface MetaChangeValue {
  messaging_product?: string;
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  contacts?: { profile?: { name?: string }; wa_id?: string }[];
  statuses?: MetaStatusEntry[];
  messages?: MetaMessageEntry[];
  // Connexion par QR code (application WhatsApp Business) : historique, messages envoyés du téléphone, contacts.
  history?: Parameters<typeof historyMessages>[0]["history"];
  message_echoes?: Parameters<typeof echoMessages>[0]["message_echoes"];
  state_sync?: Parameters<typeof syncedContacts>[0]["state_sync"];
}

interface MetaWebhookPayload {
  object?: string;
  entry?: { id?: string; changes?: { value?: MetaChangeValue; field?: string }[] }[];
}

const toIso = (unixSeconds?: string) => (unixSeconds ? new Date(parseInt(unixSeconds, 10) * 1000).toISOString() : new Date().toISOString());

/** Événements en temps réel envoyés par Meta. */
export async function POST(request: Request) {
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
  const serverSecret = cronSecret();
  if (!appSecret || !serverSecret) {
    return NextResponse.json({ ok: false, error: "Webhook WhatsApp non configuré." }, { status: 503 });
  }

  const rawBody = await request.text();
  if (!verifyMetaWebhookSignature(rawBody, request.headers.get("x-hub-signature-256"), appSecret)) {
    return NextResponse.json({ ok: false, error: "Signature invalide." }, { status: 401 });
  }

  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as MetaWebhookPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide." }, { status: 400 });
  }

  const db = createSystemClient();
  let failed = false;
  const toAnswer: { conversationId: string; triggerMetaId: string; phoneNumberId: string }[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;
      const phoneNumberId = value.metadata?.phone_number_id;

      for (const s of value.statuses ?? []) {
        const { error } = await db.rpc("update_wa_message_status", {
          p_secret: serverSecret,
          p_meta_message_id: s.id,
          p_status: s.status,
          p_timestamp: toIso(s.timestamp),
        });
        if (error) failed = true;
      }

      const profileName = value.contacts?.[0]?.profile?.name ?? "";
      for (const msg of value.messages ?? []) {
        const text = msg.text?.body;
        if (!text || !phoneNumberId) continue; // les autres types (images, audio…) viendront plus tard
        const { data, error } = await db.rpc("record_inbound_wa_message", {
          p_secret: serverSecret,
          p_phone_number_id: phoneNumberId,
          p_sender_wa_id: msg.from,
          p_sender_name: profileName,
          p_meta_message_id: msg.id,
          p_message_text: text,
          p_timestamp: toIso(msg.timestamp),
        });
        if (error) {
          failed = true;
          continue;
        }
        const recorded = data as { ok?: boolean; duplicate?: boolean; conversation_id?: string; mode?: string } | null;
        if (recorded?.ok && !recorded.duplicate && recorded.conversation_id && recorded.mode === "ai") {
          toAnswer.push({ conversationId: recorded.conversation_id, triggerMetaId: msg.id, phoneNumberId });
        }
      }

      if (!phoneNumberId) continue;

      // Historique du téléphone et messages envoyés depuis le téléphone : enregistrés dans la boîte WhatsApp Web,
      // sans non-lus ni réponse de l'IA. Un message envoyé du téléphone fait passer la conversation en mode « Conseiller ».
      const fromPhone: [CoexistenceMessage, boolean][] = [
        ...historyMessages(value).map((m): [CoexistenceMessage, boolean] => [m, false]),
        ...echoMessages(value).map((m): [CoexistenceMessage, boolean] => [m, true]),
      ];
      // Par paquets de 10 en parallèle : l'historique peut compter des milliers de messages.
      for (let i = 0; i < fromPhone.length; i += 10) {
        const results = await Promise.all(
          fromPhone.slice(i, i + 10).map(([m, isEcho]) =>
            db.rpc("record_wa_history_message", {
              p_secret: serverSecret,
              p_phone_number_id: phoneNumberId,
              p_contact_wa_id: m.contactWaId,
              p_contact_name: null,
              p_direction: m.direction,
              p_meta_message_id: m.metaMessageId,
              p_kind: m.kind,
              p_text: m.text,
              p_timestamp: m.timestamp,
              p_from_phone_app: isEcho,
            }),
          ),
        );
        if (results.some((r) => r.error)) failed = true;
      }

      for (const c of syncedContacts(value)) {
        const { error } = await db.rpc("record_wa_contact", {
          p_secret: serverSecret,
          p_phone_number_id: phoneNumberId,
          p_contact_wa_id: c.waId,
          p_name: c.name,
        });
        if (error) failed = true;
      }
    }
  }

  if (toAnswer.length) {
    after(async () => {
      const rpc = (fn: string, args: Record<string, unknown>) => db.rpc(fn, args);
      const base = {
        rpc,
        secret: serverSecret,
        sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
        run: runAgentConversation,
        send: sendWhatsAppMessage,
      };
      await Promise.all(
        toAnswer.map(async (item) =>
          // Uniquement la clé propre au numéro : sans elle, l'IA ne répond pas (aucune clé de secours).
          autoReply({ ...base, accessToken: await accountAccessToken(rpc, serverSecret, item.phoneNumberId) }, item.conversationId, item.triggerMetaId).catch((err: unknown) =>
            console.error("Agent IA : réponse automatique impossible :", err instanceof Error ? err.message : err),
          ),
        ),
      );
    });
  }

  if (failed) {
    console.error("Webhook WhatsApp : un événement n'a pas pu être enregistré, Meta le renverra.");
    return NextResponse.json({ ok: false, error: "Enregistrement impossible pour le moment." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
