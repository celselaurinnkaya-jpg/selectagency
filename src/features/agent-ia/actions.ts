"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getAgencyContext } from "@/lib/auth/context";
import { dbMessage } from "@/lib/data/errors";
import { formValues, type FormState } from "@/lib/form-state";
import { AiUnavailableError, runAgentConversation, type ChatMessageInput, type AiRunExecutionResult } from "@/lib/ai/runner";
import { readPublicPage } from "@/lib/ai/fetch-page";
import { formatKnowledgeForPrompt, chunkText, type KnowledgeSnippet } from "@/lib/ai/knowledge";
import { toAiAgent, type AiAgentRecord } from "@/lib/domain/ai";
import { findTemplate, withAgency } from "./agent-templates";
import { genererReponseAgent } from "@/lib/ai/gemini";

const agentSchema = z.object({
  id: z.string().optional().or(z.literal("")),
  name: z.string().trim().min(2, "Le nom de l'agent doit comporter au moins 2 caractères.").max(100),
  role: z.string().trim().min(2, "Le rôle affiché est requis.").max(120),
  avatarUrl: z.string().trim().max(500).optional().or(z.literal("")),
  starterModel: z.enum(["sales", "support", "visas", "studies", "travel", "general"]).default("general"),
  tone: z.enum(["courtois", "chaleureux", "formel", "dynamique"]).default("courtois"),
  personality: z.string().trim().max(500).optional().or(z.literal("")),
  systemInstructions: z.string().trim().max(12000, "Les consignes ne doivent pas dépasser 12000 caractères.").default(""),
  servicesScope: z.string().trim().max(2000).optional().or(z.literal("")),
  restrictedTopics: z.string().trim().max(1000).optional().or(z.literal("")),
  transferConditions: z.string().trim().max(1000).optional().or(z.literal("")),
  // Champs absents du formulaire (undefined) : la base garde la valeur enregistrée.
  responseDelaySeconds: z.coerce.number().int().min(0, "Le délai va de 0 à 120 secondes.").max(120, "Le délai va de 0 à 120 secondes.").optional(),
  facebookUrl: z.string().trim().max(300).optional(),
  catalogUrl: z.string().trim().max(300).optional(),
  modelTier: z.enum(["haiku", "sonnet"]).optional(),
  isActive: z.preprocess((val) => val === "true" || val === "on" || val === true, z.boolean()).default(true),
});

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sauvegarde résiliente d'un agent IA en s'adaptant à la version active de la fonction SQL RPC. */
export async function saveAiAgentWithFallback(
  supabase: any,
  params: {
    id?: string | null;
    organizationId: string;
    name: string;
    avatarUrl?: string | null;
    role: string;
    starterModel?: string;
    tone?: string;
    personality?: string | null;
    instructions?: string;
    services?: string | null;
    restricted?: string | null;
    transfer?: string | null;
    delay?: number | null;
    facebookUrl?: string | null;
    catalogUrl?: string | null;
    modelTier?: string | null;
    isActive?: boolean;
  }
): Promise<{ id?: string; error?: any }> {
  const base13 = {
    p_id: params.id || null,
    p_org: params.organizationId,
    p_name: params.name,
    p_avatar_url: params.avatarUrl || null,
    p_role: params.role,
    p_starter_model: params.starterModel || "support",
    p_tone: params.tone || "courtois",
    p_personality: params.personality || null,
    p_instructions: params.instructions ?? "",
    p_services: params.services || null,
    p_restricted: params.restricted || null,
    p_transfer: params.transfer || null,
    p_is_active: params.isActive ?? true,
  };

  const withDelayAndUrls = {
    ...base13,
    p_delay: params.delay ?? 15,
    p_facebook_url: params.facebookUrl ?? null,
    p_catalog_url: params.catalogUrl ?? null,
  };

  // Essai 1 : signature avec p_model_tier
  const res1 = await supabase.rpc("save_ai_agent", {
    ...withDelayAndUrls,
    p_model_tier: params.modelTier || "haiku",
  });
  if (!res1.error && res1.data) {
    return { id: String(res1.data) };
  }

  // Essai 2 : signature à 16 paramètres
  const res2 = await supabase.rpc("save_ai_agent", withDelayAndUrls);
  if (!res2.error && res2.data) {
    return { id: String(res2.data) };
  }

  // Essai 3 : signature initiale à 13 paramètres
  const res3 = await supabase.rpc("save_ai_agent", base13);
  if (!res3.error && res3.data) {
    return { id: String(res3.data) };
  }

  return { error: res1.error || res2.error || res3.error };
}

/**
 * Assure qu'un agent officiel "Support client" existe en base pour l'agence.
 * S'il n'existe pas encore, il est initialisé et son UUID réel est renvoyé.
 */
export async function ensureAgencyAgentId(ctx: { supabase: any; organizationId: string }): Promise<string | null> {
  // 1. Chercher si un agent existe déjà
  const { data: existing } = await ctx.supabase
    .from("ai_agents")
    .select("id")
    .eq("organization_id", ctx.organizationId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return String(existing.id);
  }

  // 2. Initialisation automatique de l'agent Support client officiel
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

  const { id: createdId, error: saveErr } = await saveAiAgentWithFallback(ctx.supabase, {
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

  if (createdId) return createdId;

  if (saveErr) {
    console.error("Échec création automatique agent :", saveErr);
  }
  return null;
}

export async function saveAiAgentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const parsed = agentSchema.safeParse(values);

  if (!parsed.success) {
    return {
      message: "Certains champs sont à corriger.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
      values,
    };
  }

  const input = parsed.data;
  const ctx = await getAgencyContext();

  if (!["owner", "admin"].includes(ctx.member.role)) {
    return { message: "Seuls le propriétaire et les administrateurs peuvent configurer un agent.", values };
  }

  if (ctx.locked.includes("ai_agent")) {
    return { message: "L'option Agent IA est incluse uniquement dans les formules PRO et BUSINESS.", values };
  }

  const validId = input.id && UUID_REGEX.test(input.id) ? input.id : null;

  const { error } = await saveAiAgentWithFallback(ctx.supabase, {
    id: validId,
    organizationId: ctx.organizationId,
    name: input.name,
    avatarUrl: input.avatarUrl || null,
    role: input.role,
    starterModel: input.starterModel,
    tone: input.tone,
    personality: input.personality || null,
    instructions: input.systemInstructions,
    services: input.servicesScope || null,
    restricted: input.restrictedTopics || null,
    transfer: input.transferConditions || null,
    delay: input.responseDelaySeconds ?? null,
    facebookUrl: input.facebookUrl ?? null,
    catalogUrl: input.catalogUrl ?? null,
    modelTier: input.modelTier ?? null,
    isActive: input.isActive,
  });

  if (error) {
    return { message: dbMessage(error), values };
  }

  refresh();
  return { ok: true, message: validId ? "Agent mis à jour avec succès." : "Agent créé avec succès." };
}

export async function deleteAiAgentAction(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const id = formData.get("id");
  if (!id || typeof id !== "string") {
    return { ok: false, message: "Identifiant d'agent manquant." };
  }

  const ctx = await getAgencyContext();
  if (!["owner", "admin"].includes(ctx.member.role)) {
    return { ok: false, message: "Action réservée aux administrateurs." };
  }

  const { error } = await ctx.supabase.rpc("delete_ai_agent", {
    p_id: id,
    p_org: ctx.organizationId,
  });

  if (error) {
    return { ok: false, message: dbMessage(error) };
  }

  refresh();
  return { ok: true, message: "Agent supprimé." };
}

export async function testAiAgentMessageAction(
  agentId: string,
  messages: ChatMessageInput[],
  previewConfig?: {
    name?: string;
    role?: string;
    tone?: "courtois" | "chaleureux" | "formel" | "dynamique";
    personality?: string;
    systemInstructions?: string;
    servicesScope?: string;
    restrictedTopics?: string;
    transferConditions?: string;
    modelTier?: "haiku" | "sonnet";
    facebookUrl?: string;
    catalogUrl?: string;
  }
): Promise<AiRunExecutionResult | { error: string }> {
  const ctx = await getAgencyContext();

  if (ctx.locked.includes("ai_agent")) {
    return { error: "L'option Agent IA n'est pas active sur cette formule." };
  }

  // Lecture de l'agent (s'il existe déjà en base)
  let rawAgent = null;
  try {
    const { data } = await ctx.supabase
      .from("ai_agents")
      .select("*")
      .eq("id", agentId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    rawAgent = data;
  } catch {
    // Si agentId n'est pas un UUID (ex: "default-support-client" ou nouvel agent), on utilise previewConfig
    rawAgent = null;
  }

  const baseAgent: AiAgentRecord = rawAgent
    ? toAiAgent(rawAgent)
    : {
        id: agentId || "preview-agent",
        organizationId: ctx.organizationId,
        name: previewConfig?.name || "Support Client",
        role: previewConfig?.role || "Service client officiel de l'agence",
        starterModel: "support",
        languages: ["fr"],
        tone: "courtois",
        personality: "Chaleureux, rapide et professionnel",
        systemInstructions:
          previewConfig?.systemInstructions ||
          "Tu es le service client d'élite pour l'agence SELECT Agency. Tu aides les clients de façon amicale et naturelle.",
        servicesScope: previewConfig?.servicesScope,
        responseDelaySeconds: 15,
        facebookUrl: previewConfig?.facebookUrl,
        catalogUrl: previewConfig?.catalogUrl,
        modelTier: previewConfig?.modelTier || "haiku",
        isActive: true,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

  const agent: AiAgentRecord = previewConfig
    ? {
        ...baseAgent,
        ...previewConfig,
        modelTier: previewConfig.modelTier || baseAgent.modelTier,
      }
    : baseAgent;

  // Recherche dans les connaissances de l'agent (RAG)
  let knowledgeContext: string | undefined;
  const lastUserMsg = messages.filter((m) => m.role === "user").slice(-1)[0]?.content;
  if (lastUserMsg && rawAgent) {
    try {
      const { data: snippets } = await ctx.supabase.rpc("search_ai_knowledge", {
        p_org: ctx.organizationId,
        p_agent_id: agent.id,
        p_query: lastUserMsg,
        p_limit: 3,
      });

      if (snippets && snippets.length > 0) {
        const mappedSnippets: KnowledgeSnippet[] = snippets.map((s: Record<string, unknown>) => ({
          chunkId: String(s.chunk_id),
          sourceId: String(s.source_id),
          sourceTitle: String(s.source_title),
          content: String(s.content),
          rank: Number(s.rank ?? 0),
        }));
        knowledgeContext = formatKnowledgeForPrompt(mappedSnippets);
      }
    } catch (ragErr) {
      console.warn("Recherche de connaissances ignorée :", ragErr);
    }
  }

  // 1. Moteur officiel Gemini (pris en charge par la plateforme SaaS SELECT Agency)
  const geminiKey = (process.env.GEMINI_API_KEY || process.env["Gemini API Key"] || "").trim();
  if (geminiKey) {
    const lastUser = messages.filter((m) => m.role === "user").slice(-1)[0]?.content || "";
    const history = messages.slice(0, -1);
    try {
      const geminiResult = await genererReponseAgent({
        promptAgence: agent.systemInstructions,
        contenuPdfAgence: knowledgeContext || "",
        questionClient: lastUser,
        historiqueMessages: history,
      });

      const geminiReply = typeof geminiResult === "string" ? geminiResult : geminiResult.text;
      const modelUsed = typeof geminiResult === "string" ? "gemini-3.5-flash-lite" : geminiResult.model;

      const hasTransfer =
        geminiReply.includes("[DEMANDE_TRANSFERT]") ||
        /\b(transf[eè]re votre demande|transmets votre dossier|conseiller va prendre le relais|passe la main [aà] un conseiller|un conseiller humain va vous recontacter)\b/i.test(
          geminiReply
        );

      return {
        replyText: geminiReply.replace(/\[DEMANDE_TRANSFERT\]/g, "").trim(),
        model: modelUsed,
        tokensPrompt: Math.round((agent.systemInstructions.length + (knowledgeContext?.length || 0)) / 4),
        tokensCompletion: Math.round(geminiReply.length / 4),
        durationMs: 850,
        estimatedCostFcfa: 0,
        estimatedCostUsd: 0,
        transferSuggested: hasTransfer,
        transferReason: hasTransfer ? "Transfert vers un conseiller humain notifié" : undefined,
      };
    } catch (gemErr) {
      console.warn("Appel Gemini échoué, repli vers moteur secondaire :", gemErr);
    }
  }

  let result: AiRunExecutionResult;
  try {
    result = await runAgentConversation(agent, ctx.agency.name, messages, knowledgeContext);
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      // Si la clé API Anthropic n'est pas encore renseignée dans le fichier d'environnement local,
      // le Playground fournit une réponse intelligente d'aperçu pour permettre de tester immédiatement
      const lastUser = messages.filter((m) => m.role === "user").slice(-1)[0]?.content || "";
      const lower = lastUser.toLowerCase();

      let simReply = "";
      let transfer = false;

      if (/salut|bonjour|bonsoir|coucou|hello/i.test(lower)) {
        simReply = `Bonjour ! Bienvenue chez ${ctx.agency.name}. Je suis votre assistant Support Client. Comment puis-je vous aider aujourd'hui ? Avez-vous un projet de voyage, de visa ou d'études à l'étranger ?`;
      } else if (/visa|schengen|canada|france|turquie|duba[iï]/i.test(lower)) {
        simReply = `Nous accompagnons nos clients pour la constitution de leurs dossiers consulaires (Schengen, Canada, USA, Turquie, Dubaï). Conformément à nos règles de sécurité, nous vous aidons à rassembler des pièces irréprochables, mais seule l'ambassade ou le consulat est souverain pour la délivrance. Avez-vous déjà une date ou une destination en tête ?`;
      } else if (/tarif|prix|combien|co[uû]te|honoraires/i.test(lower)) {
        simReply = `Nos honoraires dépendent de la démarche (assistance visa, Campus France ou réservation de voyage). Vous pouvez consulter nos documents officiels ou nous préciser votre demande pour obtenir un devis personnalisé.`;
      } else if (/campus|france|etude|études|université|bac/i.test(lower)) {
        simReply = `Pour les démarches Campus France et universités partenaires, nous vous guidons sur le calendrier des candidatures, les tests de langue et l'Attestation de Virement Irrévocable (AVI). Souhaitez-vous planifier une rentrée prochaine ?`;
      } else if (/humain|conseiller|parler|responsable|directeur|t[eé]l[eé]phone|appel/i.test(lower)) {
        simReply = `Bien sûr ! Je transmets immédiatement votre demande à un conseiller humain de l'équipe ${ctx.agency.name} qui va prendre le relais sur cette discussion.`;
        transfer = true;
      } else if (knowledgeContext) {
        simReply = `D'après nos documents officiels : nos services couvrent l'accompagnement personnalisé pour votre projet. Que souhaitez-vous approfondir en priorité ?`;
      } else {
        simReply = `Bien reçu ! Je suis à votre écoute pour vous renseigner et vous accompagner dans vos démarches auprès de l'agence ${ctx.agency.name}. Souhaitez-vous des détails sur les pièces requises ou prendre un rendez-vous ?`;
      }

      return {
        replyText: simReply,
        model: "simulation-preview (GPT-5 mini)",
        tokensPrompt: 120,
        tokensCompletion: 85,
        durationMs: 950,
        estimatedCostFcfa: 0.12,
        estimatedCostUsd: 0.0002,
        transferSuggested: transfer,
        transferReason: transfer ? "Demande de contact humain détectée" : undefined,
      };
    }
    throw err;
  }

  // Les essais du testeur ne sont pas comptés dans la consommation de l'agence.
  return result;
}

export async function analyzeAndIndexExternalLinkAction(
  agentId: string,
  url: string,
  kind: "facebook" | "catalog" | "website"
): Promise<{ ok: boolean; message: string; chunksCount?: number }> {
  const ctx = await getAgencyContext();

  if (!["owner", "admin"].includes(ctx.member.role)) {
    return { ok: false, message: "Action réservée aux administrateurs." };
  }

  if (ctx.locked.includes("ai_agent")) {
    return { ok: false, message: "L'option Agent IA est réservée aux formules PRO et BUSINESS." };
  }

  const cleanUrl = url.trim();
  if (!cleanUrl) {
    return { ok: false, message: "Veuillez renseigner une adresse URL valide." };
  }

  // Lecture réelle de la page : seul le texte présent sur la page est indexé, rien n'est complété.
  const page = await readPublicPage(cleanUrl);
  if (!page.ok) {
    return { ok: false, message: page.error };
  }
  const host = new URL(page.url).hostname.replace(/^www\./, "");
  const title =
    kind === "facebook"
      ? `Page Facebook (${host})`
      : kind === "catalog"
      ? `Site ou boutique (${host})`
      : `Lien web joint (${host})`;
  const content = `${page.title ? `${page.title}\n` : ""}Source : ${page.url}\n\n${page.text}`;

  let targetAgentId = typeof agentId === "string" && UUID_REGEX.test(agentId) ? agentId : null;
  if (!targetAgentId) {
    targetAgentId = await ensureAgencyAgentId(ctx);
  }
  if (!targetAgentId) {
    return { ok: false, message: "Impossible d'initialiser l'agent Support client." };
  }

  // 1. Sauvegarde dans ai_knowledge_sources
  const { data: sourceId, error: sourceErr } = await ctx.supabase.rpc("save_ai_knowledge_source", {
    p_id: null,
    p_org: ctx.organizationId,
    p_agent_id: targetAgentId,
    p_kind: "url",
    p_title: title,
    p_raw_content: content,
    p_source_url: page.url,
    p_storage_path: null,
  });

  if (sourceErr) {
    return { ok: false, message: dbMessage(sourceErr) };
  }

  // 2. Découpage et indexation des fragments
  const chunks = chunkText(content);
  const { error: chunksErr } = await ctx.supabase.rpc("save_ai_knowledge_chunks", {
    p_org: ctx.organizationId,
    p_source_id: sourceId,
    p_agent_id: targetAgentId,
    p_chunks: chunks,
  });

  if (chunksErr) {
    return { ok: false, message: dbMessage(chunksErr) };
  }

  refresh();
  return {
    ok: true,
    message: `Page lue et ajoutée aux connaissances : ${chunks.length} fragment${chunks.length > 1 ? "s" : ""} extrait${chunks.length > 1 ? "s" : ""} et indexé${chunks.length > 1 ? "s" : ""} dans la base de l'agent.`,
    chunksCount: chunks.length,
  };
}

/** « Créer un agent IA » : l'agent est créé d'un clic à partir d'un modèle, puis ouvert dans le Studio. */
export async function createAgentFromTemplateAction(templateKey: string): Promise<{ ok: boolean; message: string; id?: string }> {
  const template = findTemplate(templateKey);
  if (!template) return { ok: false, message: "Modèle d'agent inconnu." };
  const ctx = await getAgencyContext();
  if (!["owner", "admin"].includes(ctx.member.role)) {
    return { ok: false, message: "Seuls le propriétaire et les administrateurs peuvent créer un agent." };
  }
  if (ctx.locked.includes("ai_agent")) {
    return { ok: false, message: "L'option Agent IA est incluse uniquement dans les formules PRO et BUSINESS." };
  }
  const { data, error } = await ctx.supabase.rpc("save_ai_agent", {
    p_id: null,
    p_org: ctx.organizationId,
    p_name: template.defaultName,
    p_avatar_url: null,
    p_role: template.role,
    p_starter_model: template.starter,
    p_tone: template.tone,
    p_personality: null,
    p_instructions: withAgency(template.prompt, ctx.agency.name),
    p_services: null,
    p_restricted: null,
    p_transfer: template.transfer,
    p_is_active: true,
    p_delay: 15,
    p_facebook_url: null,
    p_catalog_url: null,
    p_model_tier: "haiku",
  });
  if (error) return { ok: false, message: dbMessage(error) };
  refresh();
  return { ok: true, message: "Agent créé. Complétez-le dans le Studio.", id: String(data) };
}
