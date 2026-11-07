"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getAgencyContext } from "@/lib/auth/context";
import { allowed, forbiddenMessage } from "@/lib/auth/permissions";
import { readAgency } from "@/lib/data/agency";
import { dbMessage } from "@/lib/data/errors";
import { activeMembers } from "@/lib/domain/members";
import type { FormState } from "@/lib/form-state";
import { localDateTimeToIso } from "@/lib/period";

// Échanges avec les clients et prospects. SELECT n'envoie rien à leur place : l'agent écrit sur WhatsApp,
// Messenger ou appelle lui-même, puis note l'échange. Le journal dit « préparé » ou « noté », jamais « envoyé ».

const UUID = z.uuid();
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

/** Fiche (et dossier) de l'agence, sinon null. */
async function ownedClient(clientId: string, caseId?: string) {
  const { data, ctx } = await readAgency(
    caseId ? { clients: (q) => q.eq("id", clientId), cases: (q) => q.eq("id", caseId).eq("client_id", clientId) } : { clients: (q) => q.eq("id", clientId) },
  );
  const client = data.clients[0];
  if (!client || (caseId && !data.cases[0])) return null;
  return { data, ctx, client };
}

/**
 * Journalise un message WhatsApp préparé. L'envoi reste manuel : l'agent l'envoie lui-même
 * depuis WhatsApp. Le journal indique donc « préparé », jamais « envoyé » ni « délivré ».
 */
export async function logPreparedMessageAction(input: { clientId: string; caseId?: string; summary: string }): Promise<void> {
  if (!UUID.safeParse(input.clientId).success || (input.caseId && !UUID.safeParse(input.caseId).success)) return;
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "operations.write")) return;
  const owned = await ownedClient(input.clientId, input.caseId);
  if (!owned) return;
  await ctx.supabase.from("communication_logs").insert({
    organization_id: ctx.organizationId,
    client_id: input.clientId,
    case_id: input.caseId ?? null,
    channel: "whatsapp",
    direction: "outbound",
    status: "prepared_manual",
    summary: `Message préparé : ${input.summary}`.slice(0, 200),
  });
  refresh();
}

const exchangeSchema = z.object({
  clientId: z.uuid(),
  caseId: z.union([z.literal(""), z.uuid()]).optional(),
  channel: z.enum(["whatsapp", "phone", "in_person", "facebook", "instagram", "tiktok", "sms", "email"], "Choisissez le canal."),
  direction: z.enum(["inbound", "outbound"], "Indiquez qui a pris contact."),
  date: z.string().regex(DAY, "Indiquez la date de l'échange."),
  time: z.string().regex(TIME, "Indiquez l'heure de l'échange."),
  summary: z.string().trim().min(3, "Résumez l'échange en quelques mots.").max(1000, "Le résumé est limité à 1 000 caractères."),
  followUpDate: z.union([z.literal(""), z.string().regex(DAY, "Date de relance invalide.")]).optional(),
});

/** Noter un échange (appel, conversation WhatsApp, message Facebook…), et planifier la relance suivante. */
export async function logExchangeAction(raw: z.input<typeof exchangeSchema>): Promise<FormState> {
  const parsed = exchangeSchema.safeParse(raw);
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Certains champs sont à corriger.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const input = parsed.data;
  const owned = await ownedClient(input.clientId, input.caseId || undefined);
  if (!owned) return { message: "Fiche introuvable." };
  const { data, ctx, client } = owned;
  if (!allowed(ctx, "operations.write")) return { message: forbiddenMessage(ctx, "operations.write") };
  const tz = data.agency.timezone;
  const occurredAt = localDateTimeToIso(input.date, input.time, tz);
  if (new Date(occurredAt).getTime() > Date.now() + 10 * 60_000) return { message: "La date de l'échange ne peut pas être dans le futur.", fieldErrors: { date: ["Date dans le futur."] } };

  const { error } = await ctx.supabase.from("communication_logs").insert({
    organization_id: ctx.organizationId,
    client_id: client.id,
    case_id: input.caseId || null,
    channel: input.channel,
    direction: input.direction,
    status: "logged",
    summary: input.summary,
    occurred_at: occurredAt,
  });
  if (error) return { message: dbMessage(error) };

  if (input.followUpDate) {
    const { error: taskError } = await ctx.supabase.from("tasks").insert({
      organization_id: ctx.organizationId,
      title: `Relancer ${client.firstName} ${client.lastName}`,
      assigned_to: activeMembers(data.members).some((m) => m.id === client.assignedTo) ? client.assignedTo : ctx.member.id,
      due_at: localDateTimeToIso(input.followUpDate, "09:00", tz),
      priority: "normal",
      status: "todo",
      client_id: client.id,
    });
    if (taskError) return { message: dbMessage(taskError, "L'échange est noté, mais pas la relance : planifiez-la depuis l'aperçu de la fiche.") };
    refresh();
    return { ok: true, message: "Échange noté, et relance planifiée dans les tâches." };
  }
  refresh();
  return { ok: true, message: "Échange noté dans l'historique des communications." };
}

const noteSchema = z.object({
  clientId: z.uuid(),
  caseId: z.union([z.literal(""), z.uuid()]).optional(),
  text: z.string().trim().min(3, "Écrivez la note.").max(1500, "La note est limitée à 1 500 caractères."),
});

/** Note de suivi : la base la marque « Note ajoutée à la main » dans l'historique (elle ne passe jamais pour un événement). */
export async function addNoteAction(raw: z.input<typeof noteSchema>): Promise<FormState> {
  const parsed = noteSchema.safeParse(raw);
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Certains champs sont à corriger.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const input = parsed.data;
  const owned = await ownedClient(input.clientId, input.caseId || undefined);
  if (!owned) return { message: "Fiche introuvable." };
  const { ctx, client } = owned;
  if (!allowed(ctx, "operations.write")) return { message: forbiddenMessage(ctx, "operations.write") };
  const { error } = await ctx.supabase.from("activity_events").insert({
    organization_id: ctx.organizationId,
    client_id: client.id,
    case_id: input.caseId || null,
    text: input.text,
  });
  if (error) return { message: dbMessage(error) };
  refresh();
  return { ok: true, message: "Note ajoutée à l'historique." };
}

const templateSchema = z.object({
  id: z.union([z.literal(""), z.uuid()]).optional(),
  title: z.string().trim().min(2, "Donnez un nom au modèle (2 caractères au moins).").max(80, "Le nom est limité à 80 caractères."),
  body: z.string().trim().min(5, "Écrivez le texte du modèle.").max(2000, "Le texte est limité à 2 000 caractères."),
  audience: z.enum(["prospect", "client", "any"], "Choisissez pour qui le modèle est proposé."),
  isActive: z.boolean(),
});

/** Créer ou modifier un modèle de message (propriétaire et administrateurs). */
export async function saveMessageTemplateAction(raw: z.input<typeof templateSchema>): Promise<FormState> {
  const parsed = templateSchema.safeParse(raw);
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Certains champs sont à corriger.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const input = parsed.data;
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "settings.manage")) return { message: forbiddenMessage(ctx, "settings.manage") };
  const { error } = await ctx.supabase.rpc("save_message_template", {
    p_organization_id: ctx.organizationId,
    p_id: input.id || null,
    p_title: input.title,
    p_body: input.body,
    p_audience: input.audience,
    p_is_active: input.isActive,
  });
  if (error) return { message: dbMessage(error) };
  refresh();
  return { ok: true, message: input.id ? "Modèle mis à jour." : "Modèle ajouté." };
}

export async function deleteMessageTemplateAction(id: string): Promise<FormState> {
  if (!UUID.safeParse(id).success) return { message: "Modèle introuvable." };
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "settings.manage")) return { message: forbiddenMessage(ctx, "settings.manage") };
  const { error } = await ctx.supabase.rpc("delete_message_template", { p_id: id });
  if (error) return { message: dbMessage(error) };
  refresh();
  return { ok: true, message: "Modèle supprimé." };
}
