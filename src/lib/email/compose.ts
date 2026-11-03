import type { EmailOutboxItem, EmailOutboxKind } from "@/lib/domain/types";
import type { BrevoAttachment, SendBrevoEmailInput } from "./brevo";
import { renderTransactionalEmail } from "./templates";

/**
 * E-mails envoyés au nom de SELECT Agency (et non d'une agence) : l'expéditeur affiché est « SELECT Agency »,
 * sans adresse de réponse d'agence. Les questions passent par « Aide et support » dans l'espace agence.
 */
export const PLATFORM_EMAIL_KINDS: ReadonlySet<EmailOutboxKind> = new Set<EmailOutboxKind>(["agency_welcome", "subscription_notice"]);

/** Étiquette Brevo unique d'une ligne de la file d'envoi : permet de retrouver l'e-mail chez Brevo. */
export function outboxTag(outboxId: string): string {
  return `outbox-${outboxId}`;
}

/** Prépare la demande d'envoi Brevo d'une ligne de la file d'envoi. */
export function composeBrevoEmail(item: EmailOutboxItem, attachments: BrevoAttachment[]): SendBrevoEmailInput {
  const rendered = renderTransactionalEmail(item.kind, item.subject, item.payload);
  const fromPlatform = PLATFORM_EMAIL_KINDS.has(item.kind);
  return {
    toEmail: item.recipientEmail,
    toName: item.recipientName,
    senderName: fromPlatform ? undefined : item.senderName,
    // Le domaine d'envoi n'a pas de boîte de réception : pour un e-mail d'agence, les réponses vont à l'agence.
    replyToEmail: fromPlatform ? undefined : item.replyToEmail,
    subject: rendered.subject,
    htmlContent: rendered.htmlContent,
    textContent: rendered.textContent,
    attachments,
    // Étiquette unique en premier : elle permet de retrouver l'e-mail chez Brevo avant toute nouvelle tentative.
    tags: [outboxTag(item.id), item.kind],
  };
}
