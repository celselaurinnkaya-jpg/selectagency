"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAgencyContext } from "@/lib/auth/context";
import { dbMessage } from "@/lib/data/errors";
import { formValues, type FormState } from "@/lib/form-state";

// Support : écrire à l'équipe SELECT reste possible même quand l'agence est en lecture seule.

const ticketSchema = z.object({
  subject: z.string().trim().min(3, "Résumez votre demande en quelques mots.").max(160),
  category: z.enum(["question", "problem", "billing", "account", "suggestion"], { error: "Choisissez le sujet." }),
  body: z.string().trim().min(10, "Décrivez votre demande (au moins quelques mots).").max(4000, "4 000 caractères au plus."),
});

export async function createTicketAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = ticketSchema.safeParse(values);
  if (!parsed.success) return { message: "Certains champs sont à corriger.", fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  const ctx = await getAgencyContext();
  const { data, error } = await ctx.supabase.rpc("create_support_ticket", {
    p_subject: parsed.data.subject,
    p_category: parsed.data.category,
    p_body: parsed.data.body,
  });
  if (error) return { message: dbMessage(error), values };
  redirect(`/support/${(data as { id: string }).id}?ok=envoyee`);
}

const replySchema = z.object({
  ticketId: z.uuid(),
  body: z.string().trim().min(1, "Écrivez votre message.").max(4000, "4 000 caractères au plus."),
});

export async function replyTicketAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = replySchema.safeParse(values);
  if (!parsed.success) return { message: "Certains champs sont à corriger.", fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  const ctx = await getAgencyContext();
  const { error } = await ctx.supabase.rpc("reply_support_ticket", { p_ticket_id: parsed.data.ticketId, p_body: parsed.data.body });
  if (error) return { message: dbMessage(error), values };
  refresh();
  return { ok: true, message: "Message transmis à l'équipe SELECT." };
}

export async function resolveTicketAction(formData: FormData): Promise<void> {
  const id = z.uuid().safeParse(formData.get("ticketId"));
  if (!id.success) return;
  const ctx = await getAgencyContext();
  await ctx.supabase.rpc("resolve_support_ticket", { p_ticket_id: id.data });
  refresh();
}
