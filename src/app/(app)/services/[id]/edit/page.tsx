import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Notice, PageHeader, Section } from "@/components/shared/ui";
import { getAgencyContext } from "@/lib/auth/context";
import { forbiddenMessage } from "@/lib/auth/permissions";
import { getServiceForEdit } from "@/features/services/queries";
import { ServiceForm } from "@/features/services/ServiceForms";
import { ServiceStepsEditor } from "@/features/services/ServiceSteps";

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
  const { service, steps, followed, canManage, currency } = edit;
  return (
    <>
      <PageHeader back={{ href: `/services/${service.id}`, label: "Retour au service" }} title={`Modifier « ${service.name} »`} />
      {canManage ? (
        <div className="space-y-6">
          <ServiceForm service={service} defaultCurrency={currency} />
          <Section id="etapes" title="Étapes du suivi" className="scroll-mt-24">
            <p className="mb-4 text-sm text-slate-600">
              Les étapes que l&apos;agence coche pour chaque client de ce service, dans l&apos;ordre. Adaptez-les à votre façon de travailler : par exemple
              « Logement trouvé », « Contrat signé », « Clés remises » pour un hébergement.
            </p>
            <div className="rounded-xl bg-white p-4 shadow-[0_1px_2px_rgba(2,55,100,0.08)]">
              <ServiceStepsEditor serviceId={service.id} steps={steps.map((s) => s.label)} followed={followed} />
            </div>
          </Section>
        </div>
      ) : (
        <Notice>{forbiddenMessage(await getAgencyContext(), "services.manage")}</Notice>
      )}
    </>
  );
}
