"use server";

import { refresh } from "next/cache";
import { getAgencyContext } from "@/lib/auth/context";
import { dbMessage } from "@/lib/data/errors";
import { AiUnavailableError, runAgentConversation } from "@/lib/ai/runner";
import { formatKnowledgeForPrompt, type KnowledgeSnippet } from "@/lib/ai/knowledge";
import { toAiAgent, type WaConversationMode } from "@/lib/domain/ai";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";
import { cronSecret } from "@/lib/email/system-worker";
import { createSystemClient } from "@/lib/supabase/system";
import { accountAccessToken } from "@/lib/whatsapp/coexistence";

export async function setConversationModeAction(
  conversationId: string,
  mode: WaConversationMode
): Promise<{ ok: boolean; message: string }> {
  const ctx = await getAgencyContext();

  if (!["owner", "admin", "agent"].includes(ctx.member.role)) {
    return { ok: false, message: "Action non autorisée." };
  }

  const { error } = await ctx.supabase.rpc("set_conversation_mode", {
    p_id: conversationId,
    p_org: ctx.organizationId,
    p_mode: mode,
    p_assigned_to: mode === "human" ? ctx.userId : null,
  });

  if (error) {
    return { ok: false, message: dbMessage(error) };
  }

  refresh();
  return { ok: true, message: `Mode basculé en ${mode === "ai" ? "IA automatique" : mode === "assist" ? "Assistance IA" : "Conseiller direct"}.` };
}

export async function sendManualWhatsAppReplyAction(
  conversationId: string,
  body: string
): Promise<{ ok: boolean; message: string }> {
  const trimmed = body.trim();
  if (!trimmed) {
    return { ok: false, message: "Le message ne peut pas être vide." };
  }

  const ctx = await getAgencyContext();

  if (!["owner", "admin", "agent"].includes(ctx.member.role)) {
    return { ok: false, message: "Action non autorisée." };
  }

  // 1. Enregistrement en base de données
  const { data: messageId, error } = await ctx.supabase.rpc("send_wa_outbound_message", {
    p_org: ctx.organizationId,
    p_conv_id: conversationId,
    p_body: trimmed,
  });

  if (error) {
    return { ok: false, message: dbMessage(error) };
  }

  if (!messageId) {
    return { ok: false, message: "Échec d'envoi du message." };
  }

  // 2. Envoi par l'API officielle de Meta. « Envoyé » n'est posé qu'avec l'identifiant renvoyé par Meta.
  const { data: conv } = await ctx.supabase
    .from("wa_conversations")
    .select("account:wa_accounts(phone_number_id), contact:wa_contacts(wa_id)")
    .eq("id", conversationId)
    .eq("organization_id", ctx.organizationId)
    .single<{ account: { phone_number_id: string } | null; contact: { wa_id: string } | null }>();

  const serverSecret = cronSecret();
  const phoneNumberId = conv?.account?.phone_number_id;
  const recipient = conv?.contact?.wa_id;
  // Uniquement la clé propre au numéro (QR de Meta, ou identifiants vérifiés) : aucune clé de secours.
  const token =
    serverSecret && phoneNumberId
      ? await accountAccessToken((fn, args) => createSystemClient().rpc(fn, args), serverSecret, phoneNumberId)
      : undefined;
  if (!serverSecret || !phoneNumberId || !recipient) {
    refresh();
    return { ok: false, message: "Message enregistré, mais pas envoyé : la connexion WhatsApp officielle n'est pas encore active." };
  }
  if (!token) {
    refresh();
    return {
      ok: false,
      message: "Message enregistré, mais pas envoyé : ce numéro n'a pas sa propre autorisation Meta. Reconnectez-le dans Agent IA → Connexion WhatsApp.",
    };
  }

  const sent = await sendWhatsAppMessage({ phoneNumberId, to: recipient, text: trimmed, accessToken: token });
  if (!sent.ok || !sent.metaMessageId) {
    refresh();
    return { ok: false, message: "Meta n'a pas accepté le message. Il reste « en attente » ; réessayez dans un instant." };
  }
  await createSystemClient().rpc("mark_wa_message_sent", {
    p_secret: serverSecret,
    p_message_id: messageId,
    p_meta_message_id: sent.metaMessageId,
  });

  refresh();
  return { ok: true, message: "Message envoyé." };
}

export async function generateAiSuggestionAction(
  conversationId: string
): Promise<{ ok: boolean; suggestion?: string; error?: string }> {
  const ctx = await getAgencyContext();

  // 1. Lire la conversation et l'agent assigné
  const { data: conv, error: convErr } = await ctx.supabase
    .from("wa_conversations")
    .select("*, agent:ai_agents(*)")
    .eq("id", conversationId)
    .eq("organization_id", ctx.organizationId)
    .single();

  if (convErr || !conv) {
    return { ok: false, error: "Conversation introuvable." };
  }

  // Si aucun agent n'est assigné, prendre le premier agent actif de l'agence
  let rawAgent = conv.agent;
  if (!rawAgent) {
    const { data: fallbackAgent } = await ctx.supabase
      .from("ai_agents")
      .select("*")
      .eq("organization_id", ctx.organizationId)
      .eq("is_active", true)
      .limit(1)
      .single();
    rawAgent = fallbackAgent;
  }

  if (!rawAgent) {
    return { ok: false, error: "Aucun agent IA n'est configuré pour cette agence." };
  }

  const agent = toAiAgent(rawAgent);

  // 2. Lire les derniers messages du fil pour le contexte
  const { data: rawMessages } = await ctx.supabase
    .from("wa_messages")
    .select("direction, body")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(10);

  const chatInputs = (rawMessages ?? []).map((m) => ({
    role: (m.direction === "inbound" ? "user" : "assistant") as "user" | "assistant",
    content: m.body,
  }));

  const lastUserMsg = chatInputs.filter((m) => m.role === "user").slice(-1)[0]?.content ?? "";

  // 3. Recherche RAG dans les connaissances
  let knowledgeContext: string | undefined;
  if (lastUserMsg) {
    try {
      const { data: snippets } = await ctx.supabase.rpc("search_ai_knowledge", {
        p_org: ctx.organizationId,
        p_agent_id: agent.id,
        p_query: lastUserMsg,
        p_limit: 3,
      });

      if (snippets && snippets.length > 0) {
        const mapped: KnowledgeSnippet[] = snippets.map((s: Record<string, unknown>) => ({
          sourceTitle: String(s.source_title),
          content: String(s.content),
        }));
        knowledgeContext = formatKnowledgeForPrompt(mapped);
      }
    } catch (ragErr) {
      console.warn("Recherche de connaissances ignorée :", ragErr);
    }
  }

  // 4. Génération de la suggestion via le runner IA
  try {
    const result = await runAgentConversation(
      agent,
      ctx.agency.name,
      chatInputs,
      knowledgeContext
    );
    return { ok: true, suggestion: result.replyText };
  } catch (genErr: unknown) {
    return {
      ok: false,
      error: genErr instanceof AiUnavailableError ? genErr.message : "La suggestion n'a pas pu être préparée. Réessayez dans un instant.",
    };
  }
}

export async function linkConversationToClientAction(
  conversationId: string,
  clientId: string,
  caseId?: string
): Promise<{ ok: boolean; message: string }> {
  const ctx = await getAgencyContext();

  if (!["owner", "admin", "agent"].includes(ctx.member.role)) {
    return { ok: false, message: "Action non autorisée." };
  }

  const { error } = await ctx.supabase.rpc("link_wa_conversation_to_client", {
    p_org: ctx.organizationId,
    p_conv_id: conversationId,
    p_client_id: clientId,
    p_case_id: caseId || null,
  });

  if (error) {
    return { ok: false, message: dbMessage(error) };
  }

  refresh();
  return { ok: true, message: "Conversation rattachée au client avec succès." };
}

export async function unlinkConversationFromClientAction(
  conversationId: string
): Promise<{ ok: boolean; message: string }> {
  const ctx = await getAgencyContext();

  if (!["owner", "admin", "agent"].includes(ctx.member.role)) {
    return { ok: false, message: "Action non autorisée." };
  }

  const { error } = await ctx.supabase.rpc("unlink_wa_conversation_from_client", {
    p_org: ctx.organizationId,
    p_conv_id: conversationId,
  });

  if (error) {
    return { ok: false, message: dbMessage(error) };
  }

  refresh();
  return { ok: true, message: "Conversation détachée du client." };
}

export interface CreateProspectInput {
  conversationId: string;
  firstName: string;
  lastName: string;
  residenceCountry?: string;
  assignedTo?: string;
  notes?: string;
}

export async function createProspectFromConversationAction(
  input: CreateProspectInput
): Promise<{ ok: boolean; message: string; clientId?: string }> {
  const ctx = await getAgencyContext();

  if (!["owner", "admin", "agent"].includes(ctx.member.role)) {
    return { ok: false, message: "Action non autorisée." };
  }

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName || !lastName) {
    return { ok: false, message: "Veuillez indiquer le prénom et le nom du prospect." };
  }

  // 1. Lire la conversation et le contact pour récupérer le numéro WhatsApp
  const { data: conv, error: convErr } = await ctx.supabase
    .from("wa_conversations")
    .select("*, contact:wa_contacts(*)")
    .eq("id", input.conversationId)
    .eq("organization_id", ctx.organizationId)
    .single();

  if (convErr || !conv || !conv.contact) {
    return { ok: false, message: "Conversation ou contact introuvable." };
  }

  const rawPhone = conv.contact.wa_id;
  const phoneE164 = rawPhone.startsWith("+") ? rawPhone : `+${rawPhone}`;
  const country = input.residenceCountry || ctx.agency.countryCode || "CM";
  const assignedTo = input.assignedTo || ctx.member.id;

  // 2. Vérifier si un client existe déjà avec ce numéro de téléphone
  const { data: existingClient } = await ctx.supabase
    .from("clients")
    .select("id, reference, first_name, last_name")
    .eq("organization_id", ctx.organizationId)
    .or(`phone_e164.eq.${phoneE164},whatsapp_e164.eq.${phoneE164}`)
    .maybeSingle();

  let targetClientId = existingClient?.id;

  if (!targetClientId) {
    // 3. Insérer le nouveau prospect
    const { data: newClient, error: clientErr } = await ctx.supabase
      .from("clients")
      .insert({
        organization_id: ctx.organizationId,
        client_type: "individual",
        status: "prospect",
        first_name: firstName,
        last_name: lastName,
        phone_e164: phoneE164,
        whatsapp_e164: phoneE164,
        residence_country: country,
        city: ctx.agency.city || "Douala",
        source: "social_media",
        source_detail: "WhatsApp Agent IA",
        assigned_to: assignedTo,
        notes: input.notes ? input.notes.trim() : "Créé depuis la boîte de réception WhatsApp Agent IA",
      })
      .select("id")
      .single();

    if (clientErr || !newClient) {
      return { ok: false, message: clientErr ? dbMessage(clientErr) : "Échec de création du prospect." };
    }

    targetClientId = newClient.id;
  }

  // 4. Lier la conversation au client
  const { error: linkErr } = await ctx.supabase.rpc("link_wa_conversation_to_client", {
    p_org: ctx.organizationId,
    p_conv_id: input.conversationId,
    p_client_id: targetClientId,
  });

  if (linkErr) {
    return { ok: false, message: dbMessage(linkErr) };
  }

  refresh();
  return {
    ok: true,
    message: existingClient
      ? `Contact rattaché à la fiche existante de ${existingClient.first_name} ${existingClient.last_name}.`
      : `Prospect ${firstName} ${lastName} créé et rattaché avec succès.`,
    clientId: targetClientId,
  };
}
