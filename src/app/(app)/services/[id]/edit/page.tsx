import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Notice, PageHeader } from "@/components/shared/ui";
import { getAgencyContext } from "@/lib/auth/context";
import { forbiddenMessage } from "@/lib/auth/permissions";
import { getServiceForEdit } from "@/features/services/queries";
import { ServiceForm } from "@/features/services/ServiceForms";

export const metadata: Metadata = { title: "Modifier le service" };

export default function EditServicePage({ params }: PageProps<"/services/[id]/edit">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Form params={params} />
    </Suspense>
  );
}

async function Form({ params }: Pick<PageProps<"/services/[id]/edit">, "params">) {
  const { id } = await params;
  const edit = await getServiceForEdit(id);
  if (!edit) notFound();
  const { service, canManage, currency } = edit;
  return (
    <>
      <PageHeader back={{ href: `/services/${service.id}`, label: "Retour au service" }} title={`Modifier « ${service.name} »`} />
      {canManage ? <ServiceForm service={service} defaultCurrency={currency} /> : <Notice>{forbiddenMessage(await getAgencyContext(), "services.manage")}</Notice>}
    </>
  );
}
