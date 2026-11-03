import type { EmailOutboxKind } from "@/lib/domain/types";
import { formatDate, formatMoney } from "@/lib/format";
import { missingDocumentNote, parseMissingDocuments } from "./missing-documents";

// Modèles d'e-mails transactionnels en français, aux couleurs officielles de SELECT Agency
// (Bleu Marine #023764, accent Jaune Citron #F0FF0A sur fond marine).
// - Toujours générés en double version : HTML et texte simple.
// - Toutes les valeurs issues des fiches ou de la base sont échappées (protection XSS).
// - Aucune promesse d'obtention de visa, d'admission ou de décision favorable.
// - Aucune donnée sensible (jamais de numéro de passeport ni de pièce d'identité).

export interface RenderedEmail {
  subject: string;
  htmlContent: string;
  textContent: string;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function str(payload: Record<string, unknown>, key: string, fallback = ""): string {
  const val = payload[key];
  return typeof val === "string" && val.trim() ? val.trim() : fallback;
}

function num(payload: Record<string, unknown>, key: string, fallback = 0): number {
  const val = Number(payload[key]);
  return Number.isFinite(val) ? val : fallback;
}

/** Adresse publique du site, utilisée dans les liens des e-mails. */
export const DEFAULT_SITE_URL = "https://www.myselectagency.com";

function siteBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || DEFAULT_SITE_URL).replace(/\/+$/, "");
}

interface LayoutOptions {
  preheader: string;
  agencyName: string;
  agencyCity?: string;
  agencyPhone?: string;
  agencyEmail?: string;
  agencyAddress?: string;
  badgeLabel: string;
  heading: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  unsubscribeToken?: string;
  disclaimer?: string;
}

function renderHtmlLayout(opts: LayoutOptions): string {
  const baseUrl = siteBaseUrl();
  const unsubUrl = opts.unsubscribeToken ? `${baseUrl}/desinscription/${encodeURIComponent(opts.unsubscribeToken)}` : null;

  const contactParts = [opts.agencyCity, opts.agencyAddress, opts.agencyPhone, opts.agencyEmail]
    .map((p) => p?.trim())
    .filter(Boolean)
    .map((p) => escapeHtml(p));

  const ctaBlock =
    opts.ctaLabel && opts.ctaUrl
      ? `<div style="margin:24px 0;">
           <a href="${escapeHtml(opts.ctaUrl)}" style="display:inline-block;background-color:#023764;color:#ffffff;font-weight:600;font-size:14px;text-decoration:none;padding:12px 22px;border-radius:8px;border-bottom:3px solid #F0FF0A;">
             ${escapeHtml(opts.ctaLabel)}
           </a>
         </div>`
      : "";

  const disclaimerBlock = opts.disclaimer
    ? `<p style="margin:16px 0 0 0;padding:12px;background-color:#f3f5f8;border-left:3px solid #023764;border-radius:6px;font-size:12px;line-height:1.5;color:#475569;">
         ${escapeHtml(opts.disclaimer)}
       </p>`
    : "";

  const unsubBlock = unsubUrl
    ? `<p style="margin:8px 0 0 0;font-size:11px;color:#64748b;">
         Vous recevez ce message dans le cadre du suivi de votre dossier chez ${escapeHtml(opts.agencyName)}.
         <a href="${escapeHtml(unsubUrl)}" style="color:#023764;text-decoration:underline;">Me désinscrire des rappels par e-mail</a>.
       </p>`
    : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(opts.heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f5f8;font-family:'Rubik',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(opts.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f5f8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e1e6ee;box-shadow:0 1px 3px rgba(2,55,100,0.1);">
          <!-- En-tête Bleu Marine SELECT avec soulignement Jaune Citron -->
          <tr>
            <td style="background-color:#023764;padding:24px 28px;border-bottom:4px solid #F0FF0A;">
              <div style="display:inline-block;background-color:#F0FF0A;color:#023764;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;padding:4px 10px;border-radius:999px;margin-bottom:10px;">
                ${escapeHtml(opts.badgeLabel)}
              </div>
              <div style="color:#ffffff;font-size:20px;font-weight:700;line-height:1.3;">
                ${escapeHtml(opts.agencyName)}
              </div>
            </td>
          </tr>
          <!-- Corps du message -->
          <tr>
            <td style="padding:28px;">
              <h1 style="margin:0 0 16px 0;font-size:18px;font-weight:700;color:#023764;line-height:1.35;">
                ${escapeHtml(opts.heading)}
              </h1>
              <div style="font-size:14px;line-height:1.6;color:#1e293b;">
                ${opts.bodyHtml}
              </div>
              ${ctaBlock}
              ${disclaimerBlock}
            </td>
          </tr>
          <!-- Pied de page -->
          <tr>
            <td style="padding:18px 28px;background-color:#f8fafc;border-top:1px solid #e1e6ee;font-size:12px;line-height:1.5;color:#475569;">
              <strong style="color:#023764;">${escapeHtml(opts.agencyName)}</strong>
              ${contactParts.length > 0 ? `<br />${contactParts.join(" · ")}` : ""}
              <p style="margin:8px 0 0 0;font-size:11px;color:#64748b;">
                Envoyé via la plateforme <strong>SELECT Agency</strong>.
              </p>
              ${unsubBlock}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderDataRowsHtml(rows: { label: string; value: string; highlight?: boolean }[]): string {
  const trs = rows
    .filter((r) => r.value.trim() !== "")
    .map(
      (r) => `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#475569;font-size:13px;width:42%;">${escapeHtml(r.label)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:${r.highlight ? "#023764" : "#0f172a"};font-weight:${r.highlight ? "700" : "600"};font-size:13px;font-variant-numeric:tabular-nums;">${escapeHtml(r.value)}</td>
      </tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background-color:#f8fafc;">${trs}</table>`;
}

/** Construit le sujet, le HTML et le texte simple d'un e-mail de la file d'envoi. */
export function renderTransactionalEmail(
  kind: EmailOutboxKind,
  subject: string,
  payload: Record<string, unknown>,
): RenderedEmail {
  const agencyName = str(payload, "agency_name", "Votre agence");
  const agencyCity = str(payload, "agency_city");
  const agencyPhone = str(payload, "agency_phone");
  const agencyEmail = str(payload, "agency_email");
  const agencyAddress = str(payload, "agency_address");
  const unsubscribeToken = str(payload, "unsubscribe_token") || undefined;
  const firstName = str(payload, "client_first_name", "Madame, Monsieur");
  const baseUrl = siteBaseUrl();

  if (kind === "agency_welcome") {
    const ownerName = str(payload, "owner_name", "Bonjour");
    const heading = `Bienvenue sur SELECT Agency, ${ownerName}`;
    const bodyHtml = `
      <p style="margin:0 0 12px 0;">Votre espace agence <strong>${escapeHtml(agencyName)}</strong> est créé et prêt à l'emploi.</p>
      <p style="margin:0 0 12px 0;">Vous pouvez dès maintenant :</p>
      <ul style="margin:0 0 16px 0;padding-left:20px;">
        <li>Enregistrer vos prospects, clients et dossiers de mobilité ;</li>
        <li>Personnaliser vos services, étapes et coordonnées de facturation (logo, cachet, signature) ;</li>
        <li>Suivre vos paiements vérifiés, éditer vos reçus et factures A4 ;</li>
        <li>Inviter vos collaborateurs et suivre vos partenaires apporteurs.</li>
      </ul>
      <p style="margin:0 0 12px 0;">Une question ? Écrivez-nous depuis <strong>Aide et support</strong>, dans votre espace agence.</p>
    `;
    const textContent = [
      `${heading}`,
      "",
      `Votre espace agence ${agencyName} est créé et prêt à l'emploi.`,
      `Accédez à votre tableau de bord : ${baseUrl}/dashboard`,
      "Une question ? Écrivez-nous depuis « Aide et support », dans votre espace agence.",
      "",
      "— L'équipe SELECT Agency",
    ].join("\n");

    return {
      subject: subject || `Bienvenue sur SELECT Agency — Votre espace ${agencyName} est prêt`,
      htmlContent: renderHtmlLayout({
        preheader: `Votre espace ${agencyName} est prêt sur SELECT Agency.`,
        agencyName: "SELECT Agency",
        badgeLabel: "Bienvenue",
        heading,
        bodyHtml,
        ctaLabel: "Ouvrir mon tableau de bord",
        ctaUrl: `${baseUrl}/dashboard`,
      }),
      textContent,
    };
  }

  if (kind === "payment_confirmed") {
    const receiptNumber = str(payload, "receipt_number", "—");
    const currency = str(payload, "currency", "XAF");
    const amountMinor = num(payload, "amount_minor", 0);
    const balanceAfterMinor = payload.balance_after_minor !== undefined && payload.balance_after_minor !== null
      ? num(payload, "balance_after_minor", 0)
      : null;
    const methodLabel = str(payload, "method_label", "Paiement");
    const txRef = str(payload, "transaction_reference");
    const paidAtRaw = str(payload, "paid_at");
    const paidDate = paidAtRaw ? formatDate(paidAtRaw, str(payload, "agency_timezone", "Africa/Douala")) : "";
    const caseRef = str(payload, "case_reference");
    const caseTitle = str(payload, "case_title");

    const amountLabel = formatMoney(amountMinor, currency);
    const balanceLabel =
      balanceAfterMinor === null
        ? ""
        : balanceAfterMinor === 0
          ? `0 ${currency} (Dossier soldé)`
          : formatMoney(balanceAfterMinor, currency);

    const rows = [
      { label: "Numéro de reçu", value: receiptNumber, highlight: true },
      { label: "Montant confirmé", value: amountLabel, highlight: true },
      { label: "Mode de paiement", value: txRef ? `${methodLabel} (réf. ${txRef})` : methodLabel },
      { label: "Date du règlement", value: paidDate },
      { label: "Dossier concerné", value: [caseRef, caseTitle].filter(Boolean).join(" — ") },
      ...(balanceLabel ? [{ label: "Reste à payer sur le dossier", value: balanceLabel, highlight: true }] : []),
    ];

    const bodyHtml = `
      <p style="margin:0 0 12px 0;">Bonjour <strong>${escapeHtml(firstName)}</strong>,</p>
      <p style="margin:0 0 12px 0;">Nous vous confirmons la bonne réception de votre règlement. Vous trouverez ci-dessous le récapitulatif ainsi que votre reçu officiel <strong>${escapeHtml(receiptNumber)}</strong> en pièce jointe (format PDF A4).</p>
      ${renderDataRowsHtml(rows)}
      <p style="margin:12px 0 0 0;">Conservez précieusement ce reçu pour vos archives.</p>
    `;

    const textLines = [
      `Bonjour ${firstName},`,
      "",
      `Nous vous confirmons la bonne réception de votre règlement chez ${agencyName}.`,
      `Votre reçu ${receiptNumber} est joint à cet e-mail au format PDF.`,
      "",
      `- Numéro de reçu : ${receiptNumber}`,
      `- Montant confirmé : ${amountLabel}`,
      `- Mode de paiement : ${txRef ? `${methodLabel} (réf. ${txRef})` : methodLabel}`,
      ...(paidDate ? [`- Date : ${paidDate}`] : []),
      ...(caseRef ? [`- Dossier : ${[caseRef, caseTitle].filter(Boolean).join(" — ")}`] : []),
      ...(balanceLabel ? [`- Reste à payer sur le dossier : ${balanceLabel}`] : []),
      "",
      `Cordialement,`,
      agencyName,
      [agencyPhone, agencyEmail].filter(Boolean).join(" · "),
    ];

    return {
      subject: subject || `Confirmation de paiement — Reçu ${receiptNumber} (${agencyName})`,
      htmlContent: renderHtmlLayout({
        preheader: `Reçu ${receiptNumber} — Paiement de ${amountLabel} confirmé.`,
        agencyName,
        agencyCity,
        agencyPhone,
        agencyEmail,
        agencyAddress,
        badgeLabel: "Paiement confirmé",
        heading: `Reçu de paiement ${receiptNumber}`,
        bodyHtml,
        unsubscribeToken,
      }),
      textContent: textLines.filter((l) => l !== undefined).join("\n"),
    };
  }

  if (kind === "document_send") {
    const docLabel = str(payload, "document_label", "Document");
    const docNumber = str(payload, "document_number");
    const caseRef = str(payload, "case_reference");
    const amountLabel = str(payload, "amount_label");
    const balanceLabel = str(payload, "balance_label");
    const customNote = str(payload, "note");

    const rows = [
      { label: "Document", value: [docLabel, docNumber].filter(Boolean).join(" ") , highlight: true },
      ...(caseRef ? [{ label: "Dossier", value: caseRef }] : []),
      ...(amountLabel ? [{ label: "Montant", value: amountLabel, highlight: true }] : []),
      ...(balanceLabel ? [{ label: "Reste à payer", value: balanceLabel }] : []),
    ];

    const bodyHtml = `
      <p style="margin:0 0 12px 0;">Bonjour <strong>${escapeHtml(firstName)}</strong>,</p>
      <p style="margin:0 0 12px 0;">Veuillez trouver ci-joint votre document <strong>${escapeHtml([docLabel, docNumber].filter(Boolean).join(" "))}</strong> au format PDF.</p>
      ${renderDataRowsHtml(rows)}
      ${customNote ? `<p style="margin:12px 0 0 0;">${escapeHtml(customNote)}</p>` : ""}
    `;

    const textContent = [
      `Bonjour ${firstName},`,
      "",
      `Veuillez trouver en pièce jointe votre document : ${[docLabel, docNumber].filter(Boolean).join(" ")}.`,
      ...(caseRef ? [`Dossier : ${caseRef}`] : []),
      ...(amountLabel ? [`Montant : ${amountLabel}`] : []),
      ...(balanceLabel ? [`Reste à payer : ${balanceLabel}`] : []),
      ...(customNote ? ["", customNote] : []),
      "",
      `Cordialement,`,
      agencyName,
    ].join("\n");

    return {
      subject: subject || `${[docLabel, docNumber].filter(Boolean).join(" ")} — ${agencyName}`,
      htmlContent: renderHtmlLayout({
        preheader: `${[docLabel, docNumber].filter(Boolean).join(" ")} transmis par ${agencyName}.`,
        agencyName,
        agencyCity,
        agencyPhone,
        agencyEmail,
        agencyAddress,
        badgeLabel: "Document officiel",
        heading: [docLabel, docNumber].filter(Boolean).join(" "),
        bodyHtml,
        unsubscribeToken,
      }),
      textContent,
    };
  }

  if (kind === "missing_documents") {
    const caseRef = str(payload, "case_reference");
    const caseTitle = str(payload, "case_title");
    const docs = parseMissingDocuments(payload.missing_documents);

    const listHtml =
      docs.length > 0
        ? `<ul style="margin:12px 0 16px 0;padding-left:20px;">${docs
            .map(
              (d) =>
                `<li style="margin-bottom:8px;"><span style="font-weight:600;color:#023764;">${escapeHtml(d.label)}</span><br /><span style="font-size:13px;color:#475569;">${escapeHtml(missingDocumentNote(d.status, d.comment))}</span></li>`,
            )
            .join("")}</ul>`
        : "";

    const bodyHtml = `
      <p style="margin:0 0 12px 0;">Bonjour <strong>${escapeHtml(firstName)}</strong>,</p>
      <p style="margin:0 0 12px 0;">Pour poursuivre le traitement de votre dossier <strong>${escapeHtml([caseRef, caseTitle].filter(Boolean).join(" — "))}</strong>, les pièces suivantes restent attendues :</p>
      ${listHtml}
      <p style="margin:0;">Merci de nous les transmettre dès qu'elles sont prêtes. Pour toute question, vous pouvez répondre directement à cet e-mail.</p>
    `;

    const textContent = [
      `Bonjour ${firstName},`,
      "",
      `Pour poursuivre le traitement de votre dossier ${[caseRef, caseTitle].filter(Boolean).join(" — ")}, les pièces suivantes restent attendues :`,
      ...docs.map((d) => `- ${d.label} (${missingDocumentNote(d.status, d.comment)})`),
      "",
      "Merci de nous les transmettre dès qu'elles sont prêtes. Pour toute question, vous pouvez répondre directement à cet e-mail.",
      "",
      `Cordialement,`,
      agencyName,
    ].join("\n");

    return {
      subject: subject || `Pièces attendues pour votre dossier ${caseRef} (${agencyName})`,
      htmlContent: renderHtmlLayout({
        preheader: `${docs.length} pièce(s) attendue(s) pour votre dossier ${caseRef}.`,
        agencyName,
        agencyCity,
        agencyPhone,
        agencyEmail,
        agencyAddress,
        badgeLabel: "Pièces du dossier",
        heading: `Pièces attendues — Dossier ${caseRef}`,
        bodyHtml,
        unsubscribeToken,
        disclaimer:
          "La vérification des pièces par l'agence permet de préparer votre dossier. Les décisions finales relèvent exclusivement des autorités consulaires et des établissements concernés.",
      }),
      textContent,
    };
  }

  if (kind === "case_status_changed") {
    const caseRef = str(payload, "case_reference");
    const caseTitle = str(payload, "case_title");
    const caseLabel = [caseRef, caseTitle].filter(Boolean).join(" — ");
    const stepLabel = str(payload, "step_label");
    const statusLabel = str(payload, "status_label", "Mise à jour");
    const nextAction = str(payload, "next_action");
    const event = str(payload, "event");
    const outcome = str(payload, "outcome");

    // Ce que l'e-mail annonce : action attendue du client, décision enregistrée, clôture (ou mise à jour simple).
    const view =
      event === "client_action"
        ? {
            badge: "Action attendue",
            heading: `Votre dossier ${caseRef} attend une action de votre part`,
            intro: `Pour faire avancer votre dossier ${caseLabel}, nous avons besoin de vous à l'étape suivante :`,
            rows: [
              { label: "Dossier", value: caseLabel, highlight: true },
              { label: "Étape", value: stepLabel, highlight: true },
            ],
            closing: "Votre conseiller vous précise ce qu'il faut préparer. Pour toute question, vous pouvez répondre directement à cet e-mail.",
          }
        : event === "decision"
          ? {
              badge: "Suivi de dossier",
              heading: `Mise à jour de votre dossier ${caseRef}`,
              intro: `Une décision a été enregistrée sur votre dossier ${caseLabel} :`,
              rows: [
                { label: "Dossier", value: caseLabel, highlight: true },
                { label: "Décision", value: statusLabel, highlight: true },
              ],
              closing:
                outcome === "refused"
                  ? "Votre conseiller va vous contacter pour examiner avec vous les suites possibles."
                  : "Votre conseiller va vous contacter pour la suite de votre démarche.",
            }
          : event === "closure"
            ? {
                badge: "Dossier clôturé",
                heading: `Votre dossier ${caseRef} est clôturé`,
                intro: `Votre dossier ${caseLabel} est désormais clôturé chez ${agencyName}.`,
                rows: [{ label: "Dossier", value: caseLabel, highlight: true }],
                closing: "Merci de votre confiance. Pour toute question, vous pouvez répondre directement à cet e-mail.",
              }
            : {
                badge: "Suivi de dossier",
                heading: `Suivi de votre dossier ${caseRef}`,
                intro: `Une mise à jour a été enregistrée sur votre dossier chez ${agencyName} :`,
                rows: [
                  { label: "Dossier", value: caseLabel, highlight: true },
                  { label: "État actuel", value: statusLabel, highlight: true },
                  ...(stepLabel ? [{ label: "Étape enregistrée", value: stepLabel }] : []),
                  ...(nextAction ? [{ label: "Prochaine étape", value: nextAction }] : []),
                ],
                closing: "Votre conseiller reste à votre disposition pour toute précision.",
              };

    const bodyHtml = `
      <p style="margin:0 0 12px 0;">Bonjour <strong>${escapeHtml(firstName)}</strong>,</p>
      <p style="margin:0 0 12px 0;">${escapeHtml(view.intro)}</p>
      ${renderDataRowsHtml(view.rows)}
      <p style="margin:12px 0 0 0;">${escapeHtml(view.closing)}</p>
    `;

    const textContent = [
      `Bonjour ${firstName},`,
      "",
      view.intro,
      ...view.rows.filter((r) => r.value.trim()).map((r) => `- ${r.label} : ${r.value}`),
      "",
      view.closing,
      "",
      `Cordialement,`,
      agencyName,
    ].join("\n");

    return {
      subject: subject || `Mise à jour de votre dossier ${caseRef} — ${agencyName}`,
      htmlContent: renderHtmlLayout({
        preheader: event === "client_action" ? `Dossier ${caseRef} : ${stepLabel}.` : `Dossier ${caseRef} : ${statusLabel}.`,
        agencyName,
        agencyCity,
        agencyPhone,
        agencyEmail,
        agencyAddress,
        badgeLabel: view.badge,
        heading: view.heading,
        bodyHtml,
        unsubscribeToken,
        disclaimer:
          "L'agence assure le suivi et l'accompagnement de votre démarche. Les décisions d'admission ou de délivrance de visa appartiennent exclusivement aux organismes officiels.",
      }),
      textContent,
    };
  }

  if (kind === "appointment_reminder") {
    const title = str(payload, "appointment_title", "Rendez-vous");
    const tz = str(payload, "agency_timezone", "Africa/Douala");
    const startsAt = str(payload, "starts_at");
    // Date et heure à l'heure de l'agence, ex. « mardi 3 novembre à 10:00 » (ou la journée entière).
    const whenLabel =
      str(payload, "when_label") ||
      (startsAt ? (payload.all_day === true ? formatDate(startsAt, tz, "weekday") : `${formatDate(startsAt, tz, "weekday")} à ${formatDate(startsAt, tz, "time")}`) : "");
    const location = str(payload, "location");
    const caseRef = str(payload, "case_reference");

    const rows = [
      { label: "Objet", value: title, highlight: true },
      { label: "Date et heure", value: whenLabel, highlight: true },
      ...(location ? [{ label: "Lieu", value: location }] : []),
      ...(caseRef ? [{ label: "Dossier", value: caseRef }] : []),
    ];

    const bodyHtml = `
      <p style="margin:0 0 12px 0;">Bonjour <strong>${escapeHtml(firstName)}</strong>,</p>
      <p style="margin:0 0 12px 0;">Nous vous rappelons votre prochain rendez-vous prévu avec <strong>${escapeHtml(agencyName)}</strong> :</p>
      ${renderDataRowsHtml(rows)}
      <p style="margin:12px 0 0 0;">En cas d'empêchement, merci de prévenir votre conseiller au plus tôt.</p>
    `;

    const textContent = [
      `Bonjour ${firstName},`,
      "",
      `Rappel de votre prochain rendez-vous avec ${agencyName} :`,
      `- Objet : ${title}`,
      `- Date et heure : ${whenLabel}`,
      ...(location ? [`- Lieu : ${location}`] : []),
      ...(caseRef ? [`- Dossier : ${caseRef}`] : []),
      "",
      `Cordialement,`,
      agencyName,
    ].join("\n");

    return {
      subject: subject || `Rappel de rendez-vous : ${title} (${agencyName})`,
      htmlContent: renderHtmlLayout({
        preheader: `Rappel : ${title} — ${whenLabel}.`,
        agencyName,
        agencyCity,
        agencyPhone,
        agencyEmail,
        agencyAddress,
        badgeLabel: "Rappel de rendez-vous",
        heading: title,
        bodyHtml,
        unsubscribeToken,
      }),
      textContent,
    };
  }

  // subscription_notice
  const ownerName = str(payload, "owner_name", "Bonjour");
  const noticeTitle = str(payload, "notice_title", "Information sur votre abonnement SELECT Agency");
  const statusLabel = str(payload, "status_label", "Abonnement");
  const deadlineAt = str(payload, "deadline_at");
  const deadlineLabel = str(payload, "deadline_label") || (deadlineAt ? formatDate(deadlineAt, str(payload, "agency_timezone", "Africa/Douala"), "weekday") : "");
  const detailText = str(payload, "detail_text");

  const rows = [
    { label: "Agence", value: agencyName, highlight: true },
    { label: "Statut", value: statusLabel, highlight: true },
    ...(deadlineLabel ? [{ label: "Échéance", value: deadlineLabel }] : []),
  ];

  const bodyHtml = `
    <p style="margin:0 0 12px 0;">Bonjour <strong>${escapeHtml(ownerName)}</strong>,</p>
    <p style="margin:0 0 12px 0;">${escapeHtml(detailText || "Voici un point concernant l'abonnement de votre agence sur SELECT Agency.")}</p>
    ${renderDataRowsHtml(rows)}
  `;

  const textContent = [
    `Bonjour ${ownerName},`,
    "",
    detailText || "Voici un point concernant l'abonnement de votre agence sur SELECT Agency.",
    `- Agence : ${agencyName}`,
    `- Statut : ${statusLabel}`,
    ...(deadlineLabel ? [`- Échéance : ${deadlineLabel}`] : []),
    "",
    `Gérer mon abonnement : ${baseUrl}/settings/billing`,
  ].join("\n");

  return {
    subject: subject || `${noticeTitle} — ${agencyName}`,
    htmlContent: renderHtmlLayout({
      preheader: `${noticeTitle} (${agencyName}).`,
      agencyName: "SELECT Agency",
      badgeLabel: "Abonnement",
      heading: noticeTitle,
      bodyHtml,
      ctaLabel: "Consulter mon abonnement",
      ctaUrl: `${baseUrl}/settings/billing`,
    }),
    textContent,
  };
}

