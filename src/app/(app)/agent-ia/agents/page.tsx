import { Suspense } from "react";
import type { Metadata } from "next";
import { FeatureLocked } from "@/components/shared/FeatureLocked";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { PageHeader } from "@/components/shared/ui";
import { AgentIaSubNav } from "@/features/agent-ia/AgentIaSubNav";
import { AgentsManager } from "@/features/agent-ia/AgentsManager";
import { loadAiAgentsData } from "@/features/agent-ia/queries";

export const metadata: Metadata = { title: "Agent IA — Support client" };

export default function Page() {
  return (
    <>
      <PageHeader
        title="Agent IA — Support client"
        description="Configurez votre assistant de Support Client : rédigez son prompt, déposez vos documents (PDF) et joignez vos liens (page Facebook, boutique, site) pour qu'il réponde automatiquement à vos clients sur WhatsApp."
      />
      <AgentIaSubNav active="agents" />
      <Suspense fallback={<PageSkeleton />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const data = await loadAiAgentsData();
  if (data.isLocked) return <FeatureLocked feature="ai_agent" />;
  return (
    <AgentsManager
      agents={data.agents}
      usage={data.usage}
      agencyName={data.agencyName}
      canManage={data.canManage}
      sources={data.sources}
      accounts={data.accounts}
    />
  );
}
