"use server";

import { headers } from "next/headers";
import { refresh } from "next/cache";
import { z } from "zod";
import { getAgencyContext } from "@/lib/auth/context";
import { allowed, forbiddenMessage, READ_ONLY_MESSAGE } from "@/lib/auth/permissions";
import { readAgency } from "@/lib/data/agency";
import { dbMessage } from "@/lib/data/errors";
import { ROLE } from "@/lib/domain/labels";
import { activeMembers } from "@/lib/domain/members";
import { formValues, type FormState } from "@/lib/form-state";
import { INVITABLE_ROLES } from "./invitations";

// Invitations : le responsable crée un lien personnel, qu'il transmet lui-même (e-mail, WhatsApp).
// La personne invitée crée son compte avec la même adresse e-mail, puis rejoint l'agence.
// Rôles, retrait et transfert de propriété : fonctions de la base (supabase/migrations/…_equipe.sql),
// qui revérifient le rôle de la personne connectée.

const inviteSchema = z.object({
  email: z.email("Adresse e-mail invalide."),
  role: z.enum(INVITABLE_ROLES, { error: "Choisissez un rôle." }),
  jobTitle: z.string().trim().max(80).optional(),
});

export async function inviteMemberAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = inviteSchema.safeParse({ ...values, email: values.email?.trim().toLowerCase() });
  if (!parsed.success) return { message: "Certains champs sont à corriger.", fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "team.manage")) return { message: forbiddenMessage(ctx, "team.manage"), values };
  // Agrandir l'équipe n'est pas possible en lecture seule (la base refuserait l'invitation).
  if (!ctx.writable) return { message: READ_ONLY_MESSAGE, values };

  const { data: existing } = await ctx.supabase
    .from("members")
    .select("id")
    .eq("organization_id", ctx.organizationId)
    .eq("email", parsed.data.email)
    .is("removed_at", null)
    .limit(1)
    .maybeSingle();
  if (existing) return { message: "Cette personne fait déjà partie de l'équipe.", values };

  const { data: invitation, error } = await ctx.supabase
    .from("invitations")
    .insert({
      organization_id: ctx.organizationId,
      email: parsed.data.email,
      role: parsed.data.role,
      job_title: parsed.data.jobTitle ?? "",
      invited_by: ctx.member.id,
    })
    .select("token")
    .single();
  if (error) return { message: dbMessage(error), values };

  const h = await headers();
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? h.get("origin") ?? "";
  refresh();
  return {
    ok: true,
    message: `Invitation créée pour ${parsed.data.email}. Transmettez-lui ce lien (valable 7 jours) : ${origin}/invite/${invitation.token}`,
    redirectTo: `${origin}/invite/${invitation.token}`,
  };
}

export async function revokeInvitationAction(formData: FormData): Promise<void> {
  const id = z.uuid().safeParse(formData.get("invitationId"));
  if (!id.success) return;
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "team.manage")) return;
  await ctx.supabase.from("invitations").update({ revoked_at: new Date().toISOString() }).eq("id", id.data).eq("organization_id", ctx.organizationId);
  refresh();
}

/** Membre en poste de l'agence, pour composer le texte de l'historique. */
async function teamMember(memberId: string) {
  const { data, ctx } = await readAgency({});
  return { ctx, members: activeMembers(data.members), target: activeMembers(data.members).find((m) => m.id === memberId) };
}

const roleSchema = z.object({
  memberId: z.uuid(),
  role: z.enum(INVITABLE_ROLES, { error: "Choisissez un rôle." }),
});

export async function updateMemberRoleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = roleSchema.safeParse(formValues(formData));
  if (!parsed.success) return { message: "Choisissez un rôle." };
  const { ctx, target } = await teamMember(parsed.data.memberId);
  if (!allowed(ctx, "team.manage")) return { message: forbiddenMessage(ctx, "team.manage") };
  if (!target) return { message: "Membre introuvable." };
  if (target.role === parsed.data.role) return { ok: true, message: "Le rôle est inchangé." };

  const { error } = await ctx.supabase.rpc("update_member_role", {
    p_member_id: target.id,
    p_role: parsed.data.role,
    p_event: `Rôle de ${target.fullName} : ${ROLE[target.role].label} → ${ROLE[parsed.data.role].label}.`,
  });
  if (error) return { message: dbMessage(error) };
  refresh();
  return { ok: true, message: `${target.fullName} a maintenant le rôle « ${ROLE[parsed.data.role].label} ».` };
}

const removeSchema = z.object({
  memberId: z.uuid(),
  heirId: z.uuid({ error: "Choisissez qui reprend son travail en cours." }),
  confirm: z.literal("oui", { error: "Cochez la case pour confirmer le retrait." }),
});

export async function removeMemberAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = removeSchema.safeParse(formValues(formData));
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Certains champs sont à corriger." };
  const { ctx, target, members } = await teamMember(parsed.data.memberId);
  if (!allowed(ctx, "team.manage")) return { message: forbiddenMessage(ctx, "team.manage") };
  const heir = members.find((m) => m.id === parsed.data.heirId);
  if (!target || !heir) return { message: "Membre introuvable." };

  const { error } = await ctx.supabase.rpc("remove_member", {
    p_member_id: target.id,
    p_reassign_to: heir.id,
    p_event: `${target.fullName} ne fait plus partie de l'équipe. Ses clients, dossiers en cours, tâches et rendez-vous à venir sont confiés à ${heir.fullName}.`,
  });
  if (error) return { message: dbMessage(error) };
  refresh();
  return { ok: true, message: `${target.fullName} n'a plus accès à l'agence.` };
}

const transferSchema = z.object({
  memberId: z.uuid(),
  confirm: z.literal("oui", { error: "Cochez la case pour confirmer le transfert." }),
});

export async function transferOwnershipAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = transferSchema.safeParse(formValues(formData));
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Certains champs sont à corriger." };
  const { ctx, target } = await teamMember(parsed.data.memberId);
  if (!allowed(ctx, "team.transfer")) return { message: forbiddenMessage(ctx, "team.transfer") };
  if (!target) return { message: "Membre introuvable." };

  const { error } = await ctx.supabase.rpc("transfer_ownership", {
    p_member_id: target.id,
    p_event: `${ctx.member.fullName} transmet la propriété de l'agence à ${target.fullName}.`,
  });
  if (error) return { message: dbMessage(error) };
  refresh();
  return { ok: true, message: `${target.fullName} est maintenant propriétaire de l'agence. Vous restez administrateur.` };
}
