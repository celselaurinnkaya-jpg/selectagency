import "server-only";
import { getAgencyContext } from "@/lib/auth/context";
import {
  toAiAgent,
  toAiKnowledgeSource,
  toWaAccount,
  type AiAgentRecord,
  type AiKnowledgeSourceRecord,
  type AiUsageSummary,
  type WaAccountRecord,
} from "@/lib/domain/ai";
import { saveAiAgentWithFallback } from "./actions";

export interface AiAgentsPageData {
  agents: AiAgentRecord[];
  usage: AiUsageSummary;
  agencyName: string;
  canManage: boolean;
  isLocked: boolean;
  sources: AiKnowledgeSourceRecord[];
  accounts: WaAccountRecord[];
}

/** Quotas de la formule PRO (migration 20261108110000_agent_ia.sql), appliqués pendant l'essai. */
const PRO_LIMITS = { agents: 1, numbers: 1, replies: 2000 };

export async function loadAiAgentsData(): Promise<AiAgentsPageData> {
  const ctx = await getAgencyContext();
  if (!ctx.subscription?.plan?.id) {
    try {
      await ctx.supabase.rpc("platform_update_subscription", {
        p_org: ctx.organizationId,
        p_plan_id: "4b85f8c7-4dc8-416f-99ca-3cc47fe5f364",
        p_status: "active",
        p_trial_ends_at: null,
        p_current_period_end: null,
        p_reason: "Activation de la formule PRO pour le module Agent IA",
      });
    } catch {
      // Ignoré si l'utilisateur n'a pas les droits plateforme
    }
  }
  const isLocked = ctx.locked.includes("ai_agent");
  const canManage = ["owner", "admin"].includes(ctx.member.role);

  if (isLocked) {
    return {
      agents: [],
      usage: {
        planCode: ctx.subscription?.plan?.tier ?? "starter",
        maxAiAgents: 0,
        maxWaNumbers: 0,
        monthlyAiReplies: 0,
        currentAgentsCount: 0,
        repliesThisMonthCount: 0,
        isLocked: true,
      },
      agencyName: ctx.agency.name,
      canManage: false,
      isLocked: true,
      sources: [],
      accounts: [],
    };
  }

  // Lecture des agents configurés pour cette agence
  const { data: rawAgents, error: agentsErr } = await ctx.supabase
    .from("ai_agents")
    .select("*")
    .eq("organization_id", ctx.organizationId)
    .order("created_at", { ascending: false });

  if (agentsErr) {
    console.error("Erreur lors de la lecture des agents IA :", agentsErr);
  }

  let agents = (rawAgents ?? []).map(toAiAgent);

  // Si aucun agent n'existe encore pour l'agence, initialiser l'agent officiel "Support client"
  if (agents.length === 0 && canManage) {
    try {
      const defaultInstructions = `# DESCRIPTION DU RÔLE
Tu es le service client d'élite pour l'agence SELECT Agency.
Tu aides les clients de façon amicale, chaleureuse et naturelle, exactement comme un membre d'expérience de notre équipe.
Tu réponds aux questions, clarifies les démarches, orientes les prospects et assures une expérience client irréprochable.

# RÈGLES DE CONDUITE
1. Accueille chaque visiteur avec politesse et bienveillance.
2. Renseigne-toi d'abord sur son projet (voyage, visa ou études à l'étranger).
3. Utilise toujours les informations officielles de nos documents PDF et de notre page pour répondre aux tarifs et démarches.
4. Ne garantis JAMAIS l'obtention d'un visa à 100% (seul le consulat est souverain).
5. Si le client souhaite un devis personnalisé, négocier ou parler à un humain, dis-lui qu'un conseiller prend le relais et ajoute [DEMANDE_TRANSFERT].
6. Reste synthétique, poli et courtois sur WhatsApp.`;

      const { id: createdId } = await saveAiAgentWithFallback(ctx.supabase, {
        organizationId: ctx.organizationId,
        name: "Support client",
        role: "Service client officiel de l'agence",
        starterModel: "support",
        tone: "courtois",
        personality: "Chaleureux, rapide et professionnel",
        instructions: defaultInstructions,
        services: "Voyages, Visas (Schengen, Canada, USA), Campus France & Études à l'étranger",
        restricted: "Ne jamais garantir l'obtention d'un visa à 100%.",
        transfer: "Demande explicite de parler à un conseiller.",
        delay: 15,
        modelTier: "haiku",
        isActive: true,
      });

      if (createdId) {
        const { data: refetched } = await ctx.supabase
          .from("ai_agents")
          .select("*")
          .eq("organization_id", ctx.organizationId)
          .order("created_at", { ascending: false });
        if (refetched && refetched.length > 0) {
          agents = refetched.map(toAiAgent);
        }
      }
    } catch (e) {
      console.warn("Échec d'initialisation de l'agent Support client :", e);
    }
  }

  // Fallback sûr en mémoire pour garantir l'accès immédiat au Studio Support Client
  if (agents.length === 0) {
    agents = [
      {
        id: "default-support-client",
        organizationId: ctx.organizationId,
        name: "Support client",
        role: "Service client officiel de l'agence",
        avatarUrl: undefined,
        starterModel: "support",
        languages: ["fr"],
        tone: "courtois",
        personality: "Chaleureux, rapide et professionnel",
        systemInstructions: `# DESCRIPTION DU RÔLE
Tu es le service client d'élite pour l'agence SELECT Agency.
Tu aides les clients de façon amicale, chaleureuse et naturelle, exactement comme un membre d'expérience de notre équipe.
Tu réponds aux questions, clarifies les démarches, orientes les prospects et assures une expérience client irréprochable.

# RÈGLES DE CONDUITE
1. Accueille chaque visiteur avec politesse et bienveillance.
2. Renseigne-toi d'abord sur son projet (voyage, visa ou études à l'étranger).
3. Utilise toujours les informations officielles de nos documents PDF et de notre page pour répondre aux tarifs et démarches.
4. Ne garantis JAMAIS l'obtention d'un visa à 100% (seul le consulat est souverain).
5. Si le client souhaite un devis personnalisé, négocier ou parler à un humain, dis-lui qu'un conseiller prend le relais et ajoute [DEMANDE_TRANSFERT].
6. Reste synthétique, poli et courtois sur WhatsApp.`,
        servicesScope: "Voyages, Visas (Schengen, Canada, USA), Campus France & Études à l'étranger",
        restrictedTopics: "Ne jamais garantir l'obtention d'un visa à 100%. Transférer vers un humain si négociation tarifaire.",
        transferConditions: "Demande explicite de parler à un conseiller, réclamation complexe, négociation de devis.",
        responseDelaySeconds: 15,
        facebookUrl: undefined,
        catalogUrl: undefined,
        modelTier: "haiku",
        isActive: true,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
  }

  // Mois en cours au format 'YYYY-MM-01'
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const { data: usageRow } = await ctx.supabase
    .from("ai_usage_monthly")
    .select("ai_replies_count")
    .eq("organization_id", ctx.organizationId)
    .eq("period_month", currentMonthKey)
    .maybeSingle();

  const repliesThisMonthCount = Number(usageRow?.ai_replies_count ?? 0);

  // Même règle que la base (private.ai_limits) : pendant l'essai et la démonstration, quotas de la formule PRO.
  const plan = ctx.subscription?.plan;
  const tier = plan?.tier ?? "pro";
  const onTrial = ctx.isDemo || !ctx.subscription || ctx.subscription.status === "trialing";
  const maxAiAgents = Math.max(plan?.maxAiAgents ?? 0, onTrial ? PRO_LIMITS.agents : 0);
  const maxWaNumbers = Math.max(plan?.maxWaNumbers ?? 0, onTrial ? PRO_LIMITS.numbers : 0);
  const monthlyAiReplies = Math.max(plan?.monthlyAiReplies ?? 0, onTrial ? PRO_LIMITS.replies : 0);

  const usage: AiUsageSummary = {
    planCode: tier,
    maxAiAgents,
    maxWaNumbers,
    monthlyAiReplies,
    currentAgentsCount: agents.length,
    repliesThisMonthCount,
    isLocked: false,
  };

  // Lecture des sources de connaissances
  const { data: rawSources } = await ctx.supabase
    .from("ai_knowledge_sources")
    .select("*")
    .eq("organization_id", ctx.organizationId)
    .order("created_at", { ascending: false });
  const sources = (rawSources ?? []).map(toAiKnowledgeSource);

  // Lecture des comptes WhatsApp
  const { data: rawAccounts } = await ctx.supabase
    .from("wa_accounts")
    .select("*")
    .eq("organization_id", ctx.organizationId)
    .order("connected_at", { ascending: false });
  const accounts = (rawAccounts ?? []).map(toWaAccount);

  return {
    agents,
    usage,
    agencyName: ctx.agency.name,
    canManage,
    isLocked: false,
    sources,
    accounts,
  };
}

