// Variables d'environnement. Seules l'URL et la clé publique de Supabase sont exposées au navigateur
// (préfixe NEXT_PUBLIC_) : la protection des données repose sur la RLS, pas sur le secret de la clé.

export function supabaseEnv(): { url: string; publishableKey: string } {
  // Références littérales : Next.js les remplace au build dans le code envoyé au navigateur.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !publishableKey) {
    throw new Error(
      "Configuration Supabase manquante : copiez .env.example vers .env.local, renseignez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, puis redémarrez « npm run dev ».",
    );
  }
  return { url, publishableKey };
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY));
}

/** L'agence de démonstration (données fictives) peut être proposée à l'inscription. */
export function isDemoEnabled(): boolean {
  return process.env.DEMO_DATA_ENABLED === "true";
}

/** Adresse publique du site, utilisée quand NEXT_PUBLIC_SITE_URL est absente ou inutilisable. */
export const DEFAULT_SITE_URL = "https://www.myselectagency.com";

/** Adresse qui ne mène qu'à l'ordinateur qui l'ouvre (localhost, 127.0.0.1…). */
export function isLocalUrl(url: string): boolean {
  try {
    return /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Adresse publique du site, pour tous les liens transmis (invitations, e-mails, retours de paiement).
 * En local : NEXT_PUBLIC_SITE_URL=http://localhost:3000. En ligne (version de production), une adresse locale
 * copiée par erreur de .env.local donnerait des liens inutilisables : elle est ignorée au profit du vrai domaine.
 */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (!configured) return DEFAULT_SITE_URL;
  if (process.env.NODE_ENV === "production" && isLocalUrl(configured)) return DEFAULT_SITE_URL;
  return configured;
}
