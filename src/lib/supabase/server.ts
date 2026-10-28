import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseEnv } from "@/lib/env";

// Client Supabase côté serveur, au nom de la personne connectée (sa session est dans les cookies) :
// toutes les lectures et écritures passent par la RLS. Un nouveau client est créé à chaque requête.

export async function createClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = supabaseEnv();
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Appel depuis un Server Component : les cookies ne peuvent pas y être écrits.
          // Le proxy (src/proxy.ts) rafraîchit la session à chaque requête.
        }
      },
    },
  });
}

export type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
