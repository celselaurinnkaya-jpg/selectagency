import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Client pour la Cloud API WhatsApp officielle de Meta.
 * Gère la validation des signatures webhooks et l'envoi de messages texte.
 */

export interface SendMessageOptions {
  phoneNumberId: string;
  to: string;
  text: string;
  accessToken: string;
}

export interface SendMessageResult {
  ok: boolean;
  metaMessageId?: string;
  error?: string;
}

/**
 * Vérifie la signature cryptographique envoyée par Meta dans le header X-Hub-Signature-256.
 */
export function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): boolean {
  if (!signatureHeader || !appSecret) return false;

  const parts = signatureHeader.split("=");
  if (parts.length !== 2 || parts[0] !== "sha256") return false;

  const expectedSig = parts[1];
  const hmac = createHmac("sha256", appSecret);
  hmac.update(rawBody, "utf8");
  const computedSig = hmac.digest("hex");

  try {
    return timingSafeEqual(Buffer.from(expectedSig, "hex"), Buffer.from(computedSig, "hex"));
  } catch {
    return false;
  }
}

/**
 * Envoie un message texte simple via la Cloud API de Meta.
 */
export async function sendWhatsAppMessage({
  phoneNumberId,
  to,
  text,
  accessToken,
}: SendMessageOptions): Promise<SendMessageResult> {
  const cleanTo = to.replace(/[^0-9]/g, "");

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: cleanTo,
        type: "text",
        text: { body: text },
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        error: data.error?.message || `Erreur Meta HTTP ${res.status}`,
      };
    }

    const metaMessageId = data.messages?.[0]?.id;
    return { ok: true, metaMessageId };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erreur réseau inconnue",
    };
  }
}

/**
 * Marque un message WhatsApp reçu comme lu auprès des serveurs de Meta.
 */
export async function markWhatsAppMessageAsRead(
  phoneNumberId: string,
  messageId: string,
  accessToken: string
): Promise<boolean> {
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

