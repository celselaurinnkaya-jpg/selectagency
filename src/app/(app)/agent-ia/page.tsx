import { Suspense } from "react";
import type { Metadata } from "next";
import { FeatureLocked } from "@/components/shared/FeatureLocked";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { PageHeader } from "@/components/shared/ui";
import { AgentIaSubNav } from "@/features/agent-ia/AgentIaSubNav";
import { ConversationsInbox } from "@/features/agent-ia/ConversationsInbox";
import { loadInboxPageData } from "@/features/agent-ia/conversations-queries";

export const metadata: Metadata = { title: "Agent IA — Conversations" };

type SearchParams = Promise<{ c?: string | string[] }>;

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageHeader
        title="Agent IA"
        description="Les discussions du numéro WhatsApp Business de l'agence, en temps réel. L'IA répond, propose une réponse ou laisse la main à un conseiller."
      />
      <AgentIaSubNav active="conversations" />
      <Suspense fallback={<PageSkeleton />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Content({ searchParams }: { searchParams: SearchParams }) {
  const { c } = await searchParams;
  const selected = typeof c === "string" ? c : undefined;
  const data = await loadInboxPageData(selected);
  if (data.isLocked) return <FeatureLocked feature="ai_agent" />;
  return (
    <ConversationsInbox
      conversations={data.conversations}
      selectedConversation={data.selectedConversation}
      messages={data.messages}
      clients={data.clients}
      members={data.members}
      canManage={data.canManage}
      agencyName={data.agencyName}
      organizationId={data.organizationId}
      connectedNumber={data.connectedNumber}
      openOnMobile={Boolean(selected)}
    />
  );
}
