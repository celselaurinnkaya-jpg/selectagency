import "server-only";
import { getAgencyContext } from "@/lib/auth/context";
import {
  toAiAgent,
  toAiKnowledgeSource,
  type AiAgentRecord,
  type AiKnowledgeSourceRecord,
} from "@/lib/domain/ai";

export interface KnowledgePageData {
  sources: AiKnowledgeSourceRecord[];
  agents: AiAgentRecord[];
  selectedAgentId?: string;
  totalChunks: number;
  canManage: boolean;
  isLocked: boolean;
  agencyName: string;
}

export async function loadKnowledgePageData(agentFilter?: string): Promise<KnowledgePageData> {
  const ctx = await getAgencyContext();
  const isLocked = ctx.locked.includes("ai_agent");
  const canManage = ["owner", "admin"].includes(ctx.member.role);

  if (isLocked) {
    return {
      sources: [],
      agents: [],
      totalChunks: 0,
      canManage: false,
      isLocked: true,
      agencyName: ctx.agency.name,
    };
  }

  // 1. Lire tous les agents configurés pour cette agence
  const { data: rawAgents } = await ctx.supabase
    .from("ai_agents")
    .select("*")
    .eq("organization_id", ctx.organizationId)
    .order("name", { ascending: true });

  const agents = (rawAgents ?? []).map(toAiAgent);

  // 2. Déterminer l'agent sélectionné (par défaut le premier, ou l'ID fourni)
  const selectedAgentId =
    agentFilter && agents.some((a) => a.id === agentFilter)
      ? agentFilter
      : agents[0]?.id;

  // 3. Lire les sources de connaissances (filtrées par agent si présent)
  let query = ctx.supabase
    .from("ai_knowledge_sources")
    .select("*")
    .eq("organization_id", ctx.organizationId)
    .order("created_at", { ascending: false });

  if (selectedAgentId) {
    query = query.eq("agent_id", selectedAgentId);
  }

  const { data: rawSources, error } = await query;
  if (error) {
    console.error("Erreur lors de la lecture des sources de connaissances :", error);
  }

  const sources = (rawSources ?? []).map(toAiKnowledgeSource);
  const totalChunks = sources.reduce((acc, s) => acc + s.chunksCount, 0);

  return {
    sources,
    agents,
    selectedAgentId,
    totalChunks,
    canManage,
    isLocked: false,
    agencyName: ctx.agency.name,
  };
}

