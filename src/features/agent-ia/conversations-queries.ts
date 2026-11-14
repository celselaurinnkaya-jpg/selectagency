import "server-only";
import { getAgencyContext } from "@/lib/auth/context";
import {
  toWaConversation,
  toWaMessage,
  type WaConversationRecord,
  type WaMessageRecord,
} from "@/lib/domain/ai";

export interface ClientOption {
  id: string;
  reference: string;
  fullName: string;
  phoneE164: string;
}

export interface MemberOption {
  id: string;
  fullName: string;
  role: string;
}

export interface InboxPageData {
  conversations: WaConversationRecord[];
  selectedConversation?: WaConversationRecord;
  messages: WaMessageRecord[];
  clients: ClientOption[];
  members: MemberOption[];
  isLocked: boolean;
  canManage: boolean;
  agencyName: string;
  /** Pour l'abonnement temps réel (filtré en plus par les règles d'accès de la base). */
  organizationId: string;
  /** Numéro WhatsApp Business connecté par Meta, sinon null. */
  connectedNumber: string | null;
}

export async function loadInboxPageData(
  selectedConversationId?: string
): Promise<InboxPageData> {
  const ctx = await getAgencyContext();
  const isLocked = ctx.locked.includes("ai_agent");
  const canManage = ["owner", "admin", "agent"].includes(ctx.member.role);

  if (isLocked) {
    return {
      conversations: [],
      messages: [],
      clients: [],
      members: [],
      isLocked: true,
      canManage: false,
      agencyName: ctx.agency.name,
      organizationId: ctx.organizationId,
      connectedNumber: null,
    };
  }

  // 1. Lire toutes les conversations de l'agence avec jointures contact, agent et client
  const { data: rawConversations, error: convErr } = await ctx.supabase
    .from("wa_conversations")
    .select(`
      *,
      contact:wa_contacts(profile_name, wa_id, client_id),
      agent:ai_agents(name),
      client:clients(id, reference, first_name, last_name)
    `)
    .eq("organization_id", ctx.organizationId)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (convErr) {
    console.error("Erreur de lecture des conversations WhatsApp :", convErr);
  }

  const conversations = (rawConversations ?? []).map(toWaConversation);

  // 2. Sélectionner la conversation demandée ou la première
  const selectedConversation =
    selectedConversationId && conversations.some((c) => c.id === selectedConversationId)
      ? conversations.find((c) => c.id === selectedConversationId)
      : conversations[0];

  let messages: WaMessageRecord[] = [];

  // 3. Lire les messages de la conversation sélectionnée
  if (selectedConversation) {
    const { data: rawMessages, error: msgErr } = await ctx.supabase
      .from("wa_messages")
      .select("*")
      .eq("conversation_id", selectedConversation.id)
      .eq("organization_id", ctx.organizationId)
      .order("created_at", { ascending: true });

    if (msgErr) {
      console.error("Erreur de lecture des messages :", msgErr);
    }

    messages = (rawMessages ?? []).map(toWaMessage);

    // Marquer comme lu si nécessaire
    if (selectedConversation.unreadCount > 0) {
      await ctx.supabase.rpc("mark_wa_conversation_read", {
        p_conv_id: selectedConversation.id,
        p_org: ctx.organizationId,
      });
      selectedConversation.unreadCount = 0;
    }
  }

  // 4. Charger la liste des clients et conseillers pour le rattachement CRM
  const [clientsRes, membersRes, accountRes] = await Promise.all([
    ctx.supabase
      .from("clients")
      .select("id, reference, first_name, last_name, phone_e164")
      .eq("organization_id", ctx.organizationId)
      .order("last_name", { ascending: true })
      .limit(200),
    ctx.supabase
      .from("members")
      .select("id, full_name, role")
      .eq("organization_id", ctx.organizationId)
      .is("removed_at", null)
      .order("full_name", { ascending: true }),
    ctx.supabase
      .from("wa_accounts")
      .select("display_phone_number")
      .eq("organization_id", ctx.organizationId)
      .eq("status", "connected")
      .limit(1)
      .maybeSingle(),
  ]);

  const clients: ClientOption[] = (clientsRes.data ?? []).map((c) => ({
    id: String(c.id),
    reference: String(c.reference),
    fullName: `${c.first_name} ${c.last_name}`,
    phoneE164: String(c.phone_e164),
  }));

  const members: MemberOption[] = (membersRes.data ?? []).map((m) => ({
    id: String(m.id),
    fullName: String(m.full_name),
    role: String(m.role),
  }));

  return {
    conversations,
    selectedConversation,
    messages,
    clients,
    members,
    isLocked: false,
    canManage,
    agencyName: ctx.agency.name,
    organizationId: ctx.organizationId,
    connectedNumber: accountRes.data?.display_phone_number ? String(accountRes.data.display_phone_number) : null,
  };
}

