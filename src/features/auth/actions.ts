"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { formValues, type FormState } from "@/lib/form-state";
import { safeNext } from "./redirects";

// Comptes : inscription, connexion, mot de passe oublié, nouveau mot de passe, déconnexion.
// Les messages ne révèlent jamais si une adresse e-mail possède déjà un compte.

const MIN_PASSWORD = 8;

async function siteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const h = await headers();
  return h.get("origin") ?? `http://${h.get("host") ?? "localhost:3000"}`;
}

function authMessage(code: string | undefined, message: string): string {
  if (code === "invalid_credentials") return "Adresse e-mail ou mot de passe incorrect.";
  if (code === "email_not_confirmed") return "Confirmez d'abord votre adresse e-mail : ouvrez le lien reçu par e-mail.";
  if (code === "weak_password") return `Mot de passe trop faible : au moins ${MIN_PASSWORD} caractères, en mélangeant lettres et chiffres.`;
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit") return "Trop de tentatives. Patientez quelques minutes, puis réessayez.";
  if (code === "same_password") return "Choisissez un mot de passe différent de l'actuel.";
  console.error("[auth]", code, message);
  return "La demande n'a pas abouti. Vérifiez votre connexion, puis réessayez.";
}

const loginSchema = z.object({
  email: z.email("Adresse e-mail invalide."),
  password: z.string().min(1, "Indiquez votre mot de passe."),
  next: z.string().optional(),
});

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = loginSchema.safeParse({ ...values, email: values.email?.trim().toLowerCase() });
  if (!parsed.success) return { message: "Certains champs sont à corriger.", fieldErrors: z.flattenError(parsed.error).fieldErrors, values: { email: values.email ?? "" } };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error) return { message: authMessage(error.code, error.message), values: { email: parsed.data.email } };
  redirect(safeNext(parsed.data.next, "/dashboard"));
}

const signupSchema = z.object({
  fullName: z.string().trim().min(2, "Indiquez votre nom complet.").max(120),
  email: z.email("Adresse e-mail invalide."),
  password: z.string().min(MIN_PASSWORD, `Au moins ${MIN_PASSWORD} caractères.`).max(72),
  next: z.string().optional(),
});

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = signupSchema.safeParse({ ...values, email: values.email?.trim().toLowerCase() });
  const keep = { fullName: values.fullName ?? "", email: values.email ?? "" };
  if (!parsed.success) return { message: "Certains champs sont à corriger.", fieldErrors: z.flattenError(parsed.error).fieldErrors, values: keep };

  const next = safeNext(parsed.data.next, "/onboarding");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${await siteUrl()}/auth/confirm?next=${encodeURIComponent(next)}`,
      data: { full_name: parsed.data.fullName },
    },
  });
  if (error) return { message: authMessage(error.code, error.message), values: keep };
  // Confirmation par e-mail désactivée dans Supabase : la session existe déjà.
  if (data.session) redirect(next);
  return {
    ok: true,
    message: `Compte créé. Ouvrez le lien envoyé à ${parsed.data.email} pour confirmer votre adresse, puis connectez-vous. Pensez à regarder dans les courriers indésirables.`,
  };
}

const emailSchema = z.object({ email: z.email("Adresse e-mail invalide.") });

export async function requestPasswordResetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = emailSchema.safeParse({ email: values.email?.trim().toLowerCase() });
  if (!parsed.success) return { message: "Certains champs sont à corriger.", fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await siteUrl()}/auth/confirm?next=/reset-password`,
  });
  if (error && error.code !== "user_not_found") return { message: authMessage(error.code, error.message), values };
  return { ok: true, message: "Si un compte existe avec cette adresse, un lien de réinitialisation vient d'être envoyé. Il est valable une heure." };
}

const passwordSchema = z
  .object({
    password: z.string().min(MIN_PASSWORD, `Au moins ${MIN_PASSWORD} caractères.`).max(72),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Les deux mots de passe ne sont pas identiques.", path: ["confirm"] });

export async function updatePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = passwordSchema.safeParse(formValues(formData));
  if (!parsed.success) return { message: "Certains champs sont à corriger.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { message: authMessage(error.code, error.message) };
  redirect("/dashboard?ok=mot-de-passe");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
