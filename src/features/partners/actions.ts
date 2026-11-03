"use server";

import { headers } from "next/headers";
import { refresh } from "next/cache";
import { z } from "zod";
import { getAgencyContext, requireSessionUser } from "@/lib/auth/context";
import { allowed, forbiddenMessage } from "@/lib/auth/permissions";
import { dbMessage } from "@/lib/data/errors";
import { CURRENCY_OPTIONS } from "@/lib/format";
import type { FormState } from "@/lib/form-state";
import { localDateTimeToIso } from "@/lib/period";
import { parseAmount } from "@/features/finance/payments";

// Partenaires et commissions : la base vérifie les rôles, les codes uniques, l'état des commissions
// et note les versements dans l'historique du client (fonctions save_partner, pay_commission…).

const partnerSchema = z.object({
  partnerId: z.union([z.literal(""), z.uuid()]),
  name: z.string().trim().min(2, "Indiquez le nom du partenaire.").max(120),
  code: z
    .string()
    .transform((v) => v.replace(/\s+/g, "").toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9-]{3,20}$/, "De 3 à 20 lettres, chiffres ou tirets (ex. AMINA-2026).")),
  phone: z.string().trim().max(40),
  email: z.union([z.literal(""), z.email("Adresse e-mail invalide.")]),
  commission: z.string().trim(),
  currency: z.enum(CURRENCY_OPTIONS.map((c) => c.code) as [string, ...string[]], { error: "Devise non prise en charge." }),
  notes: z.string().trim().max(1000),
  isActive: z.boolean(),
});

export type PartnerInput = z.input<typeof partnerSchema>;

export async function savePartnerAction(input: PartnerInput): Promise<FormState> {
  const parsed = partnerSchema.safeParse(input);
  if (!parsed.success) return { message: "Certains champs sont à corriger.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const p = parsed.data;
  const commissionMinor = p.commission === "" || p.commission === "0" ? 0 : parseAmount(p.commission, p.currency);
  if (commissionMinor === null) return { message: "Certains champs sont à corriger.", fieldErrors: { commission: [`Montant invalide en ${p.currency}.`] } };

  const ctx = await getAgencyContext();
  if (!allowed(ctx, "partners.manage")) return { message: forbiddenMessage(ctx, "partners.manage") };
  const { data, error } = await ctx.supabase.rpc("save_partner", {
    p_organization_id: ctx.organizationId,
    p_partner_id: p.partnerId || null,
    p_name: p.name,
    p_code: p.code,
    p_phone: p.phone,
    p_email: p.email,
    p_commission_minor: commissionMinor,
    p_currency: p.currency,
    p_notes: p.notes,
    p_is_active: p.isActive,
  });
  if (error) return { message: dbMessage(error) };
  return { ok: true, redirectTo: `/partners/${data as string}?ok=${p.partnerId ? "partenaire-modifie" : "partenaire-cree"}` };
}

const commissionId = z.uuid();

export async function updateCommissionAction(id: string, amount: string, currency: string): Promise<FormState> {
  if (!commissionId.safeParse(id).success) return { message: "Commission introuvable." };
  const amountMinor = amount.trim() === "0" ? 0 : parseAmount(amount, currency);
  if (amountMinor === null) return { message: `Montant invalide en ${currency}.` };
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "commission.manage")) return { message: forbiddenMessage(ctx, "commission.manage") };
  const { error } = await ctx.supabase.rpc("update_commission", { p_id: id, p_amount_minor: amountMinor });
  if (error) return { message: dbMessage(error) };
  refresh();
  return { ok: true, message: "Montant de la commission mis à jour." };
}

const paySchema = z.object({
  id: z.uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Indiquez la date du versement."),
  method: z.string().trim().min(2, "Indiquez le moyen de versement.").max(60),
  reference: z.string().trim().max(80),
});

export async function payCommissionAction(input: z.input<typeof paySchema>): Promise<FormState> {
  const parsed = paySchema.safeParse(input);
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Certains champs sont à corriger." };
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "commission.manage")) return { message: forbiddenMessage(ctx, "commission.manage") };
  const { error } = await ctx.supabase.rpc("pay_commission", {
    p_id: parsed.data.id,
    p_paid_at: localDateTimeToIso(parsed.data.date, "12:00", ctx.agency.timezone),
    p_method: parsed.data.method,
    p_reference: parsed.data.reference,
  });
  if (error) return { message: dbMessage(error) };
  refresh();
  return { ok: true, message: "Commission marquée « Payée »." };
}

export async function cancelCommissionAction(id: string, reason: string): Promise<FormState> {
  if (!commissionId.safeParse(id).success) return { message: "Commission introuvable." };
  if (reason.trim().length < 3) return { message: "Indiquez le motif de l'annulation." };
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "commission.manage")) return { message: forbiddenMessage(ctx, "commission.manage") };
  const { error } = await ctx.supabase.rpc("cancel_commission", { p_id: id, p_reason: reason.trim() });
  if (error) return { message: dbMessage(error) };
  refresh();
  return { ok: true, message: "Commission annulée." };
}

/** Lien personnel vers l'espace partenaire, lié à une adresse e-mail. L'agence le transmet elle-même. */
export async function createPartnerAccessAction(partnerId: string, email: string): Promise<FormState> {
  if (!z.uuid().safeParse(partnerId).success) return { message: "Partenaire introuvable." };
  const address = email.trim().toLowerCase();
  if (!z.email().safeParse(address).success) return { message: "Adresse e-mail invalide." };
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "partners.manage")) return { message: forbiddenMessage(ctx, "partners.manage") };
  const { data, error } = await ctx.supabase.rpc("create_partner_access", { p_partner_id: partnerId, p_email: address });
  if (error) return { message: dbMessage(error) };
  const h = await headers();
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? h.get("origin") ?? "";
  refresh();
  return { ok: true, message: "Lien d'accès créé.", redirectTo: `${origin}/acces-partenaire/${data as string}` };
}

export async function revokePartnerAccessAction(partnerId: string): Promise<FormState> {
  if (!z.uuid().safeParse(partnerId).success) return { message: "Partenaire introuvable." };
  const ctx = await getAgencyContext();
  if (!allowed(ctx, "partners.manage")) return { message: forbiddenMessage(ctx, "partners.manage") };
  const { error } = await ctx.supabase.rpc("revoke_partner_access", { p_partner_id: partnerId });
  if (error) return { message: dbMessage(error) };
  refresh();
  return { ok: true, message: "Accès retiré : le partenaire ne voit plus son espace." };
}

/** Le partenaire ouvre son lien, connecté avec l'adresse à laquelle il a été envoyé. */
export async function acceptPartnerAccessAction(token: string): Promise<FormState> {
  if (!z.uuid().safeParse(token).success) return { message: "Lien invalide." };
  const user = await requireSessionUser();
  const { error } = await user.supabase.rpc("accept_partner_access", { p_token: token });
  if (error) return { message: dbMessage(error) };
  return { ok: true, redirectTo: "/partenaire" };
}
