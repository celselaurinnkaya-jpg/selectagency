import "server-only";
import { cronSecret } from "@/lib/email/system-worker";
import { createSystemClient } from "@/lib/supabase/system";
import { accountAccessToken } from "./coexistence";
import { MetaError, subscribeApp, verifyAccessForNumber, type MetaPhone } from "./meta-signup";
import { encryptToken } from "./token-crypto";

// Autorisation propre à chaque numéro WhatsApp (point 2 du plan du 27/11) : aucun numéro n'utilise une clé qui ne lui a
// pas été attribuée. La clé est vérifiée auprès de Meta, puis enregistrée chiffrée (jamais envoyée au navigateur).

export type NumberAccessCheck = { ok: true; phone: MetaPhone; expiresAt?: string } | { ok: false; message: string };

/** Vérifie la clé auprès de Meta et abonne l'application de SELECT aux messages du compte (webhook). */
export async function checkNumberAccess(token: string, wabaId: string, phoneNumberId: string): Promise<NumberAccessCheck> {
  const appId = process.env.NEXT_PUBLIC_META_APP_ID?.trim();
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
  if (!appId || !appSecret || !cronSecret()) {
    return { ok: false, message: "Connexion Meta non configurée sur le serveur : NEXT_PUBLIC_META_APP_ID, WHATSAPP_APP_SECRET et CRON_SECRET sont nécessaires." };
  }
  try {
    const verified = await verifyAccessForNumber(fetch, appId, appSecret, token, wabaId, phoneNumberId);
    await subscribeApp(fetch, token, wabaId);
    return { ok: true, ...verified };
  } catch (err) {
    return { ok: false, message: err instanceof MetaError ? `Meta : ${err.message}` : "Meta n'a pas répondu. Réessayez dans un instant." };
  }
}

/** Enregistre la clé chiffrée du numéro (déjà connecté pour cette agence). Faux si l'enregistrement a échoué. */
export async function saveNumberAccess(organizationId: string, phoneNumberId: string, token: string): Promise<boolean> {
  const secret = cronSecret();
  if (!secret) return false;
  const { data, error } = await createSystemClient().rpc("save_wa_account_token", {
    p_secret: secret,
    p_org: organizationId,
    p_phone_number_id: phoneNumberId,
    p_token_enc: encryptToken(token, secret),
  });
  return !error && data === true;
}

/** Clé d'accès propre d'un numéro connecté (côté serveur uniquement), ou undefined s'il n'en a pas. */
export async function numberAccessToken(phoneNumberId: string): Promise<string | undefined> {
  const secret = cronSecret();
  if (!secret) return undefined;
  return accountAccessToken((fn, args) => createSystemClient().rpc(fn, args), secret, phoneNumberId);
}

/** Phrase affichée après une connexion : signale une clé temporaire qui expirera bientôt. */
export function accessExpiryNote(expiresAt?: string): string {
  if (!expiresAt) return "";
  const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Douala" }).format(new Date(expiresAt));
  return ` Attention : cette clé est temporaire et expire le ${date} ; remplacez-la par une clé permanente (utilisateur système Meta).`;
}
