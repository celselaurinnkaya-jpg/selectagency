"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getAgencyContext } from "@/lib/auth/context";
import { allowed, forbiddenMessage } from "@/lib/auth/permissions";
import { dbMessage } from "@/lib/data/errors";
import { formValues, type FormState } from "@/lib/form-state";

// Bureaux de l'agence : la base revérifie le rôle, la limite de la formule et l'appartenance à l'agence
// (save_bureau, set_bureau_archived, set_member_bureaux, set_bureau_restriction).

const bureauSchema = z.object({
  bureauId: z.union([z.literal(""), z.uuid()]).optional(),
  name: z.string().trim().min(2, "Indiquez le nom du bureau.").max(80),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,5}$/, "De 2 à 5 lettres ou chiffres, par exemple DLA."),
  city: z.string().trim().max(80).optional(),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide.").optional(),
  address: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.union([z.literal(""), z.email("Adresse e-mail invalide.")]).optional(),
});

export async function saveBureauAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = bureauSchema.safeParse(values);
  if (!parsed.success) return { message: "Certains champs sont à corriger.", fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "settings.manage")) return { message: forbiddenMessage(ctx, "settings.manage"), values };
  const v = parsed.data;
  const { error } = await ctx.supabase.rpc("save_bureau", {
    p_org: ctx.organizationId,
    p_id: v.bureauId || null,
    p_name: v.name,
    p_code: v.code,
    p_city: v.city ?? "",
    p_color: v.color ?? "#023764",
    p_address: v.address ?? "",
    p_phone: v.phone ?? "",
    p_email: v.email ?? "",
  });
  if (error) return { message: dbMessage(error), values };
  refresh();
  return { ok: true, message: v.bureauId ? "Bureau mis à jour." : "Bureau créé. Rattachez-y les membres de l'équipe ci-dessous." };
}

export async function setBureauArchivedAction(bureauId: string, archived: boolean): Promise<FormState> {
  if (!z.uuid().safeParse(bureauId).success) return { message: "Bureau introuvable." };
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "settings.manage")) return { message: forbiddenMessage(ctx, "settings.manage") };
  const { error } = await ctx.supabase.rpc("set_bureau_archived", { p_id: bureauId, p_archived: archived });
  if (error) return { message: dbMessage(error) };
  refresh();
  return { ok: true, message: archived ? "Bureau fermé : ses clients et ses paiements gardent leur bureau." : "Bureau rouvert." };
}

export async function setMemberBureauxAction(memberId: string, bureauIds: string[]): Promise<FormState> {
  if (!z.uuid().safeParse(memberId).success || !bureauIds.every((id) => z.uuid().safeParse(id).success)) return { message: "Membre ou bureau introuvable." };
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "settings.manage")) return { message: forbiddenMessage(ctx, "settings.manage") };
  const { error } = await ctx.supabase.rpc("set_member_bureaux", { p_member_id: memberId, p_bureau_ids: bureauIds });
  if (error) return { message: dbMessage(error) };
  refresh();
  return { ok: true, message: "Bureaux du membre enregistrés." };
}

export async function setBureauRestrictionAction(on: boolean): Promise<FormState> {
  const ctx = await getAgencyContext();
  if (ctx.member.role !== "owner" || !ctx.writable) return { message: "Seul le propriétaire de l'agence choisit qui voit les clients de chaque bureau." };
  const { error } = await ctx.supabase.rpc("set_bureau_restriction", { p_org: ctx.organizationId, p_on: on });
  if (error) return { message: dbMessage(error) };
  refresh();
  return {
    ok: true,
    message: on
      ? "Visibilité par bureau activée : conseillers, comptables et lectures seules ne voient plus que les clients de leurs bureaux."
      : "Visibilité par bureau désactivée : chacun voit les clients de tous les bureaux.",
  };
}
