import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "@/lib/env";

/**
 * Accès à la base SANS personne connectée (tâche planifiée, webhook Brevo) : clé publique seulement.
 * Ces appels ne passent que par des fonctions protégées par un secret, vérifié en base par son empreinte.
 */
export function createSystemClient() {
  const { url, publishableKey } = supabaseEnv();
  return createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
