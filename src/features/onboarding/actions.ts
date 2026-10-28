"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/context";
import { dbMessage } from "@/lib/data/errors";
import { isDemoEnabled } from "@/lib/env";
import { CURRENCY_OPTIONS, dayKey, TIMEZONE_OPTIONS } from "@/lib/format";
import { formValues, type FormState } from "@/lib/form-state";
import { buildDemoPayload } from "./demo-data";

// Première connexion : créer son agence, rejoindre une agence (invitation) ou essayer la démonstration.

const agencySchema = z.object({
  name: z.string().trim().min(2, "Indiquez le nom de l'agence.").max(120),
  city: z.string().trim().min(1, "Indiquez la ville.").max(80),
  countryCode: z.string().regex(/^[A-Z]{2}$/, "Choisissez le pays."),
  currency: z.enum(CURRENCY_OPTIONS.map((c) => c.code) as [string, ...string[]], { error: "Choisissez la devise." }),
  timezone: z.enum(TIMEZONE_OPTIONS.map((t) => t.value) as [string, ...string[]], { error: "Choisissez le fuseau horaire." }),
  fullName: z.string().trim().min(2, "Indiquez votre nom complet.").max(120),
  jobTitle: z.string().trim().max(80).optional(),
});

export async function createAgencyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = agencySchema.safeParse(values);
  if (!parsed.success) return { message: "Certains champs sont à corriger.", fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  const user = await requireSessionUser();
  const input = parsed.data;
  const { error } = await user.supabase.rpc("create_organization", {
    p_name: input.name,
    p_city: input.city,
    p_country_code: input.countryCode,
    p_currency: input.currency,
    p_timezone: input.timezone,
    p_receipt_prefix: "REC",
    p_full_name: input.fullName,
    p_job_title: input.jobTitle ?? "",
  });
  if (error) return { message: dbMessage(error), values };
  redirect("/dashboard?ok=agence-creee");
}

export async function createDemoAgencyAction(): Promise<FormState> {
  if (!isDemoEnabled()) return { message: "La démonstration n'est pas disponible sur cette installation." };
  const user = await requireSessionUser();
  const memberId = crypto.randomUUID();
  const payload = buildDemoPayload(memberId, dayKey(new Date(), "Africa/Douala"));
  const { error } = await user.supabase.rpc("create_demo_organization", {
    p_name: "Horizon Voyages & Études (démonstration)",
    p_full_name: user.fullName || user.email.split("@")[0] || "Responsable",
    p_member_id: memberId,
    p_data: payload,
  });
  if (error) return { message: dbMessage(error) };
  redirect("/dashboard");
}

export async function leaveDemoAction(): Promise<void> {
  const user = await requireSessionUser();
  const { error } = await user.supabase.rpc("leave_demo_organization");
  if (error) throw new Error(dbMessage(error));
  redirect("/onboarding");
}

export async function acceptInvitationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = z.uuid().safeParse(formData.get("token"));
  if (!token.success) return { message: "Invitation invalide." };
  const user = await requireSessionUser();
  const { error } = await user.supabase.rpc("accept_invitation", { p_token: token.data });
  if (error) return { message: dbMessage(error) };
  redirect("/dashboard?ok=invitation-acceptee");
}
