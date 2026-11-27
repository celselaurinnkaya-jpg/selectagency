import "server-only";
import { decryptToken } from "./token-crypto";

// Lecture des événements Meta propres à la connexion par QR code (application WhatsApp Business + API) :
// - « history » : l'historique du téléphone (180 jours), envoyé par morceaux après le scan ;
// - « smb_message_echoes » : les messages que l'agence envoie depuis son téléphone ;
// - « smb_app_state_sync » : les contacts du téléphone (noms).
// Format décrit par Meta : developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users

interface MetaContent {
  type?: string;
  text?: { body?: string };
  image?: { caption?: string };
  video?: { caption?: string };
  document?: { filename?: string; caption?: string };
}

export interface CoexistenceMessage {
  contactWaId: string;
  direction: "inbound" | "outbound";
  metaMessageId: string;
  kind: "text" | "image" | "document" | "audio";
  text: string;
  timestamp: string;
}

/** Contenu affichable d'un message : texte, ou libellé pour une photo, un document, un message vocal ou une vidéo. */
export function messageContent(m: MetaContent): { kind: CoexistenceMessage["kind"]; text: string } | null {
  switch (m.type) {
    case "text":
      return m.text?.body ? { kind: "text", text: m.text.body } : null;
    case "image":
      return { kind: "image", text: m.image?.caption ? `📷 ${m.image.caption}` : "📷 Photo" };
    case "video":
      return { kind: "document", text: m.video?.caption ? `🎬 ${m.video.caption}` : "🎬 Vidéo" };
    case "document":
      return { kind: "document", text: `📄 ${m.document?.filename ?? m.document?.caption ?? "Document"}` };
    case "audio":
    case "voice":
      return { kind: "audio", text: "🎤 Message vocal" };
    case "sticker":
      return { kind: "image", text: "Autocollant" };
    default:
      return null;
  }
}

const iso = (unixSeconds?: string) => {
  const n = Number(unixSeconds);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : new Date().toISOString();
};

type HistoryValue = {
  history?: {
    threads?: { id?: string; context?: { wa_id?: string }; messages?: (MetaContent & { from?: string; id?: string; timestamp?: string })[] }[];
  }[];
};

/** Messages de l'historique : un message dont l'expéditeur est le contact est « reçu », sinon « envoyé ». */
export function historyMessages(value: HistoryValue): CoexistenceMessage[] {
  const out: CoexistenceMessage[] = [];
  for (const chunk of value.history ?? []) {
    for (const thread of chunk.threads ?? []) {
      const contact = thread.context?.wa_id ?? thread.id;
      if (!contact) continue;
      for (const m of thread.messages ?? []) {
        const content = messageContent(m);
        if (!content || !m.id) continue;
        out.push({ contactWaId: contact, direction: m.from === contact ? "inbound" : "outbound", metaMessageId: m.id, ...content, timestamp: iso(m.timestamp) });
      }
    }
  }
  return out;
}

type EchoValue = { message_echoes?: (MetaContent & { to?: string; id?: string; timestamp?: string })[] };

/** Messages envoyés par l'agence depuis l'application WhatsApp Business de son téléphone. */
export function echoMessages(value: EchoValue): CoexistenceMessage[] {
  const out: CoexistenceMessage[] = [];
  for (const m of value.message_echoes ?? []) {
    const content = messageContent(m);
    if (!content || !m.id || !m.to) continue;
    out.push({ contactWaId: m.to, direction: "outbound", metaMessageId: m.id, ...content, timestamp: iso(m.timestamp) });
  }
  return out;
}

type StateValue = { state_sync?: { type?: string; action?: string; contact?: { full_name?: string; first_name?: string; phone_number?: string } }[] };

/** Contacts ajoutés sur le téléphone : numéro (chiffres seulement, comme les identifiants WhatsApp) et nom. */
export function syncedContacts(value: StateValue): { waId: string; name: string }[] {
  const out: { waId: string; name: string }[] = [];
  for (const item of value.state_sync ?? []) {
    if (item.type !== "contact" || item.action === "remove") continue;
    const waId = (item.contact?.phone_number ?? "").replace(/\D/g, "");
    const name = (item.contact?.full_name || item.contact?.first_name || "").trim();
    if (waId && name) out.push({ waId, name });
  }
  return out;
}

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;

/**
 * Clé d'accès propre au numéro, enregistrée chiffrée à sa connexion (QR de Meta, ou identifiants vérifiés auprès de
 * Meta). Il n'y a AUCUNE clé de secours : un numéro sans sa propre autorisation n'envoie rien (undefined).
 */
export async function accountAccessToken(rpc: Rpc, serverSecret: string, phoneNumberId: string): Promise<string | undefined> {
  const { data } = await rpc("wa_account_token", { p_secret: serverSecret, p_phone_number_id: phoneNumberId });
  const token = typeof data === "string" ? decryptToken(data, serverSecret) : null;
  return token ?? undefined;
}
