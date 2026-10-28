import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/features/auth/redirects";

// Lien reçu par e-mail (confirmation d'adresse, réinitialisation du mot de passe, invitation).
// Deux formats selon le modèle d'e-mail Supabase : ?code=… (par défaut) ou ?token_hash=…&type=….
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeNext(searchParams.get("next"), "/dashboard");
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = isSupabaseConfigured() ? await createClient() : null;
  const { error } = !supabase
    ? { error: new Error("Supabase non configuré") }
    : code
      ? await supabase.auth.exchangeCodeForSession(code)
      : tokenHash && type
        ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
        : { error: new Error("Lien incomplet") };

  const target = request.nextUrl.clone();
  target.search = "";
  if (error) {
    target.pathname = "/login";
    target.searchParams.set("erreur", "lien");
  } else {
    const [pathname, query] = next.split("?");
    target.pathname = pathname ?? "/dashboard";
    if (query) target.search = `?${query}`;
  }
  return NextResponse.redirect(target);
}
