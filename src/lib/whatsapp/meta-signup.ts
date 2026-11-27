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
export async function findWabaId(f: Fetch, appId: string, appSecret: string, token: string): Promise<{ wabaId?: string; scopes: string[] }> {
  const query = new URLSearchParams({ input_token: token, access_token: `${appId}|${appSecret}` });
  type Scope = { scope?: string; target_ids?: string[] };
  const body = await call<{ data?: { scopes?: string[]; granular_scopes?: Scope[] } }>(f, `${GRAPH}/${GRAPH_VERSION}/debug_token?${query}`);
  const granular = body.data?.granular_scopes ?? [];
  return {
    wabaId: granular.find((s) => s.scope === "whatsapp_business_management")?.target_ids?.[0],
    // Autorisations accordées (noms seulement, sans aucun secret) : pour expliquer un parcours Meta incomplet.
    scopes: body.data?.scopes ?? granular.map((s) => s.scope ?? "").filter(Boolean),
  };
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

/** Autorisations WhatsApp qu'une clé d'accès doit porter pour qu'un numéro fonctionne dans SELECT. */
export const REQUIRED_SCOPES = ["whatsapp_business_management", "whatsapp_business_messaging"] as const;

/**
 * Connexion par identifiants (saisie manuelle ou console SELECT) : la clé d'accès fournie est vérifiée auprès de Meta
 * avant d'être acceptée. Elle doit être valide, créée pour l'application Meta de SELECT, porter les deux autorisations
 * WhatsApp, et donner accès au compte WhatsApp Business indiqué, qui doit contenir le numéro indiqué. Le numéro et le
 * nom affichés sont ceux que Meta renvoie (jamais ceux saisis à la main).
 */
export async function verifyAccessForNumber(
  f: Fetch,
  appId: string,
  appSecret: string,
  token: string,
  wabaId: string,
  phoneNumberId: string,
): Promise<{ phone: MetaPhone; expiresAt?: string }> {
  const query = new URLSearchParams({ input_token: token, access_token: `${appId}|${appSecret}` });
  type Debug = { data?: { is_valid?: boolean; app_id?: string; scopes?: string[]; expires_at?: number } };
  const info = (await call<Debug>(f, `${GRAPH}/${GRAPH_VERSION}/debug_token?${query}`)).data ?? {};
  if (!info.is_valid) throw new MetaError("cette clé d'accès n'est pas valide (expirée, révoquée ou mal copiée).");
  if (String(info.app_id ?? "") !== appId) throw new MetaError("cette clé d'accès a été créée pour une autre application Meta que celle de SELECT.");
  const missing = REQUIRED_SCOPES.filter((scope) => !(info.scopes ?? []).includes(scope));
  if (missing.length) throw new MetaError(`autorisations manquantes sur cette clé : ${missing.join(", ")}.`);

  type Row = { id: string; display_phone_number: string; verified_name?: string };
  const numbers = await call<{ data?: Row[] }>(
    f,
    `${GRAPH}/${GRAPH_VERSION}/${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name&limit=100`,
    { headers: bearer(token) },
  );
  const row = numbers.data?.find((n) => n.id === phoneNumberId);
  if (!row?.display_phone_number) throw new MetaError("ce numéro n'appartient pas à ce compte WhatsApp Business, ou la clé n'y donne pas accès.");
  return {
    phone: { id: row.id, displayPhoneNumber: row.display_phone_number, verifiedName: row.verified_name },
    // 0 = clé sans date de fin (utilisateur système) ; sinon clé temporaire (par exemple 24 h).
    expiresAt: info.expires_at && info.expires_at > 0 ? new Date(info.expires_at * 1000).toISOString() : undefined,
  };
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
