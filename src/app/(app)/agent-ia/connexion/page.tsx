import { Suspense } from "react";
import type { Metadata } from "next";
import { FeatureLocked } from "@/components/shared/FeatureLocked";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { PageHeader } from "@/components/shared/ui";
import { AgentIaSubNav } from "@/features/agent-ia/AgentIaSubNav";
import { WhatsAppConnectionManager } from "@/features/agent-ia/WhatsAppConnectionManager";
import { loadWhatsAppConnectionData } from "@/features/agent-ia/whatsapp-queries";

export const metadata: Metadata = { title: "Agent IA — Connexion WhatsApp" };

export default function Page() {
  return (
    <>
      <PageHeader
        title="Agent IA"
        description="Connectez l'application WhatsApp Business de l'agence par simple scan du code QR ou association de numéro : gardez votre téléphone actif et laissez l'IA répondre 24h/24."
      />
      <AgentIaSubNav active="connexion" />
      <Suspense fallback={<PageSkeleton />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const data = await loadWhatsAppConnectionData();
  if (data.isLocked) return <FeatureLocked feature="ai_agent" />;
  return (
    <WhatsAppConnectionManager
      accounts={data.accounts}
      canManage={data.canManage}
      agencyName={data.agencyName}
      maxWaNumbers={data.maxWaNumbers}
    />
  );
}
