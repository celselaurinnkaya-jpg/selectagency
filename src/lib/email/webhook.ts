// Lecture des appels du webhook Brevo (suivi de livraison des e-mails transactionnels).
// - Le secret arrive uniquement dans un en-tête : « Authorization: Bearer <secret> » (authentification par
//   jeton de Brevo) ou « x-webhook-secret: <secret> » (en-tête personnalisé). Jamais dans l'adresse : une
//   adresse se retrouve dans les journaux.
// - La base compare le secret à son empreinte SHA-256 (clé « brevo_webhook ») : le serveur ne le connaît pas.

const OUTBOX_TAG = /^outbox-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
/** Nombre maximal d'événements traités par appel (Brevo peut les envoyer par lots). */
export const MAX_WEBHOOK_EVENTS = 100;

export interface BrevoWebhookEvent {
  event: string;
  messageId: string | null;
  /** Ligne de la file d'envoi, retrouvée grâce à l'étiquette unique « outbox-<id> ». */
  outboxId: string | null;
  reason: string | null;
}

/** Secret envoyé par Brevo dans un en-tête ; null s'il est absent ou trop court. */
export function webhookSecretFrom(headers: Headers): string | null {
  const bearer = headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const secret = bearer || headers.get("x-webhook-secret")?.trim() || "";
  return secret.length >= 32 ? secret : null;
}

/** Le secret a-t-il été mis dans l'adresse ? (refusé : il doit passer par un en-tête) */
export function secretInUrl(url: URL): boolean {
  return ["secret", "token", "key"].some((name) => url.searchParams.has(name));
}

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function outboxIdFrom(raw: Record<string, unknown>): string | null {
  const tags = [...(Array.isArray(raw.tags) ? raw.tags : []), raw.tag, raw["X-Mailin-Tag"]];
  for (const tag of tags) {
    const match = typeof tag === "string" ? tag.trim().match(OUTBOX_TAG) : null;
    if (match) return match[1]!.toLowerCase();
  }
  return null;
}

/** Événements utilisables d'un appel (un objet ou un lot) ; les entrées incomplètes sont ignorées. */
export function parseBrevoEvents(body: unknown): BrevoWebhookEvent[] {
  const items = Array.isArray(body) ? body : [body];
  return items
    .slice(0, MAX_WEBHOOK_EVENTS)
    .map((item): BrevoWebhookEvent | null => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Record<string, unknown>;
      const event = text(raw.event, 40)?.toLowerCase() ?? null;
      const messageId = text(raw["message-id"], 160) ?? text(raw.messageId, 160);
      const outboxId = outboxIdFrom(raw);
      if (!event || (!messageId && !outboxId)) return null;
      return { event, messageId, outboxId, reason: text(raw.reason, 500) };
    })
    .filter((e): e is BrevoWebhookEvent => e !== null);
}
