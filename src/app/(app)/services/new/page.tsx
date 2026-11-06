import { Suspense } from "react";
import type { Metadata } from "next";
import { FeatureLocked } from "@/components/shared/FeatureLocked";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Notice, PageHeader } from "@/components/shared/ui";
import { getAgencyContext } from "@/lib/auth/context";
import { allowed, forbiddenMessage } from "@/lib/auth/permissions";
import { loadServices } from "@/features/services/queries";
import { ServiceForm } from "@/features/services/ServiceForms";

export const metadata: Metadata = { title: "Nouveau service" };

export default function NewServicePage({ searchParams }: PageProps<"/services/new">) {
  return (
    <>
      <PageHeader
        back={{ href: "/services", label: "Retour aux services" }}
        title="Nouveau service"
        description="Un service que propose votre agence. Vous y ajouterez ensuite vos clients pour suivre où en est chacun."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Form searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Form({ searchParams }: Pick<PageProps<"/services/new">, "searchParams">) {
  const [{ nom }, ctx] = await Promise.all([searchParams, getAgencyContext()]);
  if (!allowed(ctx, "services.manage")) return <Notice>{forbiddenMessage(ctx, "services.manage")}</Notice>;
  if (ctx.locked.includes("services")) return <FeatureLocked feature="services" />;
  const services = await loadServices(ctx);
  return (
    <ServiceForm
      defaultCurrency={ctx.agency.currency}
      existingNames={services.map((s) => s.name)}
      initialName={typeof nom === "string" ? nom.slice(0, 80) : undefined}
    />
  );
}
