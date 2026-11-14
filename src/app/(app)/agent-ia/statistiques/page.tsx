import { Suspense } from "react";
import type { Metadata } from "next";
import { FeatureLocked } from "@/components/shared/FeatureLocked";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { PageHeader } from "@/components/shared/ui";
import { AgentIaSubNav } from "@/features/agent-ia/AgentIaSubNav";
import { AiStatsManager } from "@/features/agent-ia/AiStatsManager";
import { loadAiStatsPageData } from "@/features/agent-ia/stats-queries";

export const metadata: Metadata = { title: "Agent IA — Statistiques" };

export default function Page() {
  return (
    <>
      <PageHeader
        title="Agent IA"
        description="Conversations, réponses de l'IA, passages à un conseiller et consommation du quota de la formule."
      />
      <AgentIaSubNav active="statistiques" />
      <Suspense fallback={<PageSkeleton />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const data = await loadAiStatsPageData();
  if (data.isLocked) return <FeatureLocked feature="ai_agent" />;
  return (
    <AiStatsManager stats={data.stats} agencyName={data.agencyName} />
  );
}
