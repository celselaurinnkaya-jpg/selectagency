import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured, supabaseEnv } from "@/lib/env";
import { safeNext } from "@/features/auth/redirects";

// Rafraîchit la session Supabase à chaque requête (les Server Components ne peuvent pas écrire de
// cookies) et oriente les visiteurs : espace de travail réservé aux personnes connectées.
// Ce n'est qu'un premier filtre : chaque page et chaque action revérifie la session (src/lib/auth).

const PROTECTED = ["/dashboard", "/clients", "/cases", "/documents", "/appointments", "/tasks", "/finance", "/reports", "/team", "/settings", "/search", "/onboarding", "/reset-password"];
const GUEST_ONLY = ["/login", "/signup"];

const matches = (pathname: string, prefixes: string[]) => prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));

export async function updateSession(request: NextRequest) {
  // Sans configuration, les pages affichent un message explicite au lieu d'une boucle de redirections.
  if (!isSupabaseConfigured()) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const { url, publishableKey } = supabaseEnv();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });

  // Rien entre la création du client et getClaims() : c'est cet appel qui rafraîchit la session.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  if (!signedIn && matches(pathname, PROTECTED)) {
    return redirectKeepingCookies(request, response, "/login", { next: `${pathname}${search}` });
  }
  if (signedIn && matches(pathname, GUEST_ONLY)) {
    // Déjà connecté : on suit l'adresse de retour (ex. une invitation), sinon le tableau de bord.
    const next = new URL(safeNext(request.nextUrl.searchParams.get("next"), "/dashboard"), request.url);
    return redirectKeepingCookies(request, response, next.pathname, Object.fromEntries(next.searchParams));
  }
  return response;
}

function redirectKeepingCookies(request: NextRequest, from: NextResponse, pathname: string, params: Record<string, string> = {}) {
  const target = request.nextUrl.clone();
  target.pathname = pathname;
  target.search = new URLSearchParams(params).toString();
  const redirect = NextResponse.redirect(target);
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}
