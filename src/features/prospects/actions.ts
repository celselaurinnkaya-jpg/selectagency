"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { allowed, forbiddenMessage } from "@/lib/auth/permissions";
import { readAgency } from "@/lib/data/agency";
import { dbMessage } from "@/lib/data/errors";
import { clientToRow } from "@/lib/data/rows";
import { CLIENT_SOURCE } from "@/lib/domain/labels";
import { activeMembers } from "@/lib/domain/members";
import type { ClientSource } from "@/lib/domain/types";
import type { FormState } from "@/lib/form-state";
import { localDateTimeToIso } from "@/lib/period";
import { duplicateLabel, findDuplicates } from "@/features/clients/duplicates";
import { toE164 } from "@/features/clients/phone";
import { applyClientPartner, resolvePartnerCode } from "@/features/partners/link";

// Prospects : fiche légère d'un premier contact (table clients, statut « prospect »). La même fiche
// devient client par convert_prospect, ou d'elle-même au premier dossier ou à l'ajout à un service.
// Une relance est une tâche liée à la fiche, confiée au conseiller : elle apparaît dans Tâches et
// dans « À traiter aujourd'hui » le jour venu.

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const prospectSchema = z.object({
  firstName: z.string().trim().min(1, "Indiquez le prénom.").max(80),
  lastName: z.string().trim().min(1, "Indiquez le nom.").max(80),
  phone: z.string().trim().min(6, "Indiquez le numéro de téléphone."),
  whatsapp: z.string().trim().max(40).optional(),
  email: z.union([z.literal(""), z.email("Adresse e-mail invalide.")]).optional(),
  residenceCountry: z.string().trim().min(1, "Choisissez le pays.").max(80),
  city: z.string().trim().max(80).optional(),
  source: z.enum(Object.keys(CLIENT_SOURCE) as [ClientSource, ...ClientSource[]], { error: "Indiquez d'où vient le contact." }),
  sourceDetail: z.string().trim().max(120).optional(),
  campaign: z.string().trim().max(120, "La campagne est limitée à 120 caractères.").optional(),
  serviceMotive: z.string().max(40).optional(),
  assignedTo: z.string().min(1, "Choisissez le conseiller."),
  notes: z.string().trim().max(2000).optional(),
  followUpDate: z.union([z.literal(""), z.string().regex(DAY, "Date invalide.")]).optional(),
  partnerCode: z.string().trim().max(20).optional(),
  confirmDuplicate: z.boolean().optional(),
});

export type ProspectInput = z.input<typeof prospectSchema>;

export async function saveProspectAction(raw: ProspectInput): Promise<FormState> {
  const parsed = prospectSchema.safeParse(raw);
  if (!parsed.success) return { message: "Certains champs sont à corriger.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const input = parsed.data;
  const phoneE164 = toE164(input.phone, input.residenceCountry);
  if (!phoneE164) return { message: "Certains champs sont à corriger.", fieldErrors: { phone: ["Numéro invalide pour le pays choisi. Exemple : +237 6 99 00 00 00."] } };
  const whatsappE164 = input.whatsapp ? toE164(input.whatsapp, input.residenceCountry) : undefined;
  if (input.whatsapp && !whatsappE164) return { message: "Certains champs sont à corriger.", fieldErrors: { whatsapp: ["Numéro WhatsApp invalide."] } };

  const { data, ctx } = await readAgency({ clients: true });
  if (!allowed(ctx, "operations.write")) return { message: forbiddenMessage(ctx, "operations.write") };
  if (!activeMembers(data.members).some((m) => m.id === input.assignedTo)) return { message: "Le conseiller choisi n'existe pas." };
  const partner = await resolvePartnerCode(ctx, input.partnerCode);
  if ("error" in partner) return { message: "Certains champs sont à corriger.", fieldErrors: { partnerCode: [partner.error] } };

  // Même contrôle que pour un client : on signale, on ne fusionne jamais automatiquement.
  const duplicates = findDuplicates(data.clients, { ...input, phoneE164, email: input.email || undefined });
  if (duplicates.length > 0 && !input.confirmDuplicate) {
    return {
      message: "Cette personne semble déjà connue de l'agence. Vérifiez avant de créer une nouvelle fiche.",
      duplicates: duplicates.map((d) => ({ id: d.client.id, label: duplicateLabel(d.client), reasons: d.reasons })),
    };
  }

  const fields = clientToRow({
    clientType: input.serviceMotive === "study_abroad" ? "student" : "individual",
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email || undefined,
    phoneE164,
    whatsappE164: whatsappE164 ?? undefined,
    residenceCountry: input.residenceCountry,
    city: input.city ?? "",
    preferredLanguage: "fr",
    assignedTo: input.assignedTo,
    notes: input.notes || undefined,
    serviceMotive: input.serviceMotive || undefined,
    source: input.source,
    sourceDetail: input.sourceDetail || undefined,
    campaign: input.campaign || undefined,
  });
  const { data: row, error } = await ctx.supabase
    .from("clients")
    .insert({ ...fields, organization_id: ctx.organizationId, is_demo_fixture: false, status: "prospect" })
    .select("id, reference")
    .single();
  if (error) return { message: dbMessage(error) };
  const id = String(row.id);
  // L'historique (« Prospect … enregistré (origine : …) ») est écrit par la base.
  const partnerError = await applyClientPartner(ctx, id, undefined, partner.partnerId);
  if (partnerError) return { message: `Le prospect est enregistré, mais pas son partenaire : ${partnerError}`, redirectTo: `/clients/${id}` };

  if (input.followUpDate) {
    const { error: taskError } = await ctx.supabase.from("tasks").insert({
      organization_id: ctx.organizationId,
      title: `Relancer ${input.firstName} ${input.lastName}`,
      assigned_to: input.assignedTo,
      due_at: localDateTimeToIso(input.followUpDate, "09:00", data.agency.timezone),
      priority: "normal",
      status: "todo",
      client_id: id,
    });
    if (taskError) return { message: dbMessage(taskError, "Le prospect est enregistré, mais pas sa relance : planifiez-la depuis sa fiche."), redirectTo: `/clients/${id}` };
  }
  return { ok: true, redirectTo: `/clients/${id}?ok=prospect-cree` };
}

/** « Transformer en client » : la même fiche, avec tout son historique (aucune copie). */
export async function convertProspectAction(clientId: string): Promise<FormState> {
  if (!z.uuid().safeParse(clientId).success) return { message: "Fiche introuvable." };
  const { data, ctx } = await readAgency({ clients: (q) => q.eq("id", clientId) });
  if (!allowed(ctx, "operations.write")) return { message: forbiddenMessage(ctx, "operations.write") };
  const client = data.clients[0];
  if (!client) return { message: "Fiche introuvable." };
  const { error } = await ctx.supabase.rpc("convert_prospect", { p_client_id: client.id, p_event: `Prospect devenu client (fiche ${client.reference}).` });
  if (error) return { message: dbMessage(error) };
  refresh();
  return { ok: true, message: `${client.firstName} ${client.lastName} est maintenant client de l'agence. Son historique est conservé.` };
}

const followUpSchema = z.object({
  clientId: z.uuid(),
  date: z.string().regex(DAY, "Choisissez la date de la relance."),
  time: z.union([z.literal(""), z.string().regex(/^\d{2}:\d{2}$/)]).optional(),
  title: z.string().trim().max(160).optional(),
});

/** Relance d'un prospect (ou d'un client) : tâche datée, confiée à son conseiller. */
export async function scheduleFollowUpAction(raw: z.input<typeof followUpSchema>): Promise<FormState> {
  const parsed = followUpSchema.safeParse(raw);
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Certains champs sont à corriger.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const input = parsed.data;
  const { data, ctx } = await readAgency({ clients: (q) => q.eq("id", input.clientId) });
  if (!allowed(ctx, "operations.write")) return { message: forbiddenMessage(ctx, "operations.write") };
  const client = data.clients[0];
  if (!client) return { message: "Fiche introuvable." };
  const title = input.title && input.title.length >= 3 ? input.title : `Relancer ${client.firstName} ${client.lastName}`;
  const { error } = await ctx.supabase.from("tasks").insert({
    organization_id: ctx.organizationId,
    title,
    assigned_to: activeMembers(data.members).some((m) => m.id === client.assignedTo) ? client.assignedTo : ctx.member.id,
    due_at: localDateTimeToIso(input.date, input.time || "09:00", data.agency.timezone),
    priority: "normal",
    status: "todo",
    client_id: client.id,
  });
  if (error) return { message: dbMessage(error) };
  refresh();
  return { ok: true, message: "Relance planifiée : elle apparaîtra dans les tâches et dans « À traiter aujourd'hui » le jour venu." };
}
