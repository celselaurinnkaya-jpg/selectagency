import "server-only";

// Module serveur d'envoi d'e-mails via l'API transactionnelle Brevo (v3).
// - La clé API est lue exclusivement côté serveur (process.env.BREVO_API_KEY) ; elle n'apparaît jamais
//   dans les erreurs, les journaux ni les réponses.
// - Chaque appel est borné à 10 secondes.
// - Brevo NE bloque PAS les doublons (vérifié en envoi réel le 2 novembre 2026 : même IdempotencyKey, deux e-mails
//   livrés). Chaque e-mail porte donc une étiquette unique (outbox-<id>) et, avant toute nouvelle tentative,
//   l'application demande à Brevo s'il l'a déjà accepté (findAcceptedEmailByTag).
// - Mode bac à sable : X-Sib-Sandbox: drop, placé DANS le corps JSON (objet « headers »), comme l'exige Brevo.
//   Brevo vérifie alors tout et renvoie un identifiant, mais n'envoie rien à personne.
// - « ok » signifie seulement « accepté par Brevo », jamais « livré » : la livraison vient du webhook.

const BREVO_SMTP_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const BREVO_EVENTS_ENDPOINT = "https://api.brevo.com/v3/smtp/statistics/events";
const DEFAULT_TIMEOUT_MS = 10_000;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface BrevoAttachment {
  /** Nom du fichier tel qu'il apparaît dans la boîte du destinataire (ex. « REC-2026-00001.pdf »). */
  name: string;
  /** Contenu binaire encodé en Base64. */
  contentBase64: string;
}

export interface SendBrevoEmailInput {
  toEmail: string;
  toName?: string;
  /** Nom de l'agence : l'expéditeur affiché devient « <agence> via SELECT Agency ». */
  senderName?: string;
  replyToEmail?: string;
  replyToName?: string;
  subject: string;
  htmlContent: string;
  textContent: string;
  attachments?: BrevoAttachment[];
  /** Étiquettes Brevo ; la première unique (outbox-<id>) permet de retrouver l'e-mail avant de le renvoyer. */
  tags?: string[];
  /** Bac à sable : Brevo vérifie tout mais n'envoie rien. Aussi activé par BREVO_SANDBOX=true. */
  sandbox?: boolean;
  timeoutMs?: number;
}

export type SendBrevoEmailResult =
  | {
      ok: true;
      /** Identifiant Brevo du message ; null si Brevo n'en renvoie pas. */
      messageId: string | null;
      /** Vrai quand l'e-mail avait déjà été accepté par Brevo lors d'une tentative précédente (pas de renvoi). */
      duplicate: boolean;
      sandbox: boolean;
    }
  | { ok: false; error: string; statusCode?: number; retryable: boolean };

/** Masque toute trace potentielle d'une clé Brevo (`xkeysib-...` ou `xsmtpsib-...`) dans un message. */
export function sanitizeBrevoError(raw: unknown): string {
  const text = raw instanceof Error ? raw.message : String(raw ?? "Erreur d'envoi Brevo");
  return text
    .replace(/xkeysib-[A-Za-z0-9_-]+/gi, "[CLE_MASQUEE]")
    .replace(/xsmtpsib-[A-Za-z0-9_-]+/gi, "[CLE_MASQUEE]")
    .slice(0, 400);
}

/**
 * Une erreur mérite-t-elle une nouvelle tentative ?
 * - Oui : surcharge (429), panne Brevo (5xx), clé refusée ou crédits épuisés (401, 402, 403) : ces problèmes
 *   se corrigent sans que l'e-mail soit en cause.
 * - Non : demande refusée pour l'e-mail lui-même (400 adresse ou contenu invalide, 404…).
 */
export function isRetryableBrevoStatus(status: number): boolean {
  return status === 429 || status >= 500 || status === 401 || status === 402 || status === 403;
}

/** Indique si l'envoi d'e-mails Brevo est configuré sur le serveur. */
export function isBrevoConfigured(): boolean {
  return (process.env.BREVO_API_KEY?.trim() ?? "").length >= 20;
}

/** Adresse d'expéditeur authentifiée dans Brevo (notifications@myselectagency.com). */
export function defaultSenderEmail(): string | null {
  const fromEnv = process.env.BREVO_SENDER_EMAIL?.trim().toLowerCase();
  return fromEnv && EMAIL_PATTERN.test(fromEnv) ? fromEnv : null;
}

/** L'envoi direct d'e-mails est-il possible sur ce serveur (clé et expéditeur configurés) ? */
export function emailSendingEnabled(): boolean {
  return isBrevoConfigured() && Boolean(defaultSenderEmail());
}

/** Mode bac à sable forcé pour tout le serveur (tests). */
export function sandboxForced(): boolean {
  return process.env.BREVO_SANDBOX === "true";
}

/**
 * Envoie un e-mail transactionnel unique via Brevo.
 * Ne lève jamais d'exception : renvoie toujours un résultat.
 */
export async function sendBrevoEmail(
  input: SendBrevoEmailInput,
  fetchImpl: typeof fetch = fetch,
): Promise<SendBrevoEmailResult> {
  const apiKey = process.env.BREVO_API_KEY?.trim() ?? "";
  if (apiKey.length < 20) {
    return { ok: false, error: "Envoi d'e-mails non configuré sur le serveur (clé Brevo absente).", retryable: true };
  }

  const senderEmail = defaultSenderEmail();
  if (!senderEmail) {
    return { ok: false, error: "Envoi d'e-mails non configuré sur le serveur (adresse d'expéditeur absente).", retryable: true };
  }

  const toEmail = input.toEmail.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(toEmail)) {
    return { ok: false, error: "Adresse e-mail du destinataire invalide.", retryable: false };
  }

  const agencyName = input.senderName?.trim();
  const body: Record<string, unknown> = {
    sender: { name: (agencyName ? `${agencyName} via SELECT Agency` : "SELECT Agency").slice(0, 120), email: senderEmail },
    to: [{ email: toEmail, ...(input.toName?.trim() ? { name: input.toName.trim().slice(0, 120) } : {}) }],
    subject: input.subject.trim().slice(0, 200),
    htmlContent: input.htmlContent,
    textContent: input.textContent,
  };

  // Le domaine d'envoi n'a pas de boîte de réception : les réponses doivent aller à l'agence.
  const replyTo = input.replyToEmail?.trim().toLowerCase();
  if (replyTo && EMAIL_PATTERN.test(replyTo)) {
    const replyName = input.replyToName?.trim() || agencyName;
    body.replyTo = { email: replyTo, ...(replyName ? { name: replyName.slice(0, 120) } : {}) };
  }

  if (input.attachments?.length) {
    body.attachment = input.attachments.map((att) => ({ name: att.name, content: att.contentBase64 }));
  }
  if (input.tags?.length) {
    body.tags = input.tags.slice(0, 10);
  }

  const sandbox = Boolean(input.sandbox) || sandboxForced();
  if (sandbox) body.headers = { "X-Sib-Sandbox": "drop" };

  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const response = await fetchImpl(BREVO_SMTP_ENDPOINT, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", "api-key": apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      messageId?: string;
      messageIds?: string[];
      message?: string;
      code?: string;
    };

    if (!response.ok) {
      const detail = payload.message || payload.code || `HTTP ${response.status}`;
      return {
        ok: false,
        statusCode: response.status,
        error: sanitizeBrevoError(`Brevo (${response.status}) : ${detail}`),
        retryable: isRetryableBrevoStatus(response.status),
      };
    }

    // Jamais d'identifiant inventé : sans identifiant, l'e-mail est accepté mais sa livraison ne pourra pas être suivie.
    const messageId = payload.messageId?.trim() || payload.messageIds?.[0]?.trim() || null;
    return { ok: true, messageId, duplicate: false, sandbox };
  } catch (err) {
    const isTimeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return {
      ok: false,
      error: isTimeout
        ? `Délai d'attente dépassé (${Math.round(timeoutMs / 1000)} s) lors de la connexion à Brevo.`
        : sanitizeBrevoError(err),
      retryable: true,
    };
  }
}

export type BrevoLookupResult = { ok: true; found: boolean; messageId: string | null } | { ok: false; error: string };

/**
 * Brevo a-t-il déjà accepté un e-mail portant cette étiquette (7 derniers jours) ? Lecture seule, aucun envoi.
 * Sert avant chaque nouvelle tentative : une coupure après l'acceptation ne doit jamais produire un doublon.
 */
export async function findAcceptedEmailByTag(tag: string, fetchImpl: typeof fetch = fetch): Promise<BrevoLookupResult> {
  const apiKey = process.env.BREVO_API_KEY?.trim() ?? "";
  if (apiKey.length < 20) return { ok: false, error: "Envoi d'e-mails non configuré sur le serveur (clé Brevo absente)." };
  const query = new URLSearchParams({ tags: tag, event: "requests", days: "7", limit: "1", sort: "desc" });
  try {
    const response = await fetchImpl(`${BREVO_EVENTS_ENDPOINT}?${query}`, {
      headers: { accept: "application/json", "api-key": apiKey },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    const payload = (await response.json().catch(() => ({}))) as { events?: { messageId?: string }[]; message?: string };
    if (!response.ok) {
      return { ok: false, error: sanitizeBrevoError(`Brevo (${response.status}) : ${payload.message ?? "vérification impossible"}`) };
    }
    const event = payload.events?.[0];
    return { ok: true, found: Boolean(event), messageId: event?.messageId?.trim() || null };
  } catch (err) {
    return { ok: false, error: sanitizeBrevoError(err) };
  }
}
