import { createBrowserClient } from "@supabase/ssr";
import { supabaseEnv } from "@/lib/env";

// Client Supabase dans le navigateur : utilisé uniquement pour envoyer les fichiers des pièces
// directement à Storage (sans passer par le serveur de l'application). La RLS de Storage s'applique.
export function createClient() {
  const { url, publishableKey } = supabaseEnv();
  return createBrowserClient(url, publishableKey);
}
