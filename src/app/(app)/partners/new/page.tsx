import { Suspense } from "react";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Notice, PageHeader } from "@/components/shared/ui";
import { getAgencyContext } from "@/lib/auth/context";
import { forbiddenMessage } from "@/lib/auth/permissions";
import { getPartnerForEdit } from "@/features/partners/queries";
import { PartnerForm } from "@/features/partners/PartnerForms";

export const metadata: Metadata = { title: "Nouveau partenaire" };

export default function NewPartnerPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={{ href: "/partners", label: "Retour aux partenaires" }} title="Nouveau partenaire" description="Son nom, son code et la commission que l'agence lui verse pour chaque client apporté." />
      <Suspense fallback={<PageSkeleton />}>
        <Form />
      </Suspense>
    </div>
  );
}

async function Form() {
  const edit = await getPartnerForEdit();
  if (!edit?.canManage) return <Notice>{forbiddenMessage(await getAgencyContext(), "partners.manage")}</Notice>;
  return <PartnerForm defaultCurrency={edit.currency} />;
}
