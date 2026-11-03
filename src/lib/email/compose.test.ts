import { describe, expect, it } from "vitest";
import type { EmailOutboxItem } from "@/lib/domain/types";
import { composeBrevoEmail } from "./compose";

const base: EmailOutboxItem = {
  id: "7a1d3c5e-0000-4000-8000-000000000042",
  organizationId: "org",
  clientId: "client",
  paymentId: "pay",
  kind: "payment_confirmed",
  idempotencyKey: "payment_confirmed:pay",
  recipientEmail: "ines@client.test",
  recipientName: "Inès Tchoumi",
  senderName: "Agence K",
  replyToEmail: "contact@agence-k.test",
  subject: "Confirmation de paiement — Reçu REC-2026-00012 (Agence K)",
  payload: { agency_name: "Agence K", client_first_name: "Inès", receipt_number: "REC-2026-00012", amount_minor: 150000, currency: "XAF" },
  status: "sending",
  attempts: 1,
  maxAttempts: 3,
  nextAttemptAt: "2026-11-02T10:00:00Z",
  createdAt: "2026-11-02T10:00:00Z",
  isAutomatic: true,
};

describe("préparation des e-mails Brevo (src/lib/email/compose.ts)", () => {
  it("e-mail d'agence : au nom de l'agence, réponses vers l'agence, reçu joint, étiquette unique de la ligne de la file", () => {
    const attachments = [{ name: "REC-2026-00012.pdf", contentBase64: "JVBERi0xLjc=" }];
    const input = composeBrevoEmail(base, attachments);
    expect(input).toMatchObject({
      toEmail: "ines@client.test",
      toName: "Inès Tchoumi",
      senderName: "Agence K",
      replyToEmail: "contact@agence-k.test",
      subject: "Confirmation de paiement — Reçu REC-2026-00012 (Agence K)",
      attachments,
      // Étiquette unique en premier : elle sert à vérifier chez Brevo avant toute nouvelle tentative.
      tags: [`outbox-${base.id}`, "payment_confirmed"],
    });
    expect(input.htmlContent).toContain("REC-2026-00012");
    expect(input.textContent).toContain("REC-2026-00012");
  });

  it("e-mail de bienvenue : au nom de SELECT Agency, sans adresse de réponse d'agence, avec le chemin vers le support", () => {
    const input = composeBrevoEmail(
      {
        ...base,
        kind: "agency_welcome",
        clientId: undefined,
        paymentId: undefined,
        recipientEmail: "karl@agence-k.test",
        recipientName: "Karl Biya",
        replyToEmail: "karl@agence-k.test",
        subject: "Bienvenue sur SELECT Agency — Votre espace Agence K est prêt",
        payload: { owner_name: "Karl Biya", agency_name: "Agence K" },
      },
      [],
    );
    expect(input.senderName).toBeUndefined();
    expect(input.replyToEmail).toBeUndefined();
    expect(input.subject).toBe("Bienvenue sur SELECT Agency — Votre espace Agence K est prêt");
    expect(input.htmlContent).toContain("Aide et support");
    expect(input.textContent).toContain("Aide et support");
  });
});
