import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseEnv } from "@/lib/env";

// Client Supabase côté serveur, au nom de la personne connectée (sa session est dans les cookies) :
// toutes les lectures et écritures passent par la RLS. Un nouveau client est créé à chaque requête.

export async function createClient() {
  const cookieStore = await cookies();
  // Avec partialPrefetching, Next.js prépare l'enveloppe des pages en avance avec les cookies : la
  // lecture des cookies n'arrête donc pas ce pré-rendu, alors que le client Supabase lit l'heure
  // (expiration de la session) et interroge la base. connection() renvoie ce travail à la vraie requête.
  await connection();
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
