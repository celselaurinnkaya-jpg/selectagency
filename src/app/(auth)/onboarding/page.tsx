import { Suspense } from "react";
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
import { AcceptInvitationForm, CreateAgencyForm, DemoAgencyButton } from "@/features/onboarding/OnboardingForms";

export const metadata: Metadata = { title: "Créer votre agence" };

export default function OnboardingPage() {
  return (
    <>
      <AuthHeading title="Bienvenue sur SELECT Agency" description="Dernière étape : créez votre agence, ou rejoignez celle qui vous a invité." />
      <Suspense fallback={<div className="h-96" />}>
        <Onboarding />
      </Suspense>
    </>
  );
}

async function Onboarding() {
  const user = await requireSessionUser();
  const { data: membership } = await user.supabase.from("members").select("id").eq("user_id", user.userId).limit(1).maybeSingle();
  if (membership) redirect("/dashboard");

  const { data: invitations } = await user.supabase.rpc("my_invitations");
  const pending = (invitations ?? []) as { token: string; agency_name: string; role: MemberRole; expires_at: string }[];

  return (
    <div className="space-y-6">
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

      <section aria-labelledby="agence-titre" className="space-y-3">
        <h2 id="agence-titre" className="text-base font-semibold text-navy-800">
          {pending.length ? "Ou créer votre propre agence" : "Votre agence"}
        </h2>
        <CreateAgencyForm countries={countryOptions(RESIDENCE_COUNTRIES)} defaultFullName={user.fullName} />
      </section>

      {isDemoEnabled() && (
        <section aria-labelledby="demo-titre" className="space-y-2 rounded-xl border border-dashed border-slate-300 p-4">
          <h2 id="demo-titre" className="text-sm font-semibold text-navy-800">
            Découvrir d&apos;abord ?
          </h2>
          <p className="text-sm text-slate-600">
            Une agence fictive, remplie de clients et de dossiers d&apos;exemple. Vous pourrez la quitter à tout moment pour créer la vôtre.
          </p>
          <DemoAgencyButton />
        </section>
      )}
    </div>
  );
}
