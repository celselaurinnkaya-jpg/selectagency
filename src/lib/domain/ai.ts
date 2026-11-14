// Types et modèles de base pour le module « Agent IA »

export type AiStarterModel = "sales" | "support" | "visas" | "studies" | "travel" | "general";
export type AiTone = "courtois" | "chaleureux" | "formel" | "dynamique";
export type AiModelTier = "haiku" | "sonnet";

export interface AiStarterModelSpec {
  key: AiStarterModel;
  title: string;
  role: string;
  description: string;
  suggestedTone: AiTone;
  suggestedInstructions: string;
  suggestedServices: string;
  suggestedTransfer: string;
}

export const AI_STARTER_MODELS: Record<AiStarterModel, AiStarterModelSpec> = {
  general: {
    key: "general",
    title: "Généraliste de l'agence",
    role: "Conseiller d'accueil et d'orientation",
    description: "Accueille chaleureusement les visiteurs, répond aux questions courantes et oriente vers le bon service.",
    suggestedTone: "courtois",
    suggestedInstructions: "Accueillir chaque client avec politesse et bienveillance. Répondre aux questions générales sur les horaires, l'adresse et les spécialités de l'agence. Identifier rapidement le besoin pour orienter vers les démarches de visa, les études ou les voyages.",
    suggestedServices: "Orientation générale, prise de rendez-vous, informations pratiques sur l'agence.",
    suggestedTransfer: "Si le client demande un devis précis, négocie les tarifs ou souhaite parler directement à la direction.",
  },
  visas: {
    key: "visas",
    title: "Spécialiste Procédures Visas",
    role: "Assistant démarches consulaires",
    description: "Guide les clients sur la constitution des dossiers consulaires et les pièces requises.",
    suggestedTone: "formel",
    suggestedInstructions: "Expliquer les pièces justificatives nécessaires pour chaque type de visa (tourisme, affaires, visite familiale). Rappeler que seule l'ambassade ou le consulat est souverain pour la délivrance du visa. Ne jamais garantir l'obtention d'un visa.",
    suggestedServices: "Visas Schengen, Canada, USA, Turquie, Dubaï et Afrique centrale.",
    suggestedTransfer: "Si le client a déjà essuyé un refus consulaire récent ou si son cas nécessite une analyse juridique personnalisée.",
  },
  studies: {
    key: "studies",
    title: "Conseiller Études à l'étranger",
    role: "Assistant admissions et mobilités étudiantes",
    description: "Renseigne les étudiants sur les rentrées universitaires, Campus France et les démarches de bourses.",
    suggestedTone: "chaleureux",
    suggestedInstructions: "Guider les bacheliers et étudiants sur le calendrier des candidatures universitaires (France, Canada, Belgique, Chine). Renseigner sur les tests de langue requis et les justificatifs financiers (AVI, garants). Encourager et rassurer l'étudiant tout en restant rigoureux.",
    suggestedServices: "Campus France, universités partenaires, attestations de virement irrévocable (AVI), garanties de logement.",
    suggestedTransfer: "Si l'étudiant a des questions pointues sur ses équivalences de diplômes ou demande un entretien d'orientation individuel.",
  },
  travel: {
    key: "travel",
    title: "Conseiller Voyages & Billetterie",
    role: "Assistant réservation billets et séjours",
    description: "Aide les voyageurs pour la réservation de vols, hébergements et assurances séjour.",
    suggestedTone: "dynamique",
    suggestedInstructions: "Aider le client à préciser ses dates de voyage, destinations et préférences de compagnies aériennes. Expliquer les conditions de bagages et les formalités sanitaires. Proposer l'assistance complète de l'agence.",
    suggestedServices: "Billetterie aérienne toutes compagnies, réservations hôtelières, assurances voyage, assistance aéroport.",
    suggestedTransfer: "Dès que le client souhaite valider une réservation ferme, émettre un billet ou régler un acompte.",
  },
  sales: {
    key: "sales",
    title: "Conseiller Commercial & Offres",
    role: "Chargé d'accueil des nouveaux prospects",
    description: "Qualifie les nouveaux contacts, présente les formules de l'agence et suscite la prise de rendez-vous.",
    suggestedTone: "dynamique",
    suggestedInstructions: "Identifier précisément l'objectif du prospect et son horizon de départ. Présenter les avantages d'un accompagnement professionnel par l'agence. Proposer un rendez-vous en agence pour bâtir un plan personnalisé.",
    suggestedServices: "Présentation des offres packs (Études Clé en Main, Pack Découverte, Voyage Express).",
    suggestedTransfer: "Lorsque le prospect est prêt à s'engager, demande une remise commerciale ou souhaite rencontrer un responsable.",
  },
  support: {
    key: "support",
    title: "Support & Suivi Client",
    role: "Chargé du suivi et des renseignements clients",
    description: "Renseigne les clients déjà engagés sur l'avancement de leurs démarches et recueille leurs documents.",
    suggestedTone: "courtois",
    suggestedInstructions: "Demander au client son nom complet ou son numéro de dossier pour faire le point. Rassurer le client sur les délais de traitement des organismes officiels. Inviter à transmettre les pièces complémentaires manquantes.",
    suggestedServices: "Point d'étape, dépôt de pièces, vérification des rendez-vous consulaires.",
    suggestedTransfer: "Si le client manifeste une urgence, une inquiétude vive ou un mécontentement.",
  },
};

export interface AiAgentRecord {
  id: string;
  organizationId: string;
  name: string;
  avatarUrl?: string;
  role: string;
  starterModel: AiStarterModel;
  languages: string[];
  tone: AiTone;
  personality?: string;
  systemInstructions: string;
  servicesScope?: string;
  restrictedTopics?: string;
  transferConditions?: string;
  modelTier: AiModelTier;
  responseDelaySeconds: number;
  facebookUrl?: string;
  catalogUrl?: string;
  isActive: boolean;
  version: number;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TestChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  metadata?: {
    durationMs?: number;
    tokensPrompt?: number;
    tokensCompletion?: number;
    costFcfa?: number;
    transferSuggested?: boolean;
    transferReason?: string;
  };
}

export interface AiUsageSummary {
  planCode: string;
  maxAiAgents: number;
  maxWaNumbers: number;
  monthlyAiReplies: number;
  currentAgentsCount: number;
  repliesThisMonthCount: number;
  isLocked: boolean;
}

export type WaTemplateCategory = "UTILITY" | "MARKETING" | "AUTHENTICATION";
export type WaTemplateStatus = "pending" | "approved" | "rejected" | "paused";

export interface WaTemplateRecord {
  id: string;
  organizationId: string;
  name: string;
  language: string;
  category: WaTemplateCategory;
  bodyText: string;
  status: WaTemplateStatus;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export function toWaTemplate(row: Record<string, unknown>): WaTemplateRecord {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    name: String(row.name),
    language: String(row.language ?? "fr"),
    category: (row.category as WaTemplateCategory) || "UTILITY",
    bodyText: String(row.body_text ?? ""),
    status: (row.status as WaTemplateStatus) || "approved",
    rejectionReason: row.rejection_reason ? String(row.rejection_reason) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export interface AiStatsSummary {
  periodMonth: string;
  totalConversations: number;
  inboundCount: number;
  outboundCount: number;
  aiRepliesCount: number;
  humanConversationsCount: number;
  aiConversationsCount: number;
  assistConversationsCount: number;
  monthlyQuota: number;
  percentQuotaUsed: number;
  estimatedCostFcfa: number;
  planTier: string;
}

export type WaConversationMode = "ai" | "assist" | "human";
export type WaConversationStatus = "open" | "pending" | "resolved";

export interface WaConversationRecord {
  id: string;
  organizationId: string;
  accountId: string;
  contactId: string;
  contactName?: string;
  contactPhone: string;
  agentId?: string;
  agentName?: string;
  mode: WaConversationMode;
  status: WaConversationStatus;
  assignedTo?: string;
  assignedName?: string;
  unreadCount: number;
  lastMessageText?: string;
  lastMessageAt?: string;
  clientId?: string;
  clientReference?: string;
  clientFullName?: string;
  createdAt: string;
  updatedAt: string;
}

export type WaMessageDirection = "inbound" | "outbound";
export type WaMessageStatus = "queued" | "sent" | "delivered" | "read" | "failed";
export type WaMessageKind = "text" | "image" | "document" | "audio" | "template" | "interactive";
export type WaAuthorKind = "contact" | "ai" | "member";

export interface WaMessageRecord {
  id: string;
  organizationId: string;
  conversationId: string;
  direction: WaMessageDirection;
  metaMessageId?: string;
  kind: WaMessageKind;
  body: string;
  authorKind: WaAuthorKind;
  memberId?: string;
  memberName?: string;
  status: WaMessageStatus;
  errorMessage?: string;
  deliveredAt?: string;
  readAt?: string;
  createdAt: string;
  updatedAt: string;
}

export function toWaConversation(row: Record<string, unknown>): WaConversationRecord {
  const contact = (row.contact as Record<string, unknown>) ?? {};
  const agent = (row.agent as Record<string, unknown>) ?? {};
  const client = (row.client as Record<string, unknown>) ?? {};

  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    accountId: String(row.account_id),
    contactId: String(row.contact_id),
    contactName: contact.profile_name ? String(contact.profile_name) : undefined,
    contactPhone: String(contact.wa_id || row.contact_wa_id || ""),
    agentId: row.agent_id ? String(row.agent_id) : undefined,
    agentName: agent.name ? String(agent.name) : undefined,
    mode: (row.mode as WaConversationMode) || "ai",
    status: (row.status as WaConversationStatus) || "open",
    assignedTo: row.assigned_to ? String(row.assigned_to) : undefined,
    unreadCount: Number(row.unread_count ?? 0),
    lastMessageText: row.last_message_text ? String(row.last_message_text) : undefined,
    lastMessageAt: row.last_message_at ? String(row.last_message_at) : undefined,
    clientId: row.client_id ? String(row.client_id) : undefined,
    clientReference: client.reference ? String(client.reference) : undefined,
    clientFullName:
      client.first_name && client.last_name
        ? `${client.first_name} ${client.last_name}`
        : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function toWaMessage(row: Record<string, unknown>): WaMessageRecord {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    conversationId: String(row.conversation_id),
    direction: (row.direction as WaMessageDirection) || "inbound",
    metaMessageId: row.meta_message_id ? String(row.meta_message_id) : undefined,
    kind: (row.kind as WaMessageKind) || "text",
    body: String(row.body ?? ""),
    authorKind: (row.author_kind as WaAuthorKind) || "contact",
    memberId: row.member_id ? String(row.member_id) : undefined,
    status: (row.status as WaMessageStatus) || "sent",
    errorMessage: row.error_message ? String(row.error_message) : undefined,
    deliveredAt: row.delivered_at ? String(row.delivered_at) : undefined,
    readAt: row.read_at ? String(row.read_at) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export interface WaAccountRecord {
  id: string;
  organizationId: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  verifiedName?: string;
  status: "connected" | "disconnected" | "pending" | "error";
  coexistence: boolean;
  qualityRating?: string;
  messagingTier?: string;
  lastError?: string;
  connectedAt: string;
  updatedAt: string;
}

export function toWaAccount(row: Record<string, unknown>): WaAccountRecord {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    wabaId: String(row.waba_id),
    phoneNumberId: String(row.phone_number_id),
    displayPhoneNumber: String(row.display_phone_number),
    verifiedName: row.verified_name ? String(row.verified_name) : undefined,
    status: (row.status as "connected" | "disconnected" | "pending" | "error") || "connected",
    coexistence: Boolean(row.coexistence),
    qualityRating: row.quality_rating ? String(row.quality_rating) : undefined,
    messagingTier: row.messaging_tier ? String(row.messaging_tier) : undefined,
    lastError: row.last_error ? String(row.last_error) : undefined,
    connectedAt: String(row.connected_at),
    updatedAt: String(row.updated_at),
  };
}

export interface AiKnowledgeSourceRecord {
  id: string;
  organizationId: string;
  agentId: string;
  kind: "file" | "text" | "url";
  title: string;
  rawContent?: string;
  sourceUrl?: string;
  storagePath?: string;
  status: "pending" | "indexing" | "ready" | "failed";
  errorMessage?: string;
  chunksCount: number;
  createdAt: string;
  updatedAt: string;
}

export function toAiKnowledgeSource(row: Record<string, unknown>): AiKnowledgeSourceRecord {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    agentId: String(row.agent_id),
    kind: (row.kind as "file" | "text" | "url") || "text",
    title: String(row.title),
    rawContent: row.raw_content ? String(row.raw_content) : undefined,
    sourceUrl: row.source_url ? String(row.source_url) : undefined,
    storagePath: row.storage_path ? String(row.storage_path) : undefined,
    status: (row.status as "pending" | "indexing" | "ready" | "failed") || "pending",
    errorMessage: row.error_message ? String(row.error_message) : undefined,
    chunksCount: Number(row.chunks_count ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function toAiAgent(row: Record<string, unknown>): AiAgentRecord {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    name: String(row.name),
    avatarUrl: row.avatar_url ? String(row.avatar_url) : undefined,
    role: String(row.role),
    starterModel: (row.starter_model as AiStarterModel) || "general",
    languages: Array.isArray(row.languages) ? (row.languages as string[]) : ["fr"],
    tone: (row.tone as AiTone) || "courtois",
    personality: row.personality ? String(row.personality) : undefined,
    systemInstructions: row.system_instructions ? String(row.system_instructions) : "",
    servicesScope: row.services_scope ? String(row.services_scope) : undefined,
    restrictedTopics: row.restricted_topics ? String(row.restricted_topics) : undefined,
    transferConditions: row.transfer_conditions ? String(row.transfer_conditions) : undefined,
    modelTier: (row.model_tier as AiModelTier) || "haiku",
    responseDelaySeconds: Number(row.response_delay_seconds ?? 15),
    facebookUrl: row.facebook_url ? String(row.facebook_url) : undefined,
    catalogUrl: row.catalog_url ? String(row.catalog_url) : undefined,
    isActive: Boolean(row.is_active),
    version: Number(row.version ?? 1),
    createdBy: row.created_by ? String(row.created_by) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
