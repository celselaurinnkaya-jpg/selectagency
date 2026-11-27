import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { SignupForm } from "@/features/auth/AuthForms";
import { AuthHeading } from "@/features/auth/AuthHeading";
import { inviteFromNext, signupDescription, type InviteKind } from "@/features/auth/invite-context";
import { safeNext } from "@/features/auth/redirects";

export const metadata: Metadata = { title: "Créer un compte" };

export default function SignupPage({ searchParams }: PageProps<"/signup">) {
  return (
    <Suspense fallback={<div className="h-96" />}>
      <Signup searchParams={searchParams} />
    </Suspense>
  );
}

const INVITE_LOOKUP: Record<InviteKind, string> = {
  team: "get_invitation",
  client: "get_client_portal_access",
  partner: "get_partner_access",
};

/** Nom de l'agence qui a envoyé le lien (le jeton fait office de secret, comme sur la page du lien). */
async function invitingAgency(kind: InviteKind, token: string): Promise<string | undefined> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.rpc(INVITE_LOOKUP[kind], { p_token: token });
    return (data as { agency_name?: string }[] | null)?.[0]?.agency_name;
  } catch {
    return undefined;
  }
}

async function Signup({ searchParams }: Pick<PageProps<"/signup">, "searchParams">) {
  const query = await searchParams;
  const next = typeof query.next === "string" ? safeNext(query.next, "") : "";
  const email = typeof query.email === "string" ? query.email : undefined;
  // Arrivée par un lien d'invitation : seulement la création du compte, sans parler de créer une agence.
  const invite = inviteFromNext(next);
  const agencyName = invite ? await invitingAgency(invite.kind, invite.token) : undefined;
  return (
    <>
      <AuthHeading title="Créer un compte" description={signupDescription(invite?.kind, agencyName)} />
      <div className="space-y-5">
        <SignupForm next={next || undefined} email={email} />
        <p className="text-center text-sm text-slate-600">
          Déjà un compte ?{" "}
          <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-medium text-navy-700 hover:underline">
            Se connecter
          </Link>
        </p>
        <p className="text-xs text-slate-500">
          En créant un compte, vous acceptez que les données saisies soient hébergées par Supabase pour le compte de votre agence.
        </p>
      </div>
    </>
  );
}
