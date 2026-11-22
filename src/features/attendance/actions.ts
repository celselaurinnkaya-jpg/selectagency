"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getAgencyContext } from "@/lib/auth/context";
import { allowed, forbiddenMessage } from "@/lib/auth/permissions";
import { dbMessage } from "@/lib/data/errors";
import type { FormState } from "@/lib/form-state";
import { localDateTimeToIso } from "@/lib/period";

// Présences. Les heures « pointées » sont celles du serveur, au moment de l'appel : l'application n'envoie aucune
// heure. Seules les déclarations d'oubli et les corrections portent une heure saisie, toujours marquée comme telle.

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;
const optionalTime = z.union([z.literal(""), z.string().regex(TIME, "Heure invalide.")]).optional();
const invalid = (error: z.ZodError): FormState => ({
  message: error.issues[0]?.message ?? "Certains champs sont à corriger.",
  fieldErrors: z.flattenError(error).fieldErrors,
});

export async function clockInAction(): Promise<FormState> {
  const ctx = await getAgencyContext();
  const { error } = await ctx.supabase.rpc("clock_in", { p_organization_id: ctx.organizationId });
  if (error) return { message: dbMessage(error) };
  refresh();
  return { ok: true, message: "Arrivée pointée." };
}

export async function clockOutAction(): Promise<FormState> {
  const ctx = await getAgencyContext();
  const { error } = await ctx.supabase.rpc("clock_out", { p_organization_id: ctx.organizationId });
  if (error) return { message: dbMessage(error) };
  refresh();
  return { ok: true, message: "Départ pointé. Bonne fin de journée !" };
}

const declareSchema = z.object({
  entryId: z.union([z.literal(""), z.uuid()]).optional(),
  date: z.string().regex(DAY, "Choisissez le jour."),
  arrivalTime: optionalTime,
  departureTime: optionalTime,
  reason: z.string().trim().min(3, "Indiquez la raison de l'oubli.").max(300, "La raison est limitée à 300 caractères."),
});

/** Le membre déclare une heure oubliée (départ d'une présence, ou arrivée avec son départ). */
export async function declareAttendanceAction(raw: z.input<typeof declareSchema>): Promise<FormState> {
  const parsed = declareSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;
  const ctx = await getAgencyContext();
  const tz = ctx.agency.timezone;
  if (!input.entryId && !input.arrivalTime) return { message: "Indiquez l'heure d'arrivée.", fieldErrors: { arrivalTime: ["Heure d'arrivée manquante."] } };
  if (input.entryId && !input.departureTime) return { message: "Indiquez l'heure de départ.", fieldErrors: { departureTime: ["Heure de départ manquante."] } };
  const { error } = await ctx.supabase.rpc("declare_attendance", {
    p_organization_id: ctx.organizationId,
    p_entry_id: input.entryId || null,
    p_arrived_at: input.arrivalTime ? localDateTimeToIso(input.date, input.arrivalTime, tz) : null,
    p_left_at: input.departureTime ? localDateTimeToIso(input.date, input.departureTime, tz) : null,
    p_reason: input.reason,
  });
  if (error) return { message: dbMessage(error) };
  refresh();
  return { ok: true, message: "Heure déclarée. Elle apparaît « déclarée après coup » pour les responsables." };
}

const correctSchema = z.object({
  entryId: z.union([z.literal(""), z.uuid()]).optional(),
  memberId: z.union([z.literal(""), z.uuid()]).optional(),
  date: z.string().regex(DAY, "Choisissez le jour."),
  arrivalTime: z.string().regex(TIME, "Indiquez l'heure d'arrivée."),
  departureTime: optionalTime,
  reason: z.string().trim().min(3, "Indiquez la raison de la correction.").max(300, "La raison est limitée à 300 caractères."),
});

/** Le propriétaire ou un administrateur corrige une présence, ou en ajoute une pour un membre. */
export async function correctAttendanceAction(raw: z.input<typeof correctSchema>): Promise<FormState> {
  const parsed = correctSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "attendance.manage")) return { message: forbiddenMessage(ctx, "attendance.manage") };
  if (!input.entryId && !input.memberId) return { message: "Choisissez le membre.", fieldErrors: { memberId: ["Membre manquant."] } };
  const tz = ctx.agency.timezone;
  const { error } = await ctx.supabase.rpc("correct_attendance", {
    p_organization_id: ctx.organizationId,
    p_entry_id: input.entryId || null,
    p_member_id: input.memberId || null,
    p_arrived_at: localDateTimeToIso(input.date, input.arrivalTime, tz),
    p_left_at: input.departureTime ? localDateTimeToIso(input.date, input.departureTime, tz) : null,
    p_reason: input.reason,
  });
  if (error) return { message: dbMessage(error) };
  refresh();
  return { ok: true, message: input.entryId ? "Présence corrigée." : "Présence ajoutée." };
}

const settingsSchema = z.object({
  expectedStart: z.string().regex(TIME, "Heure d'arrivée invalide."),
  expectedEnd: z.string().regex(TIME, "Heure de départ invalide."),
  workDays: z.array(z.number().int().min(1).max(7)).min(1, "Choisissez au moins un jour travaillé."),
  graceMinutes: z.number().int("La tolérance est un nombre entier de minutes.").min(0).max(120, "La tolérance va de 0 à 120 minutes."),
});

export async function saveAttendanceSettingsAction(raw: z.input<typeof settingsSchema>): Promise<FormState> {
  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "attendance.manage")) return { message: forbiddenMessage(ctx, "attendance.manage") };
  const { error } = await ctx.supabase.rpc("save_attendance_settings", {
    p_organization_id: ctx.organizationId,
    p_expected_start: input.expectedStart,
    p_expected_end: input.expectedEnd,
    p_work_days: input.workDays,
    p_grace_minutes: input.graceMinutes,
  });
  if (error) return { message: dbMessage(error) };
  refresh();
  return { ok: true, message: "Horaires enregistrés." };
}

/** Membres dispensés de pointage (propriétaire et administrateurs ; la base revérifie). */
export async function saveAttendanceExemptionsAction(memberIds: string[]): Promise<FormState> {
  const ids = z.array(z.uuid()).max(500).safeParse(memberIds);
  if (!ids.success) return { message: "Membre introuvable." };
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "attendance.manage")) return { message: forbiddenMessage(ctx, "attendance.manage") };
  const { error } = await ctx.supabase.rpc("save_attendance_exemptions", { p_organization_id: ctx.organizationId, p_member_ids: ids.data });
  if (error) return { message: dbMessage(error) };
  refresh();
  return { ok: true, message: "Choix enregistré : les membres dispensés ne sont plus comptés absents." };
}
