"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getAgencyContext, type AgencyContext } from "@/lib/auth/context";
import { allowed, forbiddenMessage } from "@/lib/auth/permissions";
import { dbMessage } from "@/lib/data/errors";
import { emailSendingEnabled } from "@/lib/email/brevo";
import { flushAgencyEmailOutbox } from "@/lib/email/dispatcher";
import { outboxResultMessage } from "@/lib/email/report";
import type { FormState } from "@/lib/form-state";

// Envoi direct d'un document au client, par e-mail, avec le PDF en pièce jointe (jamais de lien public).
// C'est l'agent qui le décide : cet envoi ne dépend pas des e-mails automatiques activés par l'agence.

export type EmailDocumentKind = "receipt" | "invoice" | "quote" | "case" | "booking";

const inputSchema = z.object({
  kind: z.enum(["receipt", "invoice", "quote", "case", "booking"]),
  id: z.uuid(),
  /** Identifiant tiré au sort à l'ouverture de la confirmation : un double clic n'envoie qu'un e-mail. */
  requestId: z.uuid(),
  withFinance: z.boolean().optional(),
});

interface DocumentToSend {
  clientId: string;
  caseId: string | null;
  label: string;
  number: string;
  /** Raison pour laquelle ce document ne peut pas être envoyé (annulé, brouillon…). */
  blocked?: string;
}

async function describe(ctx: AgencyContext, kind: EmailDocumentKind, id: string): Promise<DocumentToSend | null> {
  const org = ctx.organizationId;
  if (kind === "receipt") {
    const { data } = await ctx.supabase.from("payments").select("receipt_number, status, client_id, case_id").eq("id", id).eq("organization_id", org).maybeSingle();
    if (!data) return null;
    return {
      clientId: data.client_id,
      caseId: data.case_id,
      label: "Reçu",
      number: data.receipt_number ?? "",
      blocked:
        data.status === "voided" ? "Ce reçu est annulé : il ne peut pas être envoyé." : data.status !== "recorded" ? "Ce paiement n'est pas encore confirmé : le reçu n'existe pas encore." : undefined,
    };
  }
  if (kind === "invoice") {
    const { data } = await ctx.supabase.from("invoices").select("number, status, client_id, case_id").eq("id", id).eq("organization_id", org).maybeSingle();
    if (!data) return null;
    return {
      clientId: data.client_id,
      caseId: data.case_id,
      label: "Facture",
      number: data.number,
      blocked:
        data.status === "draft" ? "Cette facture est un brouillon : émettez-la avant de l'envoyer." : data.status === "cancelled" ? "Cette facture est annulée : elle ne peut pas être envoyée." : undefined,
    };
  }
  if (kind === "quote") {
    const { data } = await ctx.supabase.from("quotes").select("reference, status, client_id, case_id").eq("id", id).eq("organization_id", org).maybeSingle();
    if (!data) return null;
    return {
      clientId: data.client_id,
      caseId: data.case_id,
      label: "Devis",
      number: data.reference,
      blocked: data.status === "cancelled" || data.status === "refused" ? "Ce devis est annulé ou refusé : il ne peut pas être envoyé." : undefined,
    };
  }
  if (kind === "case") {
    const { data } = await ctx.supabase.from("cases").select("reference, client_id").eq("id", id).eq("organization_id", org).maybeSingle();
    if (!data) return null;
    return { clientId: data.client_id, caseId: id, label: "Récapitulatif du dossier", number: data.reference };
  }
  const { data } = await ctx.supabase.from("service_bookings").select("number, service_client_id").eq("id", id).eq("organization_id", org).maybeSingle();
  if (!data) return null;
  const { data: link } = await ctx.supabase.from("service_clients").select("client_id, case_id").eq("id", data.service_client_id).eq("organization_id", org).maybeSingle();
  if (!link) return null;
  return { clientId: link.client_id, caseId: link.case_id, label: "Confirmation de réservation", number: data.number };
}

export async function sendDocumentEmailAction(raw: {
  kind: EmailDocumentKind;
  id: string;
  requestId: string;
  withFinance?: boolean;
}): Promise<FormState> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { message: "Document introuvable." };
  const { kind, id, requestId, withFinance } = parsed.data;
  if (!emailSendingEnabled()) return { message: "L'envoi direct des e-mails n'est pas encore activé sur SELECT Agency." };

  const ctx = await getAgencyContext();
  // Reçus, factures et devis : rôles de la caisse. Récapitulatifs et réservations : rôles qui suivent les dossiers.
  const permission = kind === "case" || kind === "booking" ? "operations.write" : "finance.write";
  if (!allowed(ctx, permission)) return { message: forbiddenMessage(ctx, permission) };

  const doc = await describe(ctx, kind, id);
  if (!doc) return { message: "Document introuvable." };
  if (doc.blocked) return { message: doc.blocked };

  const { data: client } = await ctx.supabase.from("clients").select("email").eq("id", doc.clientId).eq("organization_id", ctx.organizationId).maybeSingle();
  const to = (client?.email as string | null | undefined)?.trim();
  if (!to) return { message: "Ce client n'a pas d'adresse e-mail sur sa fiche : ajoutez-la, puis réessayez." };

  const { data: caseRow } = doc.caseId
    ? await ctx.supabase.from("cases").select("reference").eq("id", doc.caseId).eq("organization_id", ctx.organizationId).maybeSingle()
    : { data: null };

  const title = `${doc.label} ${doc.number}`.trim();
  const { data: outboxId, error } = await ctx.supabase.rpc("queue_agency_email", {
    p_organization_id: ctx.organizationId,
    p_kind: "document_send",
    p_idempotency_key: `document_send:${requestId}`,
    p_client_id: doc.clientId,
    p_case_id: doc.caseId,
    p_payment_id: null,
    p_subject: `${title} — ${ctx.agency.name}`,
    p_payload: {
      document_kind: kind,
      document_id: id,
      document_label: doc.label,
      document_number: doc.number,
      case_reference: (caseRow?.reference as string | undefined) ?? "",
      with_finance: kind === "case" ? Boolean(withFinance) : false,
    },
    p_summary: `${title} (PDF) envoyé par e-mail`,
  });
  if (error) return { message: dbMessage(error) };
  if (!outboxId) return { message: "Cet envoi a déjà été demandé : consultez l'historique du client." };

  await flushAgencyEmailOutbox(ctx, 5);
  refresh();
  return outboxResultMessage(ctx, outboxId as string, title, to);
}
