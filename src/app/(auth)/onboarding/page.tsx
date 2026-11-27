import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Card } from "@/components/shared/ui";
import { requireSessionUser } from "@/lib/auth/context";
import { countryOptions, RESIDENCE_COUNTRIES } from "@/lib/countries";
import { ROLE } from "@/lib/domain/labels";
import type { MemberRole } from "@/lib/domain/types";
import { isDemoEnabled } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { AuthHeading } from "@/features/auth/AuthHeading";
import { inviteHref } from "@/features/auth/invite-context";
import { AcceptInvitationForm, CreateAgencyForm, DemoAgencyButton } from "@/features/onboarding/OnboardingForms";

export const metadata: Metadata = { title: "Bienvenue" };

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="h-96" />}>
      <Onboarding />
    </Suspense>
  );
}

/** Lien d'espace client ou d'espace partenaire envoyé à l'adresse du compte, pas encore ouvert. */
interface PendingSpace {
  kind: "client" | "partner";
  token: string;
  agency_name: string;
}

async function Onboarding() {
  const user = await requireSessionUser();
  const { data: membership } = await user.supabase.from("members").select("id").eq("user_id", user.userId).limit(1).maybeSingle();
  if (membership) redirect("/dashboard");

  const [{ data: invitations }, { data: access }, { data: isPartner }, { data: isPortalClient }, { data: spaces }] = await Promise.all([
    user.supabase.rpc("my_invitations"),
    user.supabase.rpc("platform_access"),
    user.supabase.rpc("is_partner"),
    // Avant la migration 20261122200000, la fonction n'existe pas : la réponse est simplement vide.
    user.supabase.rpc("is_portal_client"),
    // Avant la migration 20261126100000, la fonction n'existe pas : la réponse est simplement vide.
    user.supabase.rpc("my_pending_accesses"),
  ]);
  const pending = (invitations ?? []) as { token: string; agency_name: string; role: MemberRole; expires_at: string }[];
  const pendingSpaces = (spaces ?? []) as PendingSpace[];
  const nothingElse = pending.length === 0 && access === "none" && pendingSpaces.length === 0;
  // Partenaire d'une agence, sans invitation à rejoindre une équipe : son espace l'attend.
  if (isPartner && nothingElse) redirect("/partenaire");
  // Client d'une agence (espace client), sans autre rôle : son espace l'attend.
  if (isPortalClient && !isPartner && nothingElse) redirect("/espace-client");
  // Un seul lien d'espace client ou partenaire, pas encore ouvert (connexion sans repasser par le lien) : on y retourne.
  if (pendingSpaces.length === 1 && pending.length === 0 && access === "none" && !isPartner && !isPortalClient) {
    redirect(inviteHref(pendingSpaces[0]!.kind, pendingSpaces[0]!.token));
  }

  // Personne invitée (équipe, espace client, espace partenaire) : elle rejoint ce à quoi on l'a invitée ; la création
  // d'une agence (et la démonstration) ne lui est pas proposée.
  const invited = pending.length > 0 || pendingSpaces.length > 0 || Boolean(isPartner) || Boolean(isPortalClient);

  return (
    <>
      <AuthHeading
        title="Bienvenue sur SELECT Agency"
        description={
          pending.length > 0
            ? "Dernière étape : rejoignez l'agence qui vous a invité."
            : invited
              ? "Ouvrez l'espace que votre agence vous a préparé."
              : "Dernière étape : créez votre agence."
        }
      />
      <div className="space-y-6">
        {isPartner && (
          <Card className="space-y-2">
            <p className="text-sm text-slate-700">Votre compte a un espace partenaire : vos clients recommandés et vos commissions.</p>
            <Link href="/partenaire" className="inline-flex min-h-10 items-center text-sm font-medium text-navy-700 hover:underline">
              Ouvrir mon espace partenaire
            </Link>
          </Card>
        )}
        {isPortalClient && (
          <Card className="space-y-2">
            <p className="text-sm text-slate-700">Votre compte a un espace client : l&apos;avancement de votre dossier et vos documents.</p>
            <Link href="/espace-client" className="inline-flex min-h-10 items-center text-sm font-medium text-navy-700 hover:underline">
              Ouvrir mon espace client
            </Link>
          </Card>
        )}
        {pendingSpaces.map((space) => (
          <Card key={`${space.kind}-${space.token}`} className="space-y-2">
            <p className="text-sm text-slate-700">
              <strong className="text-slate-900">{space.agency_name}</strong> vous a ouvert un {space.kind === "client" ? "espace client" : "espace partenaire"}.
            </p>
            <Link href={inviteHref(space.kind, space.token)} className="inline-flex min-h-10 items-center text-sm font-medium text-navy-700 hover:underline">
              {space.kind === "client" ? "Ouvrir mon espace client" : "Ouvrir mon espace partenaire"}
            </Link>
          </Card>
        ))}
        {access !== "none" && (
          <Card className="space-y-2">
            <p className="text-sm text-slate-700">Votre compte fait partie de l&apos;équipe SELECT : la console de la plateforme n&apos;a pas besoin d&apos;agence.</p>
            <Link href="/admin" className="inline-flex min-h-10 items-center text-sm font-medium text-navy-700 hover:underline">
              Ouvrir la console SELECT
            </Link>
          </Card>
        )}
        {pending.length > 0 && (
          <section aria-labelledby="invitations-titre" className="space-y-3">
            <h2 id="invitations-titre" className="text-base font-semibold text-navy-800">
              Vous êtes invité
            </h2>
            {pending.map((invitation) => (
              <Card key={invitation.token} className="space-y-3">
                <p className="text-sm text-slate-700">
                  <strong className="text-slate-900">{invitation.agency_name}</strong> vous invite comme {ROLE[invitation.role].label.toLowerCase()}.
                  <span className="block text-xs text-slate-500">Invitation valable jusqu&apos;au {formatDate(invitation.expires_at, "Africa/Douala")}.</span>
                </p>
                <AcceptInvitationForm token={invitation.token} />
              </Card>
            ))}
          </section>
        )}

        {!invited && (
          <section aria-labelledby="agence-titre" className="space-y-3">
            <h2 id="agence-titre" className="text-base font-semibold text-navy-800">
              Votre agence
            </h2>
            <CreateAgencyForm countries={countryOptions(RESIDENCE_COUNTRIES)} defaultFullName={user.fullName} />
          </section>
        )}

        {!invited && isDemoEnabled() && (
          <section aria-labelledby="demo-titre" className="space-y-2 rounded-xl border border-dashed border-slate-300 p-4">
            <h2 id="demo-titre" className="text-sm font-semibold text-navy-800">
              Découvrir d&apos;abord ?
            </h2>
            <p className="text-sm text-slate-600">
              Une agence fictive, remplie de clients et de dossiers d&apos;exemple, utilisable pendant 7 jours. Vous pourrez la quitter à tout moment pour créer la vôtre.
            </p>
            <DemoAgencyButton />
          </section>
        )}
      </div>
    </>
  );
}
