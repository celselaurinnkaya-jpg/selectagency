import { Suspense } from "react";
import type { Metadata } from "next";
import { FeatureLocked } from "@/components/shared/FeatureLocked";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { PageHeader } from "@/components/shared/ui";
import { AgentIaSubNav } from "@/features/agent-ia/AgentIaSubNav";
import { KnowledgeManager } from "@/features/agent-ia/KnowledgeManager";
import { loadKnowledgePageData } from "@/features/agent-ia/knowledge-queries";

export const metadata: Metadata = { title: "Agent IA — Connaissances" };

type SearchParams = Promise<{ agent?: string | string[] }>;

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageHeader
        title="Agent IA"
        description="Les documents, textes et liens de l'agence : l'agent répond à partir de ces informations, sans inventer de tarifs ni de délais."
      />
      <AgentIaSubNav active="connaissances" />
      <Suspense fallback={<PageSkeleton />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Content({ searchParams }: { searchParams: SearchParams }) {
  const { agent } = await searchParams;
  const data = await loadKnowledgePageData(typeof agent === "string" ? agent : undefined);
  if (data.isLocked) return <FeatureLocked feature="ai_agent" />;
  return (
    <KnowledgeManager
      sources={data.sources}
      agents={data.agents}
      selectedAgentId={data.selectedAgentId}
      totalChunks={data.totalChunks}
      canManage={data.canManage}
    />
  );
}
