import { Suspense } from "react";
import type { Metadata } from "next";
import { FeatureLocked } from "@/components/shared/FeatureLocked";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { PageHeader } from "@/components/shared/ui";
import { AgentIaSubNav } from "@/features/agent-ia/AgentIaSubNav";
import { TemplatesManager } from "@/features/agent-ia/TemplatesManager";
import { loadTemplatesPageData } from "@/features/agent-ia/templates-queries";

export const metadata: Metadata = { title: "Agent IA — Modèles WhatsApp" };

export default function Page() {
  return (
    <>
      <PageHeader
        title="Agent IA"
        description="Les messages approuvés par Meta, nécessaires pour écrire à un client qui n'a pas écrit depuis plus de 24 heures."
      />
      <AgentIaSubNav active="modeles" />
      <Suspense fallback={<PageSkeleton />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const data = await loadTemplatesPageData();
  if (data.isLocked) return <FeatureLocked feature="ai_agent" />;
  return (
    <TemplatesManager templates={data.templates} canManage={data.canManage} />
  );
}
