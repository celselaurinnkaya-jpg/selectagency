import { Suspense } from "react";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { PageHeader } from "@/components/shared/ui";
import { countryOptions, RESIDENCE_COUNTRIES } from "@/lib/countries";
import { ROLE } from "@/lib/domain/labels";
import { getTeam } from "@/features/operations/queries";
import { ClientForm } from "@/features/clients/ClientForm";

export const metadata: Metadata = { title: "Nouveau client" };

export default function NewClientPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={{ href: "/clients", label: "Retour aux clients" }}
        title="Nouveau client"
        description="Seuls le nom, le téléphone, le pays et la ville sont obligatoires : le reste peut être complété plus tard."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Form />
      </Suspense>
    </div>
  );
}

async function Form() {
  const { agency, members, currentMemberId } = await getTeam();
  return (
    <ClientForm
      defaultCountry={agency.countryCode}
      defaultMemberId={currentMemberId}
      countries={countryOptions(RESIDENCE_COUNTRIES).map((c) => ({ value: c.code, label: c.name }))}
      members={members
        .filter(({ member }) => member.role !== "viewer")
        .map(({ member }) => ({ value: member.id, label: `${member.fullName} (${ROLE[member.role].label})` }))}
    />
  );
}
