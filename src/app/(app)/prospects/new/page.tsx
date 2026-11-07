import { Suspense } from "react";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Notice, PageHeader } from "@/components/shared/ui";
import { getProspectForm } from "@/features/prospects/queries";
import { ProspectForm } from "@/features/prospects/ProspectForms";

export const metadata: Metadata = { title: "Nouveau prospect" };

export default function NewProspectPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={{ href: "/prospects", label: "Retour aux prospects" }}
        title="Nouveau prospect"
        description="Le minimum pour ne perdre personne : nom, téléphone, origine du contact et date de relance. La fiche se complète quand la personne devient cliente."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Form />
      </Suspense>
    </div>
  );
}

async function Form() {
  const form = await getProspectForm();
  if (form.forbidden) return <Notice>{form.forbidden}</Notice>;
  return <ProspectForm countries={form.countries} members={form.members} defaultCountry={form.defaultCountry} defaultMemberId={form.defaultMemberId} today={form.today} campaigns={form.campaigns} partnersLocked={form.partnersLocked} />;
}
