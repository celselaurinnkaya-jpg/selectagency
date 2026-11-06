import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { PageHeader } from "@/components/shared/ui";
import { countryOptions, RESIDENCE_COUNTRIES } from "@/lib/countries";
import { ROLE } from "@/lib/domain/labels";
import { getClientDetail } from "@/features/clients/queries";
import { getShell, getTeam } from "@/features/operations/queries";
import { ClientForm } from "@/features/clients/ClientForm";

export const metadata: Metadata = { title: "Modifier la fiche client" };

export default function EditClientPage({ params }: PageProps<"/clients/[id]">) {
  return (
    <div className="mx-auto max-w-3xl">
      <Suspense fallback={<PageSkeleton />}>
        <EditForm params={params} />
      </Suspense>
    </div>
  );
}

async function EditForm({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detail, team, { locked }] = await Promise.all([getClientDetail(id), getTeam(), getShell()]);

  if (!detail) {
    notFound();
  }

  const { client } = detail;
  const { agency, members, currentMemberId } = team;

  return (
    <>
      <PageHeader
        back={{ href: `/clients/${client.id}`, label: "Retour à la fiche client" }}
        eyebrow={<span className="font-mono text-sm text-slate-500">{client.reference}</span>}
        title={`Modifier ${client.firstName} ${client.lastName}`}
        description="Mettez à jour les informations d'identité, les coordonnées ou les responsables de ce client."
      />
      <ClientForm
        client={client}
        partnerCode={detail.partner?.code}
        partnersLocked={locked.includes("partners")}
        defaultCountry={client.residenceCountry || agency.countryCode}
        defaultMemberId={client.assignedTo || currentMemberId}
        countries={countryOptions(RESIDENCE_COUNTRIES).map((c) => ({ value: c.code, label: c.name }))}
        members={members
          .filter(({ member }) => member.role !== "viewer")
          .map(({ member }) => ({ value: member.id, label: `${member.fullName} (${ROLE[member.role].label})` }))}
      />
    </>
  );
}
