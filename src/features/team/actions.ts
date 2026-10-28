"use server";

import { headers } from "next/headers";
import { refresh } from "next/cache";
import { z } from "zod";
import { getAgencyContext } from "@/lib/auth/context";
import { can, FORBIDDEN_MESSAGE } from "@/lib/auth/permissions";
import { dbMessage } from "@/lib/data/errors";
import { formValues, type FormState } from "@/lib/form-state";
import { INVITABLE_ROLES } from "./invitations";

// Invitations : le responsable crée un lien personnel, qu'il transmet lui-même (e-mail, WhatsApp).
// La personne invitée crée son compte avec la même adresse e-mail, puis rejoint l'agence.

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
  if (!can(ctx.member.role, "team.manage")) return { message: FORBIDDEN_MESSAGE, values };

  const { data: existing } = await ctx.supabase.from("members").select("id").eq("email", parsed.data.email).maybeSingle();
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
  if (!can(ctx.member.role, "team.manage")) return;
  await ctx.supabase.from("invitations").update({ revoked_at: new Date().toISOString() }).eq("id", id.data);
  refresh();
}
