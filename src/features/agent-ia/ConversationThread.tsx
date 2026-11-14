"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Bot,
  Send,
  Sparkles,
  Check,
  CheckCheck,
  AlertCircle,
  HelpCircle,
  Clock,
  Link2,
  UserPlus,
  ExternalLink,
  Unlink,
  Smile,
  Paperclip,
  Search,
  MoreVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  setConversationModeAction,
  sendManualWhatsAppReplyAction,
  generateAiSuggestionAction,
  unlinkConversationFromClientAction,
} from "./conversations-actions";
import { LinkClientModal } from "./LinkClientModal";
import { CreateProspectModal } from "./CreateProspectModal";
import type { WaConversationRecord, WaMessageRecord, WaConversationMode } from "@/lib/domain/ai";
import type { ClientOption, MemberOption } from "./conversations-queries";

interface ConversationThreadProps {
  conversation: WaConversationRecord;
  messages: WaMessageRecord[];
  clients?: ClientOption[];
  members?: MemberOption[];
  canManage: boolean;
}

export function ConversationThread({
  conversation,
  messages,
  clients = [],
  members = [],
  canManage,
}: ConversationThreadProps) {
  const [inputText, setInputText] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isSuggesting, startSuggesting] = useTransition();
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [isProspectModalOpen, setIsProspectModalOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, suggestion]);

  const handleModeChange = (newMode: WaConversationMode) => {
    startTransition(async () => {
      await setConversationModeAction(conversation.id, newMode);
    });
  };

  const handleSendReply = (textToSend?: string) => {
    const text = (textToSend ?? inputText).trim();
    if (!text || isPending) return;

    startTransition(async () => {
      const res = await sendManualWhatsAppReplyAction(conversation.id, text);
      if (res.ok) {
        setInputText("");
        setSuggestion(null);
      }
    });
  };

  const handleRequestSuggestion = () => {
    startSuggesting(async () => {
      const res = await generateAiSuggestionAction(conversation.id);
      if (res.ok && res.suggestion) {
        setSuggestion(res.suggestion);
        setInputText(res.suggestion);
      }
    });
  };

  const handleUnlinkClient = () => {
    if (!confirm("Voulez-vous vraiment détacher cette conversation de la fiche client ?")) return;
    startTransition(async () => {
      await unlinkConversationFromClientAction(conversation.id);
    });
  };

  const displayName = conversation.contactName || conversation.contactPhone;

  return (
    <div className="flex flex-col h-full bg-[#efeae2] relative overflow-hidden">
      {/* 1. En-tête de la discussion (Style WhatsApp Web) */}
      <div className="flex items-center justify-between gap-3 border-b border-[#e9edef] bg-[#f0f2f5] px-4 py-2.5 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white font-bold text-sm shadow-xs">
            {displayName.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-[#111b21] truncate text-sm">
              {displayName}
            </h3>
            <p className="text-[11px] text-[#54656f] truncate">
              {conversation.contactPhone}
              {conversation.agentName && ` • Géré par ${conversation.agentName}`}
            </p>
          </div>
        </div>

        {/* Boutons d'action et sélecteur de mode */}
        <div className="flex items-center gap-2">
          {/* Sélecteur des 3 modes */}
          {canManage && (
            <div className="flex items-center gap-0.5 bg-white p-0.5 rounded-lg border border-slate-200">
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleModeChange("ai")}
                className={`px-2 py-1 text-[11px] rounded font-medium transition-colors ${
                  conversation.mode === "ai"
                    ? "bg-[#00a884] text-white shadow-xs font-semibold"
                    : "text-[#54656f] hover:text-[#111b21]"
                }`}
                title="L'Agent IA répond automatiquement"
              >
                🤖 IA auto
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleModeChange("assist")}
                className={`px-2 py-1 text-[11px] rounded font-medium transition-colors ${
                  conversation.mode === "assist"
                    ? "bg-amber-600 text-white shadow-xs font-semibold"
                    : "text-[#54656f] hover:text-[#111b21]"
                }`}
                title="L'IA propose une réponse à valider avant envoi"
              >
                💡 Assistée
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleModeChange("human")}
                className={`px-2 py-1 text-[11px] rounded font-medium transition-colors ${
                  conversation.mode === "human"
                    ? "bg-navy-800 text-white shadow-xs font-semibold"
                    : "text-[#54656f] hover:text-[#111b21]"
                }`}
                title="Le conseiller répond directement sans l'IA"
              >
                👤 Humain
              </button>
            </div>
          )}

          {/* Outils standard WhatsApp */}
          <div className="hidden sm:flex items-center gap-1 text-[#54656f]">
            <button
              type="button"
              title="Rechercher dans la discussion"
              className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-[#e9edef] transition"
            >
              <Search className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Menu"
              className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-[#e9edef] transition"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Barre fine de liaison CRM */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e9edef] bg-white/95 backdrop-blur-xs px-4 py-1.5 text-xs z-10">
        {conversation.clientId ? (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-slate-500 font-medium text-[11px] shrink-0">Client lié :</span>
            <Link
              href={`/clients/${conversation.clientId}`}
              className="inline-flex items-center gap-1.5 font-semibold text-[#008069] hover:underline truncate text-[11px]"
            >
              <span className="truncate">{conversation.clientFullName || "Fiche client"}</span>
              {conversation.clientReference && (
                <span className="font-mono text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.2 rounded shrink-0">
                  {conversation.clientReference}
                </span>
              )}
              <ExternalLink className="h-3 w-3 shrink-0 text-slate-400" />
            </Link>
            {canManage && (
              <button
                type="button"
                disabled={isPending}
                onClick={handleUnlinkClient}
                className="text-slate-400 hover:text-red-600 ml-1 inline-flex items-center gap-1 text-[10px] transition-colors"
                title="Détacher la conversation du client"
              >
                <Unlink className="h-2.5 w-2.5" />
                <span>Détacher</span>
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between w-full gap-2">
            <span className="text-slate-500 text-[11px]">
              Discussion non rattachée au CRM.
            </span>
            {canManage && (
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsLinkModalOpen(true)}
                  className="h-5 text-[10px] px-2 py-0 border-slate-300 gap-1 text-slate-700 bg-white"
                >
                  <Link2 className="h-2.5 w-2.5" />
                  Lier à un client
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setIsProspectModalOpen(true)}
                  className="h-5 text-[10px] px-2 py-0 bg-emerald-700 text-white hover:bg-emerald-800 gap-1"
                >
                  <UserPlus className="h-2.5 w-2.5" />
                  Créer un prospect
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Fil de messages WhatsApp */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
        {/* Pilule de date centrale WhatsApp */}
        <div className="flex justify-center my-2">
          <span className="rounded-lg bg-white/90 px-3 py-1 text-[11px] font-medium text-[#54656f] shadow-2xs border border-[#e9edef]">
            Aujourd&apos;hui
          </span>
        </div>

        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center p-6 text-[#54656f]">
            <HelpCircle className="h-8 w-8 mb-2 stroke-1 text-slate-400" />
            <p className="text-xs font-semibold text-slate-700">Aucun message dans cette discussion.</p>
            <p className="text-[11px] text-slate-400 mt-1">
              Les messages WhatsApp s&apos;afficheront ici automatiquement.
            </p>
          </div>
        ) : (
          messages.map((m) => {
            const isInbound = m.direction === "inbound";
            const isAi = m.authorKind === "ai";

            return (
              <div
                key={m.id}
                className={`flex flex-col ${isInbound ? "items-start" : "items-end"}`}
              >
                <div
                  className={`max-w-[78%] sm:max-w-[65%] rounded-lg px-3 py-1.5 text-xs sm:text-[13px] shadow-2xs relative leading-relaxed ${
                    isInbound
                      ? "bg-white text-[#111b21] rounded-tl-xs border border-[#e9edef]"
                      : "bg-[#d9fdd3] text-[#111b21] rounded-tr-xs"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.body}</p>

                  <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-[#667781] select-none">
                    <span>
                      {new Date(m.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>

                    {!isInbound && (
                      <span title={m.status} className="ml-0.5">
                        {m.status === "read" && (
                          <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" />
                        )}
                        {m.status === "delivered" && (
                          <CheckCheck className="h-3.5 w-3.5 text-[#8696a0]" />
                        )}
                        {m.status === "sent" && (
                          <Check className="h-3.5 w-3.5 text-[#8696a0]" />
                        )}
                        {m.status === "queued" && (
                          <Clock className="h-3 w-3 text-[#8696a0]" />
                        )}
                        {m.status === "failed" && (
                          <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                        )}
                      </span>
                    )}
                  </div>
                </div>

                <span className="mt-0.5 text-[10px] text-[#8696a0] px-1">
                  {isInbound
                    ? conversation.contactName || "Client"
                    : isAi
                      ? "🤖 Agent IA"
                      : m.memberName || "👤 Conseiller"}
                </span>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 4. Suggestion IA en mode Assisté */}
      {conversation.mode === "assist" && (
        <div className="border-t border-amber-200 bg-amber-50/90 p-3 z-10">
          <div className="flex items-center justify-between mb-1.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
              <Sparkles className="h-3.5 w-3.5 text-amber-600" />
              Proposition de réponse IA
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSuggesting}
              onClick={handleRequestSuggestion}
              className="h-6 text-[11px] px-2 py-0 border-amber-300 text-amber-900 hover:bg-amber-100 bg-white"
            >
              {isSuggesting ? "Génération..." : "✨ Proposer une réponse IA"}
            </Button>
          </div>
          {suggestion && (
            <div className="rounded-xl bg-white p-2.5 border border-amber-200 text-xs text-slate-800 shadow-2xs">
              <p className="whitespace-pre-wrap">{suggestion}</p>
              <div className="mt-2 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleSendReply(suggestion)}
                  disabled={isPending}
                  className="h-6 text-[11px] px-2.5 bg-[#00a884] hover:bg-[#008f6f] text-white font-medium"
                >
                  Envoyer cette réponse
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. Pied de page de saisie WhatsApp Web */}
      <div className="border-t border-[#e9edef] bg-[#f0f2f5] p-2.5 z-10">
        {conversation.mode === "ai" ? (
          <div className="flex items-center justify-between rounded-xl bg-blue-50/80 p-2.5 border border-blue-200">
            <div className="flex items-center gap-2 text-xs text-blue-900">
              <Bot className="h-4 w-4 text-blue-700" />
              <span>L&apos;Agent IA répond automatiquement aux questions de ce contact.</span>
            </div>
            {canManage && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => handleModeChange("human")}
                className="h-7 text-xs border-blue-300 text-blue-900 hover:bg-blue-100 bg-white"
              >
                Prendre la main
              </Button>
            )}
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendReply();
            }}
            className="flex items-center gap-2"
          >
            {/* Émoticône */}
            <button
              type="button"
              className="text-[#54656f] hover:text-[#111b21] p-1.5 transition"
              title="Émoticônes"
            >
              <Smile className="h-5 w-5" />
            </button>

            {/* Pièce jointe */}
            <button
              type="button"
              className="text-[#54656f] hover:text-[#111b21] p-1.5 transition"
              title="Joindre un fichier"
            >
              <Paperclip className="h-5 w-5" />
            </button>

            {/* Champ de texte */}
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Écrire un message"
              disabled={isPending}
              className="flex-1 rounded-lg bg-white px-3.5 py-2 text-xs sm:text-sm text-[#111b21] placeholder-[#54656f] focus:outline-hidden focus:ring-1 focus:ring-[#00a884] border border-slate-200"
            />

            {/* Bouton d'envoi vert */}
            <button
              type="submit"
              disabled={!inputText.trim() || isPending}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white hover:bg-[#008f6f] disabled:opacity-40 transition shadow-xs"
              title="Envoyer"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        )}
      </div>

      {/* Modales CRM */}
      <LinkClientModal
        conversationId={conversation.id}
        clients={clients}
        isOpen={isLinkModalOpen}
        onClose={() => setIsLinkModalOpen(false)}
      />

      <CreateProspectModal
        conversationId={conversation.id}
        defaultName={conversation.contactName}
        phone={conversation.contactPhone}
        members={members}
        isOpen={isProspectModalOpen}
        onClose={() => setIsProspectModalOpen(false)}
      />
    </div>
  );
}
