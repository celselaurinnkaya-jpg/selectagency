import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { defaultSenderEmail, findAcceptedEmailByTag, isBrevoConfigured, isRetryableBrevoStatus, sanitizeBrevoError, sendBrevoEmail } from "./brevo";
import { DEFAULT_SITE_URL, escapeHtml, renderTransactionalEmail } from "./templates";
import { missingDocumentNote, parseMissingDocuments } from "./missing-documents";

/** Faux Brevo : enregistre la requête et renvoie la réponse demandée. */
function fakeBrevo(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  return { impl, calls, body: (i = 0) => JSON.parse(String(calls[i]!.init.body)) as Record<string, unknown> };
}

const BASE = { toEmail: "client@exemple.test", subject: "Test", htmlContent: "<p>Test</p>", textContent: "Test" };

describe("module serveur Brevo (src/lib/email/brevo.ts)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.BREVO_API_KEY = "xkeysib-0123456789abcdef0123456789abcdef-secretTestKey999";
    process.env.BREVO_SENDER_EMAIL = "notifications@selectagency.test";
    delete process.env.BREVO_SANDBOX;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("détecte la présence de la configuration Brevo et de l'expéditeur", () => {
    expect(isBrevoConfigured()).toBe(true);
    expect(defaultSenderEmail()).toBe("notifications@selectagency.test");

    process.env.BREVO_API_KEY = "";
    process.env.BREVO_SENDER_EMAIL = "invalide";
    expect(isBrevoConfigured()).toBe(false);
    expect(defaultSenderEmail()).toBeNull();
  });

  it("masque systématiquement toute clé API ou SMTP dans les messages d'erreur", () => {
    const cleaned = sanitizeBrevoError("Erreur avec xkeysib-abcdef1234567890_SECRET et xsmtpsib-9876543210-AutreSecret dans le log");
    expect(cleaned).not.toContain("xkeysib-");
    expect(cleaned).not.toContain("xsmtpsib-");
    expect(cleaned).not.toContain("SECRET");
    expect(cleaned).toContain("[CLE_MASQUEE]");
  });

  it("envoie avec pièce jointe, adresse de réponse, étiquettes et bac à sable DANS le corps de la requête", async () => {
    const brevo = fakeBrevo(201, { messageId: "<20261102.001@smtp-relay.mailin.fr>" });
    const res = await sendBrevoEmail(
      {
        toEmail: "Client@Exemple.test",
        toName: "Inès Tchoumi",
        senderName: "Agence Horizon",
        replyToEmail: "Contact@Horizon.test",
        subject: "Confirmation de paiement — Reçu REC-2026-00001",
        htmlContent: "<p>Bonjour Inès</p>",
        textContent: "Bonjour Inès",
        attachments: [{ name: "REC-2026-00001.pdf", contentBase64: "JVBERi0xLjc=" }],
        tags: ["outbox-4c9f2b1e-0000-4000-8000-000000000001", "payment_confirmed"],
        sandbox: true,
      },
      brevo.impl,
    );

    expect(res).toEqual({ ok: true, messageId: "<20261102.001@smtp-relay.mailin.fr>", duplicate: false, sandbox: true });
    expect(brevo.calls[0]!.url).toBe("https://api.brevo.com/v3/smtp/email");

    // La clé part dans l'en-tête HTTP « api-key » ; le bac à sable n'y est PAS (Brevo l'ignorerait).
    const httpHeaders = brevo.calls[0]!.init.headers as Record<string, string>;
    expect(httpHeaders["api-key"]).toBe(process.env.BREVO_API_KEY);
    expect(httpHeaders["X-Sib-Sandbox"]).toBeUndefined();

    const sent = brevo.body();
    expect(sent.headers).toEqual({ "X-Sib-Sandbox": "drop" });
    expect(sent.tags).toEqual(["outbox-4c9f2b1e-0000-4000-8000-000000000001", "payment_confirmed"]);
    expect(sent.sender).toEqual({ name: "Agence Horizon via SELECT Agency", email: "notifications@selectagency.test" });
    expect(sent.to).toEqual([{ email: "client@exemple.test", name: "Inès Tchoumi" }]);
    expect(sent.replyTo).toEqual({ email: "contact@horizon.test", name: "Agence Horizon" });
    expect(sent.attachment).toEqual([{ name: "REC-2026-00001.pdf", content: "JVBERi0xLjc=" }]);
  });

  it("BREVO_SANDBOX=true force le bac à sable ; sans lui, aucun en-tête de bac à sable n'est envoyé", async () => {
    const normal = fakeBrevo(201, { messageId: "<a@brevo>" });
    await sendBrevoEmail(BASE, normal.impl);
    expect(normal.body().headers).toBeUndefined();

    process.env.BREVO_SANDBOX = "true";
    const forced = fakeBrevo(201, { messageId: "<b@brevo>" });
    const res = await sendBrevoEmail(BASE, forced.impl);
    expect(forced.body().headers).toEqual({ "X-Sib-Sandbox": "drop" });
    expect(res).toMatchObject({ ok: true, sandbox: true });
  });

  it("n'invente jamais d'identifiant", async () => {
    const noId = await sendBrevoEmail(BASE, fakeBrevo(201, {}).impl);
    expect(noId).toEqual({ ok: true, messageId: null, duplicate: false, sandbox: false });
  });

  it("retrouve chez Brevo un e-mail déjà accepté grâce à son étiquette, sans rien envoyer", async () => {
    const found = fakeBrevo(200, { events: [{ event: "requests", messageId: "<deja@brevo>" }] });
    expect(await findAcceptedEmailByTag("outbox-42", found.impl)).toEqual({ ok: true, found: true, messageId: "<deja@brevo>" });
    const url = new URL(found.calls[0]!.url);
    expect(url.pathname).toBe("/v3/smtp/statistics/events");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ tags: "outbox-42", event: "requests", days: "7" });
    expect(found.calls[0]!.init.method ?? "GET").toBe("GET");

    expect(await findAcceptedEmailByTag("outbox-43", fakeBrevo(200, { events: [] }).impl)).toEqual({ ok: true, found: false, messageId: null });
    expect(await findAcceptedEmailByTag("outbox-44", fakeBrevo(500, { message: "panne" }).impl)).toMatchObject({ ok: false });
  });

  it("classe les erreurs : l'e-mail refusé n'est pas retenté, une panne ou une clé refusée l'est", async () => {
    const res400 = await sendBrevoEmail(BASE, fakeBrevo(400, { code: "invalid_parameter", message: "Sender is invalid (key xkeysib-secret123)" }).impl);
    expect(res400).toMatchObject({ ok: false, retryable: false, statusCode: 400 });
    if (!res400.ok) expect(res400.error).not.toContain("xkeysib-");

    for (const status of [401, 402, 403, 429, 500, 503]) expect(isRetryableBrevoStatus(status)).toBe(true);
    for (const status of [400, 404, 405]) expect(isRetryableBrevoStatus(status)).toBe(false);

    const timeoutFetch: typeof fetch = async () => {
      const err = new Error("The operation was aborted due to timeout");
      err.name = "TimeoutError";
      throw err;
    };
    expect(await sendBrevoEmail({ ...BASE, timeoutMs: 2000 }, timeoutFetch)).toEqual({
      ok: false,
      error: "Délai d'attente dépassé (2 s) lors de la connexion à Brevo.",
      retryable: true,
    });
  });

  it("refuse avant tout appel une adresse invalide ou un serveur sans configuration", async () => {
    const brevo = fakeBrevo(201, { messageId: "<x@brevo>" });
    expect(await sendBrevoEmail({ ...BASE, toEmail: "pas-une-adresse" }, brevo.impl)).toMatchObject({ ok: false, retryable: false });

    delete process.env.BREVO_SENDER_EMAIL;
    expect(await sendBrevoEmail(BASE, brevo.impl)).toMatchObject({ ok: false, retryable: true });

    process.env.BREVO_SENDER_EMAIL = "notifications@selectagency.test";
    process.env.BREVO_API_KEY = "";
    expect(await sendBrevoEmail(BASE, brevo.impl)).toMatchObject({ ok: false, retryable: true });
    expect(brevo.calls).toHaveLength(0);
  });
});

describe("modèles d'e-mails transactionnels en français (src/lib/email/templates.ts)", () => {
  it("échappe les caractères HTML dangereux", () => {
    expect(escapeHtml(`<script>alert("xss")</script>`)).toBe("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
  });

  it("génère l'e-mail de confirmation de paiement avec solde restant, identité de l'agence et lien de désinscription", () => {
    const rendered = renderTransactionalEmail("payment_confirmed", "", {
      agency_name: "Cap Études Douala",
      agency_city: "Douala",
      agency_phone: "+237 690 00 00 00",
      agency_email: "contact@capetudes.test",
      client_first_name: "Inès",
      receipt_number: "REC-2026-00012",
      amount_minor: 150000,
      currency: "XAF",
      method_label: "Orange Money",
      transaction_reference: "OM-7788",
      paid_at: "2026-11-02T10:00:00Z",
      balance_after_minor: 50000,
      case_reference: "DOS-2026-00004",
      case_title: "Études en France — Campus France",
      unsubscribe_token: "11111111-2222-4333-8444-555555555555",
    });

    expect(rendered.subject).toBe("Confirmation de paiement — Reçu REC-2026-00012 (Cap Études Douala)");
    expect(rendered.htmlContent).toContain("#023764");
    expect(rendered.htmlContent).toContain("#F0FF0A");
    expect(rendered.htmlContent).toContain("REC-2026-00012");
    expect(rendered.htmlContent).toContain("Orange Money (réf. OM-7788)");
    expect(rendered.htmlContent).toContain("Reste à payer sur le dossier");
    expect(rendered.htmlContent).toContain("/desinscription/11111111-2222-4333-8444-555555555555");
    expect(rendered.textContent).toContain("REC-2026-00012");
    expect(rendered.textContent).toContain("Reste à payer sur le dossier");
  });

  it("pièces manquantes : chaque pièce dit au client ce qu'il doit faire, motif de correction compris", () => {
    expect(missingDocumentNote("not_received")).toBe("À fournir");
    expect(missingDocumentNote("to_correct", " Photo illisible ")).toBe("À corriger : Photo illisible");
    expect(missingDocumentNote("to_correct")).toBe("À corriger");
    expect(missingDocumentNote("expired")).toBe("Expirée : à renouveler");
    expect(parseMissingDocuments(["Passeport", "", { label: "Photo", status: "to_correct", comment: "Fond blanc" }, { label: " " }, 42])).toEqual([
      { label: "Passeport", status: "not_received" },
      { label: "Photo", status: "to_correct", comment: "Fond blanc" },
    ]);

    const mail = renderTransactionalEmail("missing_documents", "Pièces attendues pour votre dossier DOS-2026-00009 — Agence K", {
      agency_name: "Agence K",
      client_first_name: "Awa",
      case_reference: "DOS-2026-00009",
      case_title: "Licence à Lille",
      missing_documents: [
        { label: "Passeport", status: "not_received", comment: "" },
        { label: "Relevé <bancaire>", status: "to_correct", comment: "Signature <manquante>" },
        { label: "Casier judiciaire", status: "expired", comment: "" },
      ],
    });
    expect(mail.subject).toBe("Pièces attendues pour votre dossier DOS-2026-00009 — Agence K");
    expect(mail.htmlContent).toContain("Relevé &lt;bancaire&gt;");
    expect(mail.htmlContent).toContain("À corriger : Signature &lt;manquante&gt;");
    expect(mail.textContent).toContain("- Passeport (À fournir)");
    expect(mail.textContent).toContain("- Casier judiciaire (Expirée : à renouveler)");
    expect(mail.textContent).toContain("répondre directement à cet e-mail");
  });

  it("avancement du dossier : action attendue, décision (dont refus) et clôture, sans promesse", () => {
    const base = { agency_name: "Agence K", client_first_name: "Awa", case_reference: "DOS-2026-00009", case_title: "Licence à Lille" };

    const action = renderTransactionalEmail("case_status_changed", "Action attendue pour votre dossier DOS-2026-00009 — Agence K", {
      ...base,
      event: "client_action",
      step_label: "Collecte des documents",
      status_label: "Action attendue de votre part",
    });
    expect(action.htmlContent).toContain("Votre dossier DOS-2026-00009 attend une action de votre part");
    expect(action.htmlContent).toContain("Collecte des documents");
    expect(action.textContent).toContain("- Étape : Collecte des documents");
    expect(action.htmlContent).toContain("organismes officiels");

    const refused = renderTransactionalEmail("case_status_changed", "", { ...base, event: "decision", status_label: "Visa refusé", outcome: "refused" });
    expect(refused.textContent).toContain("- Décision : Visa refusé");
    expect(refused.textContent).toContain("examiner avec vous les suites possibles");
    const granted = renderTransactionalEmail("case_status_changed", "", { ...base, event: "decision", status_label: "Visa accordé", outcome: "approved" });
    expect(granted.textContent).toContain("pour la suite de votre démarche");
    expect(granted.textContent).not.toContain("suites possibles");

    const closed = renderTransactionalEmail("case_status_changed", "", { ...base, event: "closure", status_label: "Dossier clôturé" });
    expect(closed.htmlContent).toContain("Votre dossier DOS-2026-00009 est clôturé");
    expect(closed.textContent).toContain("Merci de votre confiance");
  });

  it("rappel de rendez-vous et alerte d'abonnement : dates écrites à l'heure de l'agence", () => {
    const reminder = renderTransactionalEmail("appointment_reminder", "Rappel de rendez-vous : Point sur le dossier (Agence K)", {
      agency_name: "Agence K",
      agency_timezone: "Africa/Douala",
      client_first_name: "Awa",
      appointment_title: "Point sur le dossier",
      starts_at: "2026-11-03T09:00:00+00:00",
      all_day: false,
      location: "Agence de Douala",
    });
    // 9 h UTC = 10 h à Douala.
    expect(reminder.textContent).toContain("- Date et heure : mardi 3 novembre à 10:00");
    const allDay = renderTransactionalEmail("appointment_reminder", "", {
      agency_timezone: "Africa/Douala",
      appointment_title: "Dépôt",
      starts_at: "2026-11-03T09:00:00+00:00",
      all_day: true,
    });
    expect(allDay.textContent).toContain("- Date et heure : mardi 3 novembre");
    expect(allDay.textContent).not.toContain(" à ");

    const trial = renderTransactionalEmail("subscription_notice", "Votre essai gratuit se termine demain — Agence K", {
      agency_name: "Agence K",
      agency_timezone: "Africa/Douala",
      owner_name: "Karl Biya",
      notice_title: "Votre essai gratuit se termine demain",
      status_label: "Essai gratuit",
      detail_text: "Votre période d'essai se termine demain.",
      deadline_at: "2026-11-03T23:30:00+00:00",
    });
    // 23 h 30 UTC le 3 = 0 h 30 le 4 à Douala.
    expect(trial.textContent).toContain("- Échéance : mercredi 4 novembre");
    expect(trial.htmlContent).not.toContain("desinscription");
  });

  it("génère les e-mails de bienvenue, pièces manquantes, état du dossier, rendez-vous et abonnement sans promesse de visa", () => {
    const welcome = renderTransactionalEmail("agency_welcome", "", {
      owner_name: "Karl Biya",
      agency_name: "Agence K",
    });
    expect(welcome.subject).toContain("Agence K");
    expect(welcome.htmlContent).toContain("Ouvrir mon tableau de bord");

    const missing = renderTransactionalEmail("missing_documents", "", {
      agency_name: "Agence K",
      client_first_name: "Paul",
      case_reference: "DOS-2026-00001",
      missing_documents: ["Relevés de notes <L3>", "Attestation bancaire"],
    });
    expect(missing.htmlContent).toContain("Relevés de notes &lt;L3&gt;");
    expect(missing.htmlContent).toContain("autorités consulaires");
    expect(missing.textContent).toContain("- Attestation bancaire");

    const status = renderTransactionalEmail("case_status_changed", "", {
      agency_name: "Agence K",
      client_first_name: "Paul",
      case_reference: "DOS-2026-00001",
      status_label: "Action attendue du client",
      step_label: "Entretien Campus France",
      next_action: "Confirmer la date d'entretien",
    });
    expect(status.htmlContent).toContain("Entretien Campus France");
    expect(status.htmlContent).toContain("organismes officiels");

    const reminder = renderTransactionalEmail("appointment_reminder", "", {
      agency_name: "Agence K",
      client_first_name: "Paul",
      appointment_title: "Préparation entretien consulaire",
      when_label: "Mardi 3 novembre 2026 à 10h00",
      location: "Agence de Douala — Akwa",
    });
    expect(reminder.subject).toContain("Préparation entretien consulaire");
    expect(reminder.textContent).toContain("Agence de Douala — Akwa");

    const sub = renderTransactionalEmail("subscription_notice", "", {
      owner_name: "Karl",
      agency_name: "Agence K",
      notice_title: "Votre période d'essai se termine dans 7 jours",
      status_label: "Essai gratuit",
      deadline_label: "9 novembre 2026",
    });
    expect(sub.htmlContent).toContain("Consulter mon abonnement");
    expect(sub.textContent).toContain("/settings/billing");
  });

  it("met l'adresse du site en ligne dans les liens quand aucune n'est configurée", () => {
    const previous = process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    try {
      const rendered = renderTransactionalEmail("payment_confirmed", "", {
        agency_name: "Agence K",
        unsubscribe_token: "11111111-2222-4333-8444-555555555555",
      });
      expect(DEFAULT_SITE_URL).toBe("https://www.myselectagency.com");
      expect(rendered.htmlContent).toContain("https://www.myselectagency.com/desinscription/11111111-2222-4333-8444-555555555555");
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = previous;
    }
  });
});
