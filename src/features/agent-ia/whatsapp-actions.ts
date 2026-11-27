"use server";

import { refresh, revalidatePath } from "next/cache";
import { z } from "zod";
import { getAgencyContext } from "@/lib/auth/context";
import { dbMessage } from "@/lib/data/errors";
import { formValues, type FormState } from "@/lib/form-state";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";
import { cronSecret } from "@/lib/email/system-worker";
import { createSystemClient } from "@/lib/supabase/system";
import { exchangeCode, findPhone, findWabaId, HISTORY_DECLINED, MetaError, requestSync, subscribeApp } from "@/lib/whatsapp/meta-signup";
import { buildSignupSetup, type EmbeddedSignupSetup, type SignupInfo } from "@/lib/whatsapp/signup-prefill";
import { encryptToken } from "@/lib/whatsapp/token-crypto";

const connectSchema = z.object({
  wabaId: z.string().trim().min(5, "L'identifiant de compte WhatsApp Business (WABA ID) est requis.").max(120),
  phoneNumberId: z.string().trim().min(5, "L'identifiant du numéro (Phone Number ID) est requis.").max(120),
  displayPhoneNumber: z.string().trim().min(6, "Le numéro de téléphone affiché est requis.").max(60),
  verifiedName: z.string().trim().max(200).optional().or(z.literal("")),
  coexistence: z.preprocess((val) => val === "true" || val === "on" || val === true, z.boolean()).default(false),
});

export async function connectWhatsAppAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = connectSchema.safeParse(values);

  if (!parsed.success) {
    return {
      message: "Certains champs sont à corriger.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
      values,
    };
  }

  const input = parsed.data;
  const ctx = await getAgencyContext();

  if (!["owner", "admin"].includes(ctx.member.role)) {
    return { message: "Action réservée aux administrateurs.", values };
  }

  if (ctx.locked.includes("ai_agent")) {
    return { message: "L'option Agent IA est incluse uniquement dans les formules PRO et BUSINESS.", values };
  }

  const { data: accountId, error } = await ctx.supabase.rpc("connect_wa_account", {
    p_org: ctx.organizationId,
    p_waba_id: input.wabaId,
    p_phone_number_id: input.phoneNumberId,
    p_display_phone_number: input.displayPhoneNumber,
    p_verified_name: input.verifiedName || null,
    p_coexistence: input.coexistence,
  });

  if (error) {
    return { message: dbMessage(error), values };
  }

  if (!accountId) {
    return { message: "Échec de connexion du numéro WhatsApp.", values };
  }

  refresh();
  return { ok: true, message: "Numéro WhatsApp connecté avec succès !" };
}

export async function disconnectWhatsAppAccountAction(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const id = formData.get("id");
  if (!id || typeof id !== "string") {
    return { ok: false, message: "Identifiant de compte manquant." };
  }

  const ctx = await getAgencyContext();
  if (!["owner", "admin"].includes(ctx.member.role)) {
    return { ok: false, message: "Action réservée aux administrateurs." };
  }

  const { error } = await ctx.supabase.rpc("disconnect_wa_account", {
    p_account_id: id,
    p_org: ctx.organizationId,
  });

  if (error) {
    return { ok: false, message: dbMessage(error) };
  }

  revalidatePath("/agent-ia/connexion");
  revalidatePath("/agent-ia");
  refresh();
  return { ok: true, message: "Numéro WhatsApp déconnecté." };
}

export async function reconnectWhatsAppAccountAction(
  formData: FormData
): Promise<{ ok: boolean; message: string }> {
  const id = formData.get("id");
  if (!id || typeof id !== "string") {
    return { ok: false, message: "Identifiant de compte manquant." };
  }

  const ctx = await getAgencyContext();
  if (!["owner", "admin"].includes(ctx.member.role)) {
    return { ok: false, message: "Action réservée aux administrateurs." };
  }
  if (ctx.locked.includes("ai_agent")) {
    return { ok: false, message: "L'option Agent IA est incluse uniquement dans les formules PRO et BUSINESS." };
  }

  const { data: account, error: fetchErr } = await ctx.supabase
    .from("wa_accounts")
    .select("*")
    .eq("id", id)
    .eq("organization_id", ctx.organizationId)
    .single();

  if (fetchErr || !account) {
    return { ok: false, message: "Compte WhatsApp introuvable." };
  }

  const { error: connectErr } = await ctx.supabase.rpc("connect_wa_account", {
    p_org: ctx.organizationId,
    p_waba_id: account.waba_id,
    p_phone_number_id: account.phone_number_id,
    p_display_phone_number: account.display_phone_number,
    p_verified_name: account.verified_name || null,
    p_coexistence: account.coexistence,
  });

  if (connectErr) {
    return { ok: false, message: dbMessage(connectErr) };
  }

  revalidatePath("/agent-ia/connexion");
  revalidatePath("/agent-ia");
  refresh();
  return { ok: true, message: "Numéro WhatsApp reconnecté avec succès." };
}

export async function sendTestWhatsAppMessageAction(
  accountId: string,
  toPhone: string
): Promise<{ ok: boolean; message: string }> {
  const ctx = await getAgencyContext();
  // Comme la connexion du numéro : réservé au propriétaire et aux administrateurs, avec l'option Agent IA.
  if (!["owner", "admin"].includes(ctx.member.role) || !ctx.writable) {
    return { ok: false, message: "Action réservée aux administrateurs." };
  }
  if (ctx.locked.includes("ai_agent")) {
    return { ok: false, message: "L'option Agent IA est incluse uniquement dans les formules PRO et BUSINESS." };
  }

  const { data: account, error } = await ctx.supabase
    .from("wa_accounts")
    .select("*")
    .eq("id", accountId)
    .eq("organization_id", ctx.organizationId)
    .single();

  if (error || !account) {
    return { ok: false, message: "Compte WhatsApp introuvable." };
  }

  const token = process.env.WHATSAPP_SYSTEM_ACCESS_TOKEN || process.env.WHATSAPP_API_TOKEN;
  if (!token) {
    return {
      ok: false,
      message: "Clé d'accès WhatsApp de SELECT non configurée (WHATSAPP_SYSTEM_ACCESS_TOKEN) : aucun message n'a été envoyé.",
    };
  }

  const testText = `Message de test envoyé depuis SELECT Agency pour confirmer la connexion officielle de votre compte WhatsApp Business (${account.display_phone_number}).`;

  const result = await sendWhatsAppMessage({
    phoneNumberId: account.phone_number_id,
    to: toPhone,
    text: testText,
    accessToken: token,
  });

  if (!result.ok) {
    return { ok: false, message: `Erreur Meta : ${result.error || "Échec d'envoi"}` };
  }

  return { ok: true, message: `Message de test transmis avec succès à Meta (ID : ${result.metaMessageId}).` };
}

// --- Connexion par le vrai QR code de Meta ---------------------------------------------------------------------
// Appelée à la fin du parcours officiel de Meta (fenêtre « Continuer avec Facebook » où Meta affiche le QR code à
// scanner avec l'application WhatsApp Business). Le code reçu expire en 30 secondes : il est échangé tout de suite.

const META_ID = /^\d{5,30}$/;

/**
 * Étape « Vos informations » : données de l'agence proposées pour la fenêtre de Meta. Nom, ville, pays et fuseau de
 * l'agence, et coordonnées des factures (raison sociale, adresse, téléphone, e-mail ; à défaut, l'e-mail du
 * responsable connecté). Rien de secret : ce sont les informations de l'agence elle-même.
 */
export async function getWhatsAppSignupPrefillAction(): Promise<SignupInfo> {
  const ctx = await getAgencyContext();
  const { data: invoice } = await ctx.supabase
    .from("invoice_settings")
    .select("legal_name, address, phone, email")
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  return {
    name: invoice?.legal_name?.trim() || ctx.agency.name,
    email: invoice?.email?.trim() || ctx.email,
    phone: invoice?.phone?.trim() ?? "",
    address: invoice?.address?.trim() ?? "",
    city: ctx.agency.city ?? "",
    countryCode: ctx.agency.countryCode ?? "",
    timezone: ctx.agency.timezone ?? "",
  };
}

const PREFILL_LABELS = { name: "nom", email: "e-mail", phone: "téléphone", address: "adresse", city: "ville" } as const;
type PrefillField = keyof typeof PREFILL_LABELS;

/**
 * Informations vérifiées (et éventuellement corrigées) par l'agence → objet « setup » de la fenêtre de Meta.
 * Pays et fuseau sont relus dans le profil de l'agence. Les valeurs au mauvais format sont laissées vides chez Meta
 * et signalées (« omitted »). Rien n'est enregistré : les paramètres de l'agence ne changent pas.
 */
export async function prepareWhatsAppSignupAction(
  input: Partial<Record<PrefillField, string>>,
): Promise<{ setup: EmbeddedSignupSetup; omitted: string[] }> {
  const ctx = await getAgencyContext();
  const text = (field: PrefillField, max: number) => {
    const value = input?.[field];
    return typeof value === "string" ? value.trim().slice(0, max) : "";
  };
  const values: Record<PrefillField, string> = {
    name: text("name", 200),
    email: text("email", 254),
    phone: text("phone", 40),
    address: text("address", 300),
    city: text("city", 100),
  };
  const setup = buildSignupSetup({
    agencyName: values.name,
    email: values.email,
    phone: values.phone,
    address: values.address,
    city: values.city,
    countryCode: ctx.agency.countryCode,
    timezone: ctx.agency.timezone,
  });
  const business = setup.business;
  const kept: Record<PrefillField, unknown> = {
    name: business?.name,
    email: business?.email,
    phone: business?.phone,
    address: business?.address?.streetAddress1,
    city: business?.address?.city,
  };
  const omitted = (Object.keys(PREFILL_LABELS) as PrefillField[]).filter((f) => values[f] && !kept[f]).map((f) => PREFILL_LABELS[f]);
  return { setup, omitted };
}

export async function completeWhatsAppSignupAction(input: {
  code: string;
  wabaId?: string;
  phoneNumberId?: string;
}): Promise<{ ok: boolean; message: string; historyShared?: boolean }> {
  const code = typeof input.code === "string" ? input.code.trim() : "";
  let wabaId = typeof input.wabaId === "string" && META_ID.test(input.wabaId) ? input.wabaId : undefined;
  const phoneNumberId = typeof input.phoneNumberId === "string" && META_ID.test(input.phoneNumberId) ? input.phoneNumberId : undefined;
  if (!code || code.length > 2000) return { ok: false, message: "Meta n'a pas renvoyé de code de connexion. Recommencez." };

  const ctx = await getAgencyContext();
  if (!["owner", "admin"].includes(ctx.member.role)) {
    return { ok: false, message: "Action réservée au propriétaire et aux administrateurs." };
  }
  if (ctx.locked.includes("ai_agent")) {
    return { ok: false, message: "L'option Agent IA est incluse uniquement dans les formules PRO et BUSINESS." };
  }

  const appId = process.env.NEXT_PUBLIC_META_APP_ID?.trim();
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
  const serverSecret = cronSecret();
  if (!appId || !appSecret || !serverSecret) {
    return { ok: false, message: "Connexion Meta non configurée : NEXT_PUBLIC_META_APP_ID, WHATSAPP_APP_SECRET et CRON_SECRET sont nécessaires." };
  }

  let token: string;
  try {
    token = await exchangeCode(fetch, appId, appSecret, code);
  } catch {
    return { ok: false, message: "Meta a refusé le code de connexion (il n'est valable que 30 secondes). Recommencez le scan." };
  }

  // La fenêtre Meta n'a pas transmis le compte à la page : on le demande à Meta avec le jeton obtenu.
  if (!wabaId) {
    const found = await findWabaId(fetch, appId, appSecret, token).catch(() => null);
    if (!found) {
      return { ok: false, message: "Meta n'a pas pu confirmer le compte WhatsApp relié. Recommencez dans quelques instants." };
    }
    wabaId = found.wabaId && META_ID.test(found.wabaId) ? found.wabaId : undefined;
    if (!wabaId) {
      const granted = found.scopes.length ? found.scopes.join(", ") : "aucune";
      return {
        ok: false,
        message: found.scopes.includes("whatsapp_business_management")
          ? "Aucun compte WhatsApp Business n'a été relié dans la fenêtre de Meta. Recommencez et allez jusqu'au bout : numéro de l'agence, confirmation dans WhatsApp Business sur le téléphone, puis « Terminer »."
          : `La fenêtre de Meta n'a pas demandé l'accès à WhatsApp (autorisations reçues : ${granted}). La configuration de connexion de SELECT dans l'application Meta doit utiliser le modèle « WhatsApp Embedded Signup ».`,
      };
    }
  }

  let phone;
  try {
    phone = await findPhone(fetch, token, wabaId, phoneNumberId);
    await subscribeApp(fetch, token, wabaId);
  } catch (err) {
    return { ok: false, message: `Meta : ${err instanceof Error ? err.message : "réponse inattendue"}` };
  }

  // Le numéro scanné remplace l'ancien numéro connecté de l'agence (par exemple un numéro de test).
  const { data: connected } = await ctx.supabase
    .from("wa_accounts")
    .select("id, phone_number_id")
    .eq("organization_id", ctx.organizationId)
    .eq("status", "connected");
  for (const other of connected ?? []) {
    if (other.phone_number_id !== phone.id) {
      await ctx.supabase.rpc("disconnect_wa_account", { p_account_id: other.id, p_org: ctx.organizationId });
    }
  }

  const { error: connectErr } = await ctx.supabase.rpc("connect_wa_account", {
    p_org: ctx.organizationId,
    p_waba_id: wabaId,
    p_phone_number_id: phone.id,
    p_display_phone_number: phone.displayPhoneNumber,
    p_verified_name: phone.verifiedName ?? null,
    p_coexistence: true,
  });
  if (connectErr) return { ok: false, message: dbMessage(connectErr) };

  const { error: tokenErr } = await createSystemClient().rpc("save_wa_account_token", {
    p_secret: serverSecret,
    p_org: ctx.organizationId,
    p_phone_number_id: phone.id,
    p_token_enc: encryptToken(token, serverSecret),
  });
  if (tokenErr) return { ok: false, message: "Numéro connecté, mais son accès n'a pas pu être enregistré. Recommencez le scan." };

  // Contacts puis historique du téléphone (Meta les envoie ensuite au webhook, en quelques minutes).
  let historyShared = true;
  try {
    await requestSync(fetch, token, phone.id, "smb_app_state_sync");
  } catch (err) {
    console.warn("WhatsApp : synchronisation des contacts non lancée :", err instanceof Error ? err.message : err);
  }
  try {
    await requestSync(fetch, token, phone.id, "history");
  } catch (err) {
    historyShared = false;
    if (!(err instanceof MetaError && err.code === HISTORY_DECLINED)) {
      console.warn("WhatsApp : synchronisation de l'historique non lancée :", err instanceof Error ? err.message : err);
    }
  }

  refresh();
  return {
    ok: true,
    historyShared,
    message: historyShared
      ? `WhatsApp ${phone.displayPhoneNumber} connecté. Vos conversations arrivent dans la boîte WhatsApp Web (quelques minutes).`
      : `WhatsApp ${phone.displayPhoneNumber} connecté. L'historique n'a pas été partagé : seuls les nouveaux messages apparaîtront.`,
  };
}
