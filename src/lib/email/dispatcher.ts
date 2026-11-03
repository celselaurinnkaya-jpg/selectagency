import "server-only";
import { after } from "next/server";
import { getAgencyContext, type AgencyContext } from "@/lib/auth/context";
import { toEmailOutboxItem } from "@/lib/data/rows";
import type { EmailOutboxItem } from "@/lib/domain/types";
import { getCaseSummaryDocument } from "@/features/cases/queries";
import { getReceipt } from "@/features/finance/queries";
import { renderReceiptPdf } from "@/features/finance/receipt-pdf";
import { renderInvoicePdf } from "@/features/invoices/pdf";
import { getInvoice, loadBrandingImages } from "@/features/invoices/queries";
import { renderSpecPdf } from "@/features/printables/spec-pdf";
import { getQuote } from "@/features/quotes/queries";
import { getBookingDocument } from "@/features/services/queries";
import { defaultSenderEmail, isBrevoConfigured, type BrevoAttachment } from "./brevo";
import { deliverOutboxItem } from "./deliver";

const pdf = (name: string, bytes: Uint8Array): BrevoAttachment[] => [{ name, contentBase64: Buffer.from(bytes).toString("base64") }];

/**
 * Pièce jointe PDF d'un e-mail, lue avec les droits de la personne connectée (RLS).
 * Renvoie null quand le PDF promis par l'e-mail n'a pas pu être produit : l'e-mail est alors retenté
 * plus tard au lieu de partir sans le document annoncé.
 */
async function attachmentsFor(ctx: AgencyContext, item: EmailOutboxItem): Promise<BrevoAttachment[] | null> {
  try {
    if (item.kind === "payment_confirmed") {
      const receipt = item.paymentId ? await getReceipt(item.paymentId) : null;
      if (!receipt?.document) return null;
      return pdf(`${receipt.document.number}.pdf`, await renderReceiptPdf(receipt.document, await loadBrandingImages(ctx, receipt.settings)));
    }

    if (item.kind === "document_send") {
      const docKind = String(item.payload.document_kind ?? "");
      const docId = String(item.payload.document_id ?? "");
      if (!docId) return [];
      if (docKind === "receipt") {
        const receipt = await getReceipt(docId);
        if (!receipt?.document) return null;
        return pdf(`${receipt.document.number}.pdf`, await renderReceiptPdf(receipt.document, await loadBrandingImages(ctx, receipt.settings)));
      }
      if (docKind === "invoice") {
        const detail = await getInvoice(docId);
        if (!detail) return null;
        return pdf(`${detail.invoice.number}.pdf`, await renderInvoicePdf(detail.document, await loadBrandingImages(ctx, detail.settings)));
      }
      if (docKind === "quote") {
        const detail = await getQuote(docId);
        if (!detail) return null;
        return pdf(`${detail.quote.reference}.pdf`, await renderSpecPdf(detail.spec, await loadBrandingImages(ctx, detail.settings)));
      }
      if (docKind === "case") {
        const detail = await getCaseSummaryDocument(docId, Boolean(item.payload.with_finance));
        if (!detail) return null;
        return pdf(`Recapitulatif-${detail.travelCase.reference}.pdf`, await renderSpecPdf(detail.spec, await loadBrandingImages(ctx, detail.settings)));
      }
      if (docKind === "booking") {
        const detail = await getBookingDocument(docId);
        if (!detail) return null;
        return pdf(`${detail.booking.number}.pdf`, await renderSpecPdf(detail.spec, await loadBrandingImages(ctx, detail.settings)));
      }
      return null;
    }
  } catch {
    return null;
  }
  return [];
}

export interface FlushEmailsResult {
  configured: boolean;
  claimed: number;
  sent: number;
  failed: number;
  lastError?: string;
}

/**
 * Envoie tout de suite les e-mails en attente de l'agence connectée.
 * - La base revérifie chaque e-mail avant de le confier (paiement toujours confirmé, client inscrit…).
 * - « Envoyé » = accepté par Brevo ; la livraison n'est confirmée que par le webhook.
 * Sans configuration Brevo sur le serveur, rien n'est réclamé : les e-mails restent en attente.
 */
export async function flushAgencyEmailOutbox(existingCtx?: AgencyContext, limit = 5): Promise<FlushEmailsResult> {
  if (!isBrevoConfigured() || !defaultSenderEmail()) {
    return { configured: false, claimed: 0, sent: 0, failed: 0 };
  }

  const ctx = existingCtx ?? (await getAgencyContext());
  const { data: rows, error } = await ctx.supabase.rpc("claim_agency_emails", {
    p_organization_id: ctx.organizationId,
    p_limit: limit,
  });
  if (error || !Array.isArray(rows) || rows.length === 0) {
    return { configured: true, claimed: 0, sent: 0, failed: 0, lastError: error ? "Lecture de la file d'envoi impossible." : undefined };
  }

  const items = (rows as Record<string, unknown>[]).map(toEmailOutboxItem);
  let sent = 0;
  let failed = 0;
  let lastError: string | undefined;

  for (const item of items) {
    const res = await deliverOutboxItem(item, () => attachmentsFor(ctx, item));

    if (res.ok) sent += 1;
    else {
      failed += 1;
      lastError = res.error;
    }

    const { error: completeError } = await ctx.supabase.rpc("complete_agency_email", {
      p_email_id: item.id,
      p_success: res.ok,
      p_brevo_message_id: res.ok ? res.messageId : null,
      p_error: res.ok ? null : res.error,
      p_permanent: res.ok ? false : !res.retryable,
    });
    // Si la clôture échoue, l'e-mail reste « en cours » ; il sera repris dans 15 minutes avec la même clé
    // anti-doublon, et Brevo ne l'enverra pas deux fois.
    if (completeError) lastError = "Résultat de l'envoi non enregistré ; vérification automatique dans 15 minutes.";
  }

  return { configured: true, claimed: items.length, sent, failed, lastError };
}

/**
 * Envoie les e-mails en attente de l'agence JUSTE APRÈS la réponse à la personne connectée
 * (elle n'attend pas Brevo). À appeler après une action qui peut inscrire un e-mail : paiement confirmé,
 * agence créée… Sans configuration Brevo sur le serveur, rien n'est fait : les e-mails restent en attente.
 */
export function sendQueuedEmailsAfterResponse(ctx?: AgencyContext): void {
  if (!isBrevoConfigured() || !defaultSenderEmail()) return;
  after(async () => {
    try {
      await flushAgencyEmailOutbox(ctx);
    } catch {
      // Les e-mails restent en file : ils seront repris au prochain envoi.
    }
  });
}
