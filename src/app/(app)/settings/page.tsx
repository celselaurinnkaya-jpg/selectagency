import { Suspense } from "react";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, PageHeader, Section } from "@/components/shared/ui";
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
  const { agency } = await getAgencySettings();
  return (
    <Section title="Agence">
      <Card>
        <SettingsForm agency={agency} />
      </Card>
    </Section>
  );
}
