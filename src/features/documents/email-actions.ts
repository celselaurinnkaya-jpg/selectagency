"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getAgencyContext } from "@/lib/auth/context";
import { allowed, forbiddenMessage } from "@/lib/auth/permissions";
import { dbMessage } from "@/lib/data/errors";
import { emailSendingEnabled } from "@/lib/email/brevo";
import { flushAgencyEmailOutbox } from "@/lib/email/dispatcher";
import { outboxResultMessage } from "@/lib/email/report";
import type { FormState } from "@/lib/form-state";

// Relance des pièces manquantes par e-mail, demandée par l'agent. La liste envoyée est relue dans la base au
// moment de l'envoi (pièces obligatoires à fournir, à corriger ou expirées) : rien ne vient du navigateur.

const inputSchema = z.object({
  caseId: z.uuid(),
  /** Identifiant tiré au sort à l'ouverture de la confirmation : un double clic n'envoie qu'un e-mail. */
  requestId: z.uuid(),
});

export async function sendMissingDocumentsEmailAction(raw: { caseId: string; requestId: string }): Promise<FormState> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { message: "Dossier introuvable." };
  const { caseId, requestId } = parsed.data;
  if (!emailSendingEnabled()) return { message: "L'envoi direct des e-mails n'est pas encore activé sur SELECT Agency." };

  const ctx = await getAgencyContext();
  if (!allowed(ctx, "operations.write")) return { message: forbiddenMessage(ctx, "operations.write") };

  const { data: outboxId, error } = await ctx.supabase.rpc("queue_missing_documents_email", { p_case_id: caseId, p_request_id: requestId });
  if (error) return { message: dbMessage(error) };
  if (!outboxId) return { message: "Cette relance a déjà été demandée : consultez l'onglet « Communications »." };

  const { data: row } = await ctx.supabase.from("email_outbox").select("recipient_email").eq("id", outboxId as string).maybeSingle();
  await flushAgencyEmailOutbox(ctx, 5);
  refresh();
  return outboxResultMessage(ctx, outboxId as string, "Relance des pièces manquantes", (row?.recipient_email as string | undefined) ?? "le client");
}
