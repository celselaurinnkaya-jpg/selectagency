import { Suspense } from "react";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, Notice, PageHeader, Section } from "@/components/shared/ui";
import { getAgencySettings } from "@/features/operations/queries";
import { SettingsForm } from "@/features/settings/SettingsForm";
import { SettingsNav } from "@/features/settings/SettingsNav";

export const metadata: Metadata = { title: "Paramètres" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Paramètres" description="Identité de l'agence, devise, fuseau horaire et numérotation des reçus." />
      <SettingsNav active="agence" />
      <Suspense fallback={<PageSkeleton />}>
        <Settings />
      </Suspense>
    </>
  );
}

async function Settings() {
  const { agency, canManage, readOnly } = await getAgencySettings();
  return (
    <Section title="Agence">
      {canManage ? (
        <Card>
          <SettingsForm agency={agency} />
        </Card>
      ) : readOnly ? (
        <Notice tone="warning">L&apos;agence est en lecture seule : les paramètres seront de nouveau modifiables dès l&apos;activation de l&apos;abonnement.</Notice>
      ) : (
        <Notice>Seuls le propriétaire et les administrateurs peuvent modifier les paramètres de l&apos;agence.</Notice>
      )}
    </Section>
  );
}
