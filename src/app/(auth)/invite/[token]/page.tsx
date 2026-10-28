import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, Notice } from "@/components/shared/ui";
import { getSessionUser } from "@/lib/auth/context";
import { ROLE } from "@/lib/domain/labels";
import type { MemberRole } from "@/lib/domain/types";
import { createClient } from "@/lib/supabase/server";
import { AuthHeading } from "@/features/auth/AuthHeading";
import { AcceptInvitationForm } from "@/features/onboarding/OnboardingForms";

export const metadata: Metadata = { title: "Invitation" };

export default function InvitePage({ params }: PageProps<"/invite/[token]">) {
  return (
    <>
      <AuthHeading title="Invitation à rejoindre une agence" />
      <Suspense fallback={<div className="h-48" />}>
        <Invite params={params} />
      </Suspense>
    </>
  );
}

const STATUS_MESSAGE: Record<string, string> = {
  revoked: "Cette invitation a été annulée par l'agence.",
  accepted: "Cette invitation a déjà été utilisée.",
  expired: "Cette invitation a expiré : demandez-en une nouvelle à l'agence.",
};

async function Invite({ params }: Pick<PageProps<"/invite/[token]">, "params">) {
  const { token } = await params;
  const valid = /^[0-9a-f-]{36}$/i.test(token);
  const supabase = await createClient();
  const { data } = valid ? await supabase.rpc("get_invitation", { p_token: token }) : { data: null };
  const invitation = (data as { agency_name: string; email: string; role: MemberRole; status: string }[] | null)?.[0];

  if (!invitation) {
    return <Notice tone="warning" title="Invitation introuvable">Vérifiez le lien reçu, ou demandez une nouvelle invitation à l&apos;agence.</Notice>;
  }
  if (invitation.status !== "pending") {
    return <Notice tone="warning">{STATUS_MESSAGE[invitation.status]}</Notice>;
  }

  const user = await getSessionUser();
  const here = `/invite/${token}`;
  return (
    <Card className="space-y-4">
      <p className="text-sm text-slate-700">
        <strong className="text-slate-900">{invitation.agency_name}</strong> vous invite à rejoindre son équipe comme{" "}
        <strong>{ROLE[invitation.role].label.toLowerCase()}</strong>.
      </p>
      <p className="text-sm text-slate-600">
        Invitation adressée à <strong className="text-slate-900">{invitation.email}</strong>.
      </p>
      {!user ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="accent">
            <Link href={`/signup?email=${encodeURIComponent(invitation.email)}&next=${encodeURIComponent(here)}`}>Créer mon compte</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/login?next=${encodeURIComponent(here)}`}>J&apos;ai déjà un compte</Link>
          </Button>
        </div>
      ) : user.email.toLowerCase() === invitation.email ? (
        <AcceptInvitationForm token={token} />
      ) : (
        <Notice tone="warning">
          Vous êtes connecté avec {user.email}. Déconnectez-vous, puis connectez-vous ou créez un compte avec {invitation.email}.
        </Notice>
      )}
    </Card>
  );
}
