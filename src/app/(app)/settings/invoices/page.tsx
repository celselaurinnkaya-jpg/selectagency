import { Suspense } from "react";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, Notice, PageHeader, Section } from "@/components/shared/ui";
import { IMAGE_KINDS } from "@/features/invoices/document";
import { BrandingImageField, InvoiceSettingsForm } from "@/features/invoices/InvoiceSettingsForms";
import { getInvoiceSettingsPage } from "@/features/invoices/queries";
import { SettingsNav } from "@/features/settings/SettingsNav";

export const metadata: Metadata = { title: "Paramètres des factures" };

export default function InvoiceSettingsPage() {
  return (
    <>
      <PageHeader title="Paramètres" description="Logo, cachet, signature et coordonnées imprimés sur les factures de l'agence." />
      <SettingsNav active="factures" />
      <Suspense fallback={<PageSkeleton />}>
        <InvoiceSettingsContent />
      </Suspense>
    </>
  );
}

async function InvoiceSettingsContent() {
  const { agency, organizationId, settings, images, canManage, readOnly } = await getInvoiceSettingsPage();
  if (!canManage) {
    return readOnly ? (
      <Notice tone="warning">L&apos;agence est en lecture seule : les paramètres seront de nouveau modifiables dès l&apos;activation de l&apos;abonnement.</Notice>
    ) : (
      <Notice>Seuls le propriétaire et les administrateurs peuvent modifier le logo, le cachet, la signature et les coordonnées des factures.</Notice>
    );
  }
  return (
    <div className="space-y-6">
      <Section title="Logo, cachet et signature">
        <div className="grid gap-3 md:grid-cols-3">
          {IMAGE_KINDS.map((kind) => (
            <BrandingImageField key={kind} organizationId={organizationId} kind={kind} url={images[kind]} />
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-600">
          PNG ou JPEG, 2 Mo au maximum. Les images restent privées : elles ne s&apos;affichent qu&apos;aux membres de l&apos;agence qui voient la
          finance, et sur les factures que vous remettez.
        </p>
      </Section>
      <Section title="Coordonnées sur les factures">
        <Card>
          <InvoiceSettingsForm settings={settings} agencyName={agency.name} />
        </Card>
      </Section>
    </div>
  );
}
