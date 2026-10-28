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
