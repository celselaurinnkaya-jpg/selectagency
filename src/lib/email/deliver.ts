import "server-only";
import type { EmailOutboxItem } from "@/lib/domain/types";
import { findAcceptedEmailByTag, sendBrevoEmail, type BrevoAttachment, type SendBrevoEmailResult } from "./brevo";
import { composeBrevoEmail, outboxTag } from "./compose";

/**
 * Confie un e-mail de la file à Brevo une seule fois. Lors d'une nouvelle tentative (coupure, délai dépassé…),
 * on demande d'abord à Brevo s'il avait déjà accepté l'e-mail : si oui, il est noté envoyé SANS être renvoyé.
 * `loadAttachments` renvoie null quand le PDF promis n'a pas pu être préparé : l'e-mail sera retenté plus tard.
 */
export async function deliverOutboxItem(
  item: EmailOutboxItem,
  loadAttachments: () => Promise<BrevoAttachment[] | null>,
): Promise<SendBrevoEmailResult> {
  if (item.attempts > 1) {
    const prior = await findAcceptedEmailByTag(outboxTag(item.id));
    if (!prior.ok) return { ok: false, error: "Vérification auprès de Brevo impossible ; nouvel essai plus tard.", retryable: true };
    if (prior.found) return { ok: true, messageId: prior.messageId, duplicate: true, sandbox: false };
  }
  const attachments = await loadAttachments();
  if (attachments === null) return { ok: false, error: "Le document PDF à joindre n'a pas pu être préparé.", retryable: true };
  return sendBrevoEmail(composeBrevoEmail(item, attachments));
}
