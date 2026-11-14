import "server-only";
import { getAgencyContext } from "@/lib/auth/context";
import type { AiStatsSummary } from "@/lib/domain/ai";

export interface StatsPageData {
  stats: AiStatsSummary;
  isLocked: boolean;
  agencyName: string;
}

export async function loadAiStatsPageData(): Promise<StatsPageData> {
  const ctx = await getAgencyContext();
  const isLocked = ctx.locked.includes("ai_agent");

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const plan = ctx.subscription?.plan;
  const tier = plan?.tier ?? "pro";
  // Même règle que la base (private.ai_limits) : pendant l'essai et la démonstration, quota de la formule PRO.
  const onTrial = ctx.isDemo || !ctx.subscription || ctx.subscription.status === "trialing";
  const monthlyQuota = Math.max(plan?.monthlyAiReplies ?? 0, onTrial ? 2000 : 0);

  if (isLocked) {
    return {
      stats: {
        periodMonth: currentMonthKey,
        totalConversations: 0,
        inboundCount: 0,
        outboundCount: 0,
        aiRepliesCount: 0,
        humanConversationsCount: 0,
        aiConversationsCount: 0,
        assistConversationsCount: 0,
        monthlyQuota: 0,
        percentQuotaUsed: 0,
        estimatedCostFcfa: 0,
        planTier: "starter",
      },
      isLocked: true,
      agencyName: ctx.agency.name,
    };
  }

  // 1. Lire les conversations pour compter par mode
  const { data: convs } = await ctx.supabase
    .from("wa_conversations")
    .select("mode")
    .eq("organization_id", ctx.organizationId);

  const totalConversations = (convs ?? []).length;
  const aiConversationsCount = (convs ?? []).filter((c) => c.mode === "ai").length;
  const assistConversationsCount = (convs ?? []).filter((c) => c.mode === "assist").length;
  const humanConversationsCount = (convs ?? []).filter((c) => c.mode === "human").length;

  // 2. Lire la consommation du mois en cours
  const { data: usageRow } = await ctx.supabase
    .from("ai_usage_monthly")
    .select("*")
    .eq("organization_id", ctx.organizationId)
    .eq("period_month", currentMonthKey)
    .maybeSingle();

  const inboundCount = Number(usageRow?.inbound_count ?? 0);
  const outboundCount = Number(usageRow?.outbound_count ?? 0);
  const aiRepliesCount = Number(usageRow?.ai_replies_count ?? 0);
  const estimatedCostUsd = Number(usageRow?.estimated_ai_cost_usd ?? 0);
  const estimatedCostFcfa = Math.round(estimatedCostUsd * 587);

  const percentQuotaUsed = monthlyQuota > 0 ? Math.min(100, Math.round((aiRepliesCount / monthlyQuota) * 100)) : 0;

  return {
    stats: {
      periodMonth: currentMonthKey,
      totalConversations,
      inboundCount,
      outboundCount,
      aiRepliesCount,
      humanConversationsCount,
      aiConversationsCount,
      assistConversationsCount,
      monthlyQuota,
      percentQuotaUsed,
      estimatedCostFcfa,
      planTier: tier,
    },
    isLocked: false,
    agencyName: ctx.agency.name,
  };
}

