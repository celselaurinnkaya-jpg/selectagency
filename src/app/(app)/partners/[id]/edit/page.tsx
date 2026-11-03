import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Notice, PageHeader } from "@/components/shared/ui";
import { getAgencyContext } from "@/lib/auth/context";
import { forbiddenMessage } from "@/lib/auth/permissions";
import { getPartnerForEdit } from "@/features/partners/queries";
import { PartnerForm } from "@/features/partners/PartnerForms";

export const metadata: Metadata = { title: "Modifier le partenaire" };

export default function EditPartnerPage({ params }: PageProps<"/partners/[id]/edit">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Form params={params} />
    </Suspense>
  );
}

async function Form({ params }: Pick<PageProps<"/partners/[id]/edit">, "params">) {
  const { id } = await params;
  const edit = await getPartnerForEdit(id);
  if (!edit?.partner) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={{ href: `/partners/${id}`, label: "Retour au partenaire" }} title={`Modifier « ${edit.partner.name} »`} description="Une nouvelle commission par client s'applique aux clients rattachés ensuite ; les commissions déjà créées gardent leur montant." />
      {edit.canManage ? <PartnerForm partner={edit.partner} defaultCurrency={edit.currency} /> : <Notice>{forbiddenMessage(await getAgencyContext(), "partners.manage")}</Notice>}
    </div>
  );
}
