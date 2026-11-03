import { describe, expect, it } from "vitest";
import { MAX_WEBHOOK_EVENTS, parseBrevoEvents, secretInUrl, webhookSecretFrom } from "./webhook";

const SECRET = "webhook-secret-0123456789abcdef-0123";
const OUTBOX = "3f2b8c1e-9d4a-4b6e-8f10-2a3b4c5d6e7f";

describe("webhook Brevo (src/lib/email/webhook.ts)", () => {
  it("lit le secret dans un en-tête seulement : jeton Bearer ou x-webhook-secret, 32 caractères au moins", () => {
    expect(webhookSecretFrom(new Headers({ authorization: `Bearer ${SECRET}` }))).toBe(SECRET);
    expect(webhookSecretFrom(new Headers({ authorization: `bearer  ${SECRET} ` }))).toBe(SECRET);
    expect(webhookSecretFrom(new Headers({ "x-webhook-secret": ` ${SECRET}` }))).toBe(SECRET);
    expect(webhookSecretFrom(new Headers({ authorization: "Bearer court" }))).toBeNull();
    expect(webhookSecretFrom(new Headers({ authorization: `Basic ${SECRET}` }))).toBeNull();
    expect(webhookSecretFrom(new Headers())).toBeNull();

    expect(secretInUrl(new URL(`https://www.myselectagency.com/api/webhooks/brevo?secret=${SECRET}`))).toBe(true);
    expect(secretInUrl(new URL(`https://www.myselectagency.com/api/webhooks/brevo?token=${SECRET}`))).toBe(true);
    expect(secretInUrl(new URL("https://www.myselectagency.com/api/webhooks/brevo"))).toBe(false);
  });

  it("lit un événement ou un lot, retrouve l'e-mail par son identifiant ou son étiquette unique", () => {
    expect(
      parseBrevoEvents({ event: "Delivered", "message-id": " <abc@smtp-relay.mailin.fr> ", tags: ["payment_confirmed", `outbox-${OUTBOX.toUpperCase()}`] }),
    ).toEqual([{ event: "delivered", messageId: "<abc@smtp-relay.mailin.fr>", outboxId: OUTBOX, reason: null }]);

    expect(
      parseBrevoEvents([
        { event: "hard_bounce", "message-id": "<b@x>", reason: "Adresse inexistante", tag: `outbox-${OUTBOX}` },
        { event: "opened", tags: ["sans-etiquette-utile"] }, // ni identifiant ni étiquette : ignoré
        { "message-id": "<c@x>" }, // sans événement : ignoré
        "texte",
        null,
      ]),
    ).toEqual([{ event: "hard_bounce", messageId: "<b@x>", outboxId: OUTBOX, reason: "Adresse inexistante" }]);

    expect(parseBrevoEvents({ event: "request", messageId: "<d@x>", tags: [`outbox-pas-un-uuid`] })).toEqual([
      { event: "request", messageId: "<d@x>", outboxId: null, reason: null },
    ]);
    expect(parseBrevoEvents(Array.from({ length: 150 }, (_, i) => ({ event: "delivered", "message-id": `<${i}@x>` })))).toHaveLength(MAX_WEBHOOK_EVENTS);
  });
});
