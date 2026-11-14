import "server-only";

// Fin de la connexion par le vrai QR code de Meta (Embedded Signup, « WhatsApp Business app onboarding »).
// Étapes documentées par Meta (consultées le 14 novembre 2026) :
// 1. échanger le code reçu à la fin du parcours contre un « business token » (le code expire en 30 secondes) ;
// 2. trouver le numéro du compte WhatsApp Business ;
// 3. abonner l'application SELECT aux événements de ce compte (webhook) ;
// 4. pas d'enregistrement du numéro : il est déjà utilisé dans l'application WhatsApp Business ;
// 5. demander la synchronisation des contacts puis de l'historique (une seule fois, dans les 24 heures).

export const GRAPH_VERSION = process.env.NEXT_PUBLIC_META_GRAPH_VERSION?.trim() || "v27.0";
const GRAPH = "https://graph.facebook.com";

type Fetch = typeof fetch;

export interface MetaPhone {
  id: string;
  displayPhoneNumber: string;
  verifiedName?: string;
}

export class MetaError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message);
  }
}

async function call<T>(f: Fetch, url: string, init?: RequestInit): Promise<T> {
  const response = await f(url, { ...init, signal: AbortSignal.timeout(15_000) });
  const body = (await response.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
  if (!response.ok || body.error) {
    throw new MetaError(body.error?.message || `Réponse ${response.status} de Meta.`, body.error?.code);
  }
  return body;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** 1. Code du parcours Meta → jeton d'accès du compte WhatsApp Business de l'agence. */
export async function exchangeCode(f: Fetch, appId: string, appSecret: string, code: string): Promise<string> {
  const query = new URLSearchParams({ client_id: appId, client_secret: appSecret, code });
  const body = await call<{ access_token?: string }>(f, `${GRAPH}/${GRAPH_VERSION}/oauth/access_token?${query}`);
  if (!body.access_token) throw new MetaError("Meta n'a pas renvoyé de jeton d'accès.");
  return body.access_token;
}

/**
 * 1 bis. Compte WhatsApp Business relié, quand la fenêtre Meta ne l'a pas transmis à la page : Meta l'indique dans
 * les autorisations du jeton (debug_token, « granular_scopes » → whatsapp_business_management, le plus récent en premier).
 */
export async function findWabaId(f: Fetch, appId: string, appSecret: string, token: string): Promise<string | undefined> {
  const query = new URLSearchParams({ input_token: token, access_token: `${appId}|${appSecret}` });
  type Scope = { scope?: string; target_ids?: string[] };
  const body = await call<{ data?: { granular_scopes?: Scope[] } }>(f, `${GRAPH}/${GRAPH_VERSION}/debug_token?${query}`);
  return body.data?.granular_scopes?.find((s) => s.scope === "whatsapp_business_management")?.target_ids?.[0];
}

/** 2. Le numéro connecté : celui indiqué par Meta, sinon le premier numéro du compte WhatsApp Business. */
export async function findPhone(f: Fetch, token: string, wabaId: string, phoneNumberId?: string): Promise<MetaPhone> {
  const fields = "id,display_phone_number,verified_name";
  type Row = { id: string; display_phone_number: string; verified_name?: string };
  const row = phoneNumberId
    ? await call<Row>(f, `${GRAPH}/${GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}?fields=${fields}`, { headers: bearer(token) })
    : (await call<{ data?: Row[] }>(f, `${GRAPH}/${GRAPH_VERSION}/${encodeURIComponent(wabaId)}/phone_numbers?fields=${fields}`, { headers: bearer(token) })).data?.[0];
  if (!row?.id || !row.display_phone_number) throw new MetaError("Aucun numéro trouvé dans ce compte WhatsApp Business.");
  return { id: row.id, displayPhoneNumber: row.display_phone_number, verifiedName: row.verified_name };
}

/** 3. Abonne l'application aux messages de ce compte (les messages arrivent alors sur le webhook de SELECT). */
export async function subscribeApp(f: Fetch, token: string, wabaId: string): Promise<void> {
  await call(f, `${GRAPH}/${GRAPH_VERSION}/${encodeURIComponent(wabaId)}/subscribed_apps`, { method: "POST", headers: bearer(token) });
}

/** 5. Synchronisation des contacts (« smb_app_state_sync ») ou de l'historique (« history ») du téléphone. */
export async function requestSync(f: Fetch, token: string, phoneId: string, syncType: "smb_app_state_sync" | "history"): Promise<void> {
  await call(f, `${GRAPH}/${GRAPH_VERSION}/${encodeURIComponent(phoneId)}/smb_app_data`, {
    method: "POST",
    headers: { ...bearer(token), "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", sync_type: syncType }),
  });
}

/** Erreur de Meta quand l'agence a refusé de partager l'historique. */
export const HISTORY_DECLINED = 2593109;
