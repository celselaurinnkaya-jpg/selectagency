"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getAgencyContext } from "@/lib/auth/context";
import { allowed, forbiddenMessage } from "@/lib/auth/permissions";
import { dbMessage } from "@/lib/data/errors";
import { CURRENCY_OPTIONS } from "@/lib/format";
import type { FormState } from "@/lib/form-state";
import { parseAmount } from "@/features/finance/payments";

// Services de l'agence : la base vérifie le rôle, l'agence, les doublons et la cohérence client/dossier,
// et note chaque changement dans l'historique du client (fonctions save_service, add_service_client…).

const serviceSchema = z.object({
  serviceId: z.union([z.literal(""), z.uuid()]),
  name: z.string().trim().min(2, "Donnez un nom au service (2 caractères au moins).").max(80, "Nom trop long (80 caractères au plus)."),
  description: z.string().trim().max(500, "Description trop longue (500 caractères au plus)."),
  price: z.string().trim(),
  currency: z.enum(CURRENCY_OPTIONS.map((c) => c.code) as [string, ...string[]], { error: "Devise non prise en charge." }),
  isActive: z.boolean(),
});

export type ServiceInput = z.input<typeof serviceSchema>;

// Comme pour les factures : l'action renvoie l'adresse et le formulaire la charge entièrement (une
// navigation interne vers une page déjà gardée en mémoire peut rester sur le squelette de chargement).
export async function saveServiceAction(input: ServiceInput): Promise<FormState> {
  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
    return { message: Object.values(fieldErrors).flat()[0] ?? "Certains champs sont à corriger.", fieldErrors };
  }
  const v = parsed.data;
  let price: number | null = null;
  if (v.price) {
    price = parseAmount(v.price, v.currency);
    if (!price) return { message: `Tarif invalide en ${v.currency}.`, fieldErrors: { price: ["Montant invalide."] } };
  }

  const ctx = await getAgencyContext();
  if (!allowed(ctx, "services.manage")) return { message: forbiddenMessage(ctx, "services.manage") };
  const { data, error } = await ctx.supabase.rpc("save_service", {
    p_organization_id: ctx.organizationId,
    p_service_id: v.serviceId || null,
    p_name: v.name,
    p_description: v.description,
    p_price_minor: price,
    p_currency: price ? v.currency : null,
    p_is_active: v.isActive,
  });
  if (error) {
    const message = dbMessage(error);
    return { message, fieldErrors: /s'appelle déjà/.test(message) ? { name: ["Nom déjà utilisé."] } : undefined };
  }
  return { ok: true, redirectTo: `/services/${String(data)}?ok=${v.serviceId ? "service-modifie" : "service-cree"}` };
}

export async function deleteServiceAction(id: string): Promise<FormState> {
  const serviceId = z.uuid().safeParse(id);
  if (!serviceId.success) return { message: "Service introuvable." };
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "services.manage")) return { message: forbiddenMessage(ctx, "services.manage") };
  const { error } = await ctx.supabase.rpc("delete_service", { p_service_id: serviceId.data });
  if (error) return { message: dbMessage(error) };
  return { ok: true, redirectTo: "/services?ok=service-supprime" };
}

const STATUSES = ["in_progress", "waiting_client", "waiting_external", "completed", "cancelled"] as const;

const linkSchema = z.object({
  serviceId: z.uuid({ error: "Choisissez un service." }),
  clientId: z.uuid({ error: "Choisissez un client." }),
  caseId: z.union([z.literal(""), z.uuid()]),
  status: z.enum(STATUSES, { error: "État de suivi inconnu." }),
  note: z.string().trim().max(500, "Remarque trop longue (500 caractères au plus)."),
});

export type ServiceClientInput = z.input<typeof linkSchema>;

function invalid(error: z.ZodError): FormState {
  const fieldErrors = z.flattenError(error).fieldErrors as Record<string, string[] | undefined>;
  return { message: Object.values(fieldErrors).flat()[0] ?? "Certains champs sont à corriger.", fieldErrors };
}

export async function addServiceClientAction(input: ServiceClientInput): Promise<FormState> {
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const v = parsed.data;
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "operations.write")) return { message: forbiddenMessage(ctx, "operations.write") };
  const { error } = await ctx.supabase.rpc("add_service_client", {
    p_service_id: v.serviceId,
    p_client_id: v.clientId,
    p_case_id: v.caseId || null,
    p_status: v.status,
    p_note: v.note,
  });
  if (error) return { message: dbMessage(error) };
  refresh();
  return { ok: true, message: "Client ajouté au service." };
}

const updateSchema = linkSchema.omit({ serviceId: true, clientId: true }).extend({ linkId: z.uuid() });

export async function updateServiceClientAction(input: z.input<typeof updateSchema>): Promise<FormState> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const v = parsed.data;
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "operations.write")) return { message: forbiddenMessage(ctx, "operations.write") };
  const { error } = await ctx.supabase.rpc("update_service_client", {
    p_id: v.linkId,
    p_status: v.status,
    p_case_id: v.caseId || null,
    p_note: v.note,
  });
  if (error) return { message: dbMessage(error) };
  refresh();
  return { ok: true, message: "Suivi mis à jour." };
}

export async function removeServiceClientAction(linkId: string): Promise<FormState> {
  const id = z.uuid().safeParse(linkId);
  if (!id.success) return { message: "Suivi introuvable." };
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "operations.write")) return { message: forbiddenMessage(ctx, "operations.write") };
  const { error } = await ctx.supabase.rpc("remove_service_client", { p_id: id.data });
  if (error) return { message: dbMessage(error) };
  refresh();
  return { ok: true, message: "Client retiré du service." };
}
