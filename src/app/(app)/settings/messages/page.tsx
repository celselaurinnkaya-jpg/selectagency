import { Suspense } from "react";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Notice, PageHeader, Section } from "@/components/shared/ui";
import { getMessageTemplatesPage } from "@/features/communications/queries";
import { MessageTemplateList } from "@/features/communications/MessageTemplateForms";
import { SettingsNav } from "@/features/settings/SettingsNav";

export const metadata: Metadata = { title: "Modèles de messages" };

export default function MessageTemplatesPage() {
  return (
    <>
      <PageHeader
        title="Paramètres"
        description="Les messages que vos conseillers envoient sur WhatsApp, Messenger ou Instagram : réponse à une demande, relance, rendez-vous, pièces manquantes…"
      />
      <SettingsNav active="messages" />
      <Suspense fallback={<PageSkeleton />}>
        <Templates />
      </Suspense>
    </>
  );
}

async function Templates() {
  const { templates, canManage, agencyName } = await getMessageTemplatesPage();
  return (
    <div className="space-y-6">
      <Notice title="Comment ça marche">
        Sur la fiche d&apos;un client ou d&apos;un prospect, onglet « Communications », le conseiller choisit un modèle : les zones
        ({"{prenom}"}, {"{dossier}"}…) sont remplies avec la fiche, il relit, puis WhatsApp s&apos;ouvre avec le texte. C&apos;est lui qui
        l&apos;envoie : SELECT n&apos;envoie rien à sa place.
      </Notice>
      {!canManage && <Notice>Seuls le propriétaire et les administrateurs modifient les modèles. Vous pouvez les utiliser depuis les fiches.</Notice>}
      <Section title="Modèles de l'agence">
        <MessageTemplateList templates={templates} agencyName={agencyName} canManage={canManage} />
      </Section>
    </div>
  );
}
