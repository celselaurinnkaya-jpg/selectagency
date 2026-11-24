import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured, supabaseEnv } from "@/lib/env";
import { safeNext } from "@/features/auth/redirects";

// Rafraîchit la session Supabase à chaque requête (les Server Components ne peuvent pas écrire de
// cookies) et oriente les visiteurs : espace de travail réservé aux personnes connectées.
// Ce n'est qu'un premier filtre : chaque page et chaque action revérifie la session (src/lib/auth).

const PROTECTED = [
  "/dashboard", "/prospects", "/clients", "/cases", "/documents", "/services", "/appointments", "/agent-ia", "/tasks", "/finance", "/partners", "/partenaire", "/espace-client", "/reports", "/team", "/settings", "/search",
  "/support", "/onboarding", "/reset-password", "/admin", "/apercu-site", "/site-web",
];
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

  // Site public d'une agence : 404 si l'adresse n'existe pas ou si le site est hors ligne. La page elle-même
  // répondrait 200 (affichage progressif), d'où cette vérification légère avant l'affichage.
  const site = /^\/site\/([a-z0-9-]+)\/?$/i.exec(pathname);
  if (site && request.method === "GET" && !request.headers.has("rsc")) {
    const { data: online, error } = await supabase.rpc("website_is_online", { p_slug: site[1]!.toLowerCase() });
    if (!error && online === false) return siteNotFound(response);
  }

  if (!signedIn && matches(pathname, PROTECTED)) {
    return noStoreForConsole(pathname, redirectKeepingCookies(request, response, "/login", { next: `${pathname}${search}` }));
  }
  if (signedIn && matches(pathname, GUEST_ONLY)) {
    // Déjà connecté : on suit l'adresse de retour (ex. une invitation), sinon le tableau de bord.
    const next = new URL(safeNext(request.nextUrl.searchParams.get("next"), "/dashboard"), request.url);
    return redirectKeepingCookies(request, response, next.pathname, Object.fromEntries(next.searchParams));
  }
  return noStoreForConsole(pathname, response);
}

/** Page 404 d'un site d'agence inconnu ou hors ligne (simple, sans données). */
function siteNotFound(from: NextResponse): NextResponse {
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Site introuvable</title></head><body style="margin:0;font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#fff;color:#0f172a;text-align:center;padding:16px"><main><h1 style="font-size:1.5rem">Ce site n'est pas disponible</h1><p style="color:#475569">L'adresse est peut-être erronée, ou l'agence a mis son site hors ligne.</p><p><a href="/" style="color:#334155">SELECT Agency</a></p></main></body></html>`;
  const res = new NextResponse(html, { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=60", "X-Robots-Tag": "noindex" } });
  for (const cookie of from.cookies.getAll()) res.cookies.set(cookie);
  return res;
}

/** Console SELECT : « private, no-store » (aucune copie gardée par un proxy, un réseau ou le navigateur). */
function noStoreForConsole(pathname: string, response: NextResponse): NextResponse {
  if (matches(pathname, ["/admin"])) response.headers.set("Cache-Control", "private, no-store, max-age=0");
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
