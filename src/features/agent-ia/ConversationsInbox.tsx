"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, MessagesSquare, Search, Smartphone, UserRound } from "lucide-react";
import { cn } from "cn";
import { Input } from "@/components/ui/input";
import { ConversationThread } from "./ConversationThread";
import { InboxLive } from "./InboxLive";
import type { WaConversationRecord, WaMessageRecord } from "@/lib/domain/ai";
import type { ClientOption, MemberOption } from "./conversations-queries";

// Boîte de réception façon WhatsApp Web : les discussions à gauche, la conversation à droite, mise à jour en
// temps réel. Les messages sont ceux du numéro WhatsApp Business de l'agence, connecté par Meta.
// Sur téléphone : la liste, puis la conversation choisie avec un retour vers la liste.

interface ConversationsInboxProps {
  conversations: WaConversationRecord[];
  selectedConversation?: WaConversationRecord;
  messages: WaMessageRecord[];
  clients?: ClientOption[];
  members?: MemberOption[];
  canManage: boolean;
  agencyName: string;
  organizationId: string;
  connectedNumber: string | null;
  /** Une conversation a été ouverte explicitement (?c=) : sur téléphone, on l'affiche à la place de la liste. */
  openOnMobile: boolean;
}

type FilterScope = "all" | "unread" | "ai" | "human";

const FILTERS: { key: FilterScope; label: string }[] = [
  { key: "all", label: "Toutes" },
  { key: "unread", label: "Non lues" },
  { key: "ai", label: "IA" },
  { key: "human", label: "Conseiller" },
];

const AVATAR_COLORS = ["bg-navy-700", "bg-sky-700", "bg-emerald-700", "bg-violet-700", "bg-orange-700", "bg-teal-700"];

function avatarColor(seed: string): string {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  return name.replace(/\D/g, "").slice(-2) || name.slice(0, 2).toUpperCase();
}

/** Heure si c'est aujourd'hui, sinon la date courte (comme WhatsApp). */
function when(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

export function ConversationsInbox({
  conversations,
  selectedConversation,
  messages,
  clients = [],
  members = [],
  canManage,
  agencyName,
  organizationId,
  connectedNumber,
  openOnMobile,
}: ConversationsInboxProps) {
  const [filter, setFilter] = useState<FilterScope>("all");
  const [search, setSearch] = useState("");

  const q = search.trim().toLowerCase();
  const filtered = conversations.filter((c) => {
    if (filter === "unread" && c.unreadCount === 0) return false;
    if (filter === "ai" && c.mode === "human") return false;
    if (filter === "human" && c.mode !== "human") return false;
    if (!q) return true;
    return [c.contactName, c.contactPhone, c.lastMessageText].some((v) => v?.toLowerCase().includes(q));
  });
  const unread = conversations.filter((c) => c.unreadCount > 0).length;
  const showThreadOnMobile = openOnMobile && Boolean(selectedConversation);

  return (
    <div className="flex h-[calc(100dvh-230px)] min-h-[560px] overflow-hidden rounded-2xl border border-border bg-white shadow-[0_1px_3px_rgba(2,55,100,0.1)]">
      {/* Discussions */}
      <aside className={cn("w-full flex-col border-r border-border md:flex md:w-[340px] md:shrink-0 lg:w-[380px]", showThreadOnMobile ? "hidden" : "flex")}>
        <div className="flex items-center justify-between gap-2 bg-navy-800 px-4 py-3 text-white">
          <div className="min-w-0">
            <p className="font-semibold">Discussions</p>
            <p className="flex items-center gap-1 truncate text-xs text-white/80">
              <Smartphone className="size-3.5 shrink-0" aria-hidden />
              {connectedNumber ? `WhatsApp Business ${connectedNumber}` : "WhatsApp pas encore connecté"}
            </p>
          </div>
          <span className="rounded-full bg-white px-2 py-0.5">
            <InboxLive organizationId={organizationId} />
          </span>
        </div>

        <div className="space-y-2 border-b border-border bg-surface p-3">
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher une discussion" className="h-10 rounded-lg bg-white pl-9" />
          </div>
          <div className="flex gap-1.5 overflow-x-auto">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                className={cn(
                  "h-8 shrink-0 rounded-full px-3 text-xs font-medium transition",
                  filter === f.key ? "bg-navy-800 text-white" : "border border-border bg-white text-slate-700 hover:bg-navy-50",
                )}
              >
                {f.label}
                {f.key === "unread" && unread > 0 ? ` (${unread})` : ""}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-navy-50 text-navy-700">
                <MessagesSquare className="size-6" aria-hidden />
              </span>
              <p className="mt-3 font-semibold text-slate-800">Aucune discussion pour le moment</p>
              <p className="mt-1 text-sm text-slate-600">
                {connectedNumber
                  ? "Dès qu'un client écrit au numéro WhatsApp de l'agence, la discussion apparaît ici."
                  : "Connectez le numéro WhatsApp Business de l'agence : les discussions apparaîtront ici, comme sur votre téléphone."}
              </p>
              {!connectedNumber && (
                <Link href="/agent-ia/connexion" className="mt-4 inline-flex h-10 items-center rounded-lg bg-citron-400 px-4 text-sm font-semibold text-navy-900 hover:bg-citron-300">
                  Connecter WhatsApp
                </Link>
              )}
            </div>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-600">Aucune discussion ne correspond.</p>
          ) : (
            <ul>
              {filtered.map((c) => {
                const name = c.contactName || c.contactPhone;
                const selected = selectedConversation?.id === c.id;
                return (
                  <li key={c.id}>
                    <Link
                      href={`/agent-ia?c=${c.id}`}
                      aria-current={selected ? "true" : undefined}
                      className={cn("flex min-h-[72px] items-center gap-3 border-b border-border px-3 py-2 transition", selected ? "bg-navy-50" : "hover:bg-surface")}
                    >
                      <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white", avatarColor(c.contactPhone))}>
                        {initials(name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-medium text-slate-900">{name}</span>
                          <span className={cn("shrink-0 text-xs tabular-nums", c.unreadCount > 0 ? "font-semibold text-emerald-700" : "text-slate-500")}>{when(c.lastMessageAt)}</span>
                        </span>
                        <span className="mt-0.5 flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-1 text-sm text-slate-600">
                            {c.mode === "human" ? (
                              <UserRound className="size-3.5 shrink-0 text-violet-700" aria-label="Conseiller" />
                            ) : (
                              <Bot className="size-3.5 shrink-0 text-navy-700" aria-label={c.mode === "ai" ? "IA automatique" : "IA qui propose"} />
                            )}
                            <span className="truncate">{c.lastMessageText || "Discussion ouverte"}</span>
                          </span>
                          {c.unreadCount > 0 && (
                            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-xs font-semibold text-white tabular-nums">
                              {c.unreadCount}
                            </span>
                          )}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* Conversation */}
      <section className={cn("min-w-0 flex-1 flex-col bg-[#efeae2] md:flex", showThreadOnMobile ? "flex" : "hidden")}>
        {selectedConversation ? (
          <>
            <Link href="/agent-ia" className="flex h-10 items-center gap-1.5 border-b border-border bg-white px-3 text-sm font-medium text-navy-800 md:hidden">
              <ArrowLeft className="size-4" aria-hidden />
              Discussions
            </Link>
            <div className="min-h-0 flex-1">
              <ConversationThread conversation={selectedConversation} messages={messages} clients={clients} members={members} canManage={canManage} />
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center bg-surface p-6 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-navy-800 text-citron-400">
              <MessagesSquare className="size-7" aria-hidden />
            </span>
            <p className="mt-4 text-lg font-semibold text-navy-800">Agent IA de {agencyName}</p>
            <p className="mt-1 max-w-sm text-sm text-slate-600">
              Choisissez une discussion pour lire les messages. L&apos;IA répond seule, propose une réponse ou laisse la main à un conseiller,
              selon le mode choisi dans chaque conversation.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
