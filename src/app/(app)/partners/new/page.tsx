import { Suspense } from "react";
import type { Metadata } from "next";
import { FeatureLocked } from "@/components/shared/FeatureLocked";
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
  const ctx = await getAgencyContext();
  if (!edit?.canManage) return <Notice>{forbiddenMessage(ctx, "partners.manage")}</Notice>;
  if (ctx.locked.includes("partners")) return <FeatureLocked feature="partners" />;
  return <PartnerForm defaultCurrency={edit.currency} />;
}
