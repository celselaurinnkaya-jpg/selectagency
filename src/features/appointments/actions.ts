"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { allowed, forbiddenMessage } from "@/lib/auth/permissions";
import { readAgency } from "@/lib/data/agency";
import { dbMessage } from "@/lib/data/errors";
import { APPOINTMENT_KIND } from "@/lib/domain/labels";
import { activeMembers } from "@/lib/domain/members";
import type { AppointmentKind, AppointmentStatus } from "@/lib/domain/types";
import { formatDate } from "@/lib/format";
import { formValues, type FormState } from "@/lib/form-state";
import { localDateTimeToIso } from "@/lib/period";

// Rendez-vous et échéances. Règle de l'application : un rendez-vous administratif (consulat, centre
// de dépôt…) n'est « confirmé » qu'avec la référence de sa preuve de réservation. SELECT Agency ne
// réserve rien auprès des organismes : l'agence le fait, puis l'enregistre ici.
// Chaque modification ou suppression vérifie qu'une ligne a bien été touchée : la RLS filtre sans
// erreur, et l'écran ne doit jamais annoncer un changement qui n'a pas eu lieu.

const KINDS = Object.keys(APPOINTMENT_KIND) as [AppointmentKind, ...AppointmentKind[]];
const time = z.union([z.literal(""), z.string().regex(/^\d{2}:\d{2}$/, "Heure invalide.")]).optional();

const appointmentSchema = z.object({
  title: z.string().trim().min(1, "Indiquez l'objet du rendez-vous.").max(160),
  kind: z.enum(KINDS, { error: "Choisissez le type." }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choisissez la date."),
  startTime: time,
  endTime: time,
  location: z.string().trim().max(200).optional(),
  assignedTo: z.string().min(1, "Choisissez la personne responsable."),
  caseId: z.string().optional(),
  status: z.enum(["planned", "awaiting_confirmation", "confirmed", "done", "cancelled"]),
  externalReference: z.string().trim().max(120).optional(),
});

type AppointmentInput = z.infer<typeof appointmentSchema>;

const PROOF_MESSAGE = "Un rendez-vous administratif n'est confirmé qu'avec la référence de la preuve de réservation.";
const NOT_FOUND = "Rendez-vous introuvable, ou vous n'avez pas le droit de le modifier.";

/** Contrôles communs à la création et à la modification ; renvoie les erreurs par champ. */
function checkInput(input: AppointmentInput): Record<string, string[]> | null {
  if (input.kind === "administrative" && input.status === "confirmed" && !input.externalReference) {
    return { externalReference: [PROOF_MESSAGE] };
  }
  if (input.endTime && (!input.startTime || input.endTime <= input.startTime)) {
    return { endTime: ["L'heure de fin doit suivre l'heure de début."] };
  }
  return null;
}

/** Colonnes écrites à partir de la saisie (dates lues dans le fuseau de l'agence). */
function toColumns(input: AppointmentInput, timezone: string) {
  return {
    kind: input.kind,
    title: input.title,
    starts_at: localDateTimeToIso(input.date, input.startTime || "00:00", timezone),
    ends_at: input.endTime ? localDateTimeToIso(input.date, input.endTime, timezone) : null,
    all_day: !input.startTime,
    location: input.location || null,
    assigned_to: input.assignedTo,
    status: input.status as AppointmentStatus,
    external_reference: input.externalReference || null,
  };
}

const when = (input: AppointmentInput, timezone: string) =>
  formatDate(localDateTimeToIso(input.date, input.startTime || "00:00", timezone), timezone, input.startTime ? "dateTime" : "date");

export async function createAppointmentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = appointmentSchema.safeParse(values);
  if (!parsed.success) return { message: "Certains champs sont à corriger.", fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  const input = parsed.data;
  const fieldErrors = checkInput(input);
  if (fieldErrors) return { message: "Certains champs sont à corriger.", fieldErrors, values };

  const { data, ctx } = await readAgency(input.caseId ? { cases: (q) => q.eq("id", input.caseId!) } : {});
  if (!allowed(ctx, "operations.write")) return { message: forbiddenMessage(ctx, "operations.write"), values };
  if (!activeMembers(data.members).some((m) => m.id === input.assignedTo)) return { message: "Responsable introuvable.", values };
  const travelCase = data.cases[0];
  if (input.caseId && !travelCase) return { message: "Dossier introuvable.", values };
  const tz = data.agency.timezone;

  const { error } = await ctx.supabase.from("appointments").insert({
    organization_id: ctx.organizationId,
    case_id: travelCase?.id ?? null,
    client_id: travelCase?.clientId ?? null,
    ...toColumns(input, tz),
  });
  if (error) return { message: dbMessage(error), values };
  if (travelCase) {
    await ctx.supabase.from("activity_events").insert({
      organization_id: ctx.organizationId,
      actor_id: ctx.member.id,
      client_id: travelCase.clientId,
      case_id: travelCase.id,
      text: `Rendez-vous programmé : ${input.title} (${APPOINTMENT_KIND[input.kind]}, ${when(input, tz)}).`,
    });
  }
  refresh();
  return { ok: true, message: "Rendez-vous programmé." };
}

export async function updateAppointmentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const appointmentId = z.uuid().safeParse(values.appointmentId);
  const parsed = appointmentSchema.safeParse(values);
  if (!appointmentId.success) return { message: NOT_FOUND, values };
  if (!parsed.success) return { message: "Certains champs sont à corriger.", fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  const input = parsed.data;
  const fieldErrors = checkInput(input);
  if (fieldErrors) return { message: "Certains champs sont à corriger.", fieldErrors, values };

  const { data, ctx } = await readAgency({ appointments: (q) => q.eq("id", appointmentId.data) });
  if (!allowed(ctx, "operations.write")) return { message: forbiddenMessage(ctx, "operations.write"), values };
  const appointment = data.appointments[0];
  if (!appointment) return { message: NOT_FOUND, values };
  if (!activeMembers(data.members).some((m) => m.id === input.assignedTo)) return { message: "Responsable introuvable.", values };
  const tz = data.agency.timezone;

  const { data: updated, error } = await ctx.supabase
    .from("appointments")
    .update(toColumns(input, tz))
    .eq("id", appointment.id)
    .eq("organization_id", ctx.organizationId)
    .select("id");
  if (error) return { message: dbMessage(error), values };
  if (!updated?.length) return { message: NOT_FOUND, values };
  if (appointment.caseId) {
    await ctx.supabase.from("activity_events").insert({
      organization_id: ctx.organizationId,
      actor_id: ctx.member.id,
      client_id: appointment.clientId ?? null,
      case_id: appointment.caseId,
      text: `Rendez-vous modifié : ${input.title} (${APPOINTMENT_KIND[input.kind]}, ${when(input, tz)}).`,
    });
  }
  refresh();
  return { ok: true, message: "Rendez-vous modifié." };
}

export async function deleteAppointmentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const appointmentId = z.uuid().safeParse(formData.get("appointmentId"));
  if (!appointmentId.success) return { message: NOT_FOUND };
  const { data, ctx } = await readAgency({ appointments: (q) => q.eq("id", appointmentId.data) });
  if (!allowed(ctx, "operations.write")) return { message: forbiddenMessage(ctx, "operations.write") };
  const appointment = data.appointments[0];
  if (!appointment) return { message: NOT_FOUND };

  const { data: deleted, error } = await ctx.supabase
    .from("appointments")
    .delete()
    .eq("id", appointment.id)
    .eq("organization_id", ctx.organizationId)
    .select("id");
  if (error) return { message: dbMessage(error) };
  if (!deleted?.length) return { message: NOT_FOUND };
  if (appointment.caseId) {
    await ctx.supabase.from("activity_events").insert({
      organization_id: ctx.organizationId,
      actor_id: ctx.member.id,
      client_id: appointment.clientId ?? null,
      case_id: appointment.caseId,
      text: `Rendez-vous supprimé : ${appointment.title} (${formatDate(appointment.startsAt, data.agency.timezone, appointment.allDay ? "date" : "dateTime")}).`,
    });
  }
  refresh();
  return { ok: true, message: "Rendez-vous supprimé." };
}
