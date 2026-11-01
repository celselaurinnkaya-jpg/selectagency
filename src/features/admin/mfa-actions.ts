"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getPlatformAccess } from "@/lib/auth/platform";

// Double authentification (application d'authentification, code à 6 chiffres) des administrateurs
// SELECT. Supabase élève alors la session au niveau « aal2 », exigé par toutes les fonctions de la
// console. Le secret n'est jamais enregistré ni journalisé par l'application.

export interface EnrollState {
  message?: string;
  factorId?: string;
  qrCode?: string;
  secret?: string;
}

export async function startEnrollmentAction(): Promise<EnrollState> {
  const { user, access } = await getPlatformAccess();
  if (!user || access === "none") return { message: "Action réservée à l'équipe SELECT." };
  // Les inscriptions commencées et jamais confirmées sont retirées avant d'en créer une nouvelle.
  const { data: factors } = await user.supabase.auth.mfa.listFactors();
  for (const factor of factors?.all ?? []) {
    if (factor.factor_type === "totp" && factor.status === "unverified") await user.supabase.auth.mfa.unenroll({ factorId: factor.id });
  }
  const { data, error } = await user.supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Console SELECT ${new Date().toISOString().slice(0, 10)}` });
  if (error || !data) return { message: "La double authentification n'a pas pu être préparée. Réessayez dans un instant." };
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

const codeSchema = z.object({
  factorId: z.uuid(),
  code: z.string().trim().regex(/^\d{6}$/, "Saisissez les 6 chiffres affichés par l'application."),
});

export async function verifyCodeAction(_prev: { message?: string }, formData: FormData): Promise<{ message?: string }> {
  const parsed = codeSchema.safeParse({ factorId: formData.get("factorId"), code: formData.get("code") });
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Code invalide." };
  const { user, access } = await getPlatformAccess();
  if (!user || access === "none") return { message: "Action réservée à l'équipe SELECT." };
  const { error } = await user.supabase.auth.mfa.challengeAndVerify({ factorId: parsed.data.factorId, code: parsed.data.code });
  if (error) return { message: "Code incorrect ou expiré : saisissez le code affiché en ce moment par l'application." };
  redirect("/admin");
}
