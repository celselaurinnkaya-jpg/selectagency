import { Suspense } from "react";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { PageHeader } from "@/components/shared/ui";
import { countryOptions, DESTINATION_COUNTRIES } from "@/lib/countries";
import { ROLE } from "@/lib/domain/labels";
import { getCaseFormOptions } from "@/features/cases/queries";
import { CaseForm } from "@/features/cases/CaseForm";

export const metadata: Metadata = { title: "Nouveau dossier" };

export default function NewCasePage({ searchParams }: PageProps<"/cases/new">) {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={{ href: "/cases", label: "Retour aux dossiers" }} title="Nouveau dossier" description="Un dossier correspond à un projet d'un client : une demande de visa, un projet d'études, un voyage." />
      <Suspense fallback={<PageSkeleton />}>
        <Form searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Form({ searchParams }: Pick<PageProps<"/cases/new">, "searchParams">) {
  const { client } = await searchParams;
  const options = await getCaseFormOptions(typeof client === "string" ? client : undefined);
  return (
    <CaseForm
      clients={options.clients.map((c) => ({ value: c.id, label: c.label }))}
      members={options.members.map((m) => ({ value: m.id, label: `${m.fullName} (${ROLE[m.role].label})` }))}
      destinations={countryOptions(DESTINATION_COUNTRIES).map((c) => ({ value: c.code, label: c.name }))}
      defaultClientId={options.preselectedClientId}
      defaultMemberId={options.currentMemberId}
    />
  );
}
