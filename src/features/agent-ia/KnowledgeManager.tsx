"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  BookOpen,
  FileText,
  Globe,
  Plus,
  Trash2,
  Search,
  Sparkles,
  ExternalLink,
  Layers,
} from "lucide-react";
import { Card, Section, EmptyState } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass } from "@/components/shared/form";
import { AddTextKnowledgeModal } from "./AddTextKnowledgeModal";
import { AddUrlKnowledgeModal } from "./AddUrlKnowledgeModal";
import { KnowledgeFileUpload } from "./KnowledgeFileUpload";
import { deleteKnowledgeSourceAction, searchKnowledgeTestAction } from "./knowledge-actions";
import type { AiAgentRecord, AiKnowledgeSourceRecord } from "@/lib/domain/ai";
import type { KnowledgeSnippet } from "@/lib/ai/knowledge";

interface KnowledgeManagerProps {
  sources: AiKnowledgeSourceRecord[];
  agents: AiAgentRecord[];
  selectedAgentId?: string;
  totalChunks: number;
  canManage: boolean;
}

export function KnowledgeManager({
  sources,
  agents,
  selectedAgentId,
  totalChunks,
  canManage,
}: KnowledgeManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [isTextModalOpen, setIsTextModalOpen] = useState(false);
  const [isUrlModalOpen, setIsUrlModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<KnowledgeSnippet[] | null>(null);
  const [isSearching, startSearching] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const activeAgent = agents.find((a) => a.id === selectedAgentId) || agents[0];

  const handleAgentChange = (newAgentId: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("agent", newAgentId);
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleSearchTest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !activeAgent?.id) return;

    startSearching(async () => {
      const res = await searchKnowledgeTestAction(activeAgent.id, searchQuery);
      setSearchResults(res);
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Voulez-vous supprimer ce document de la base de connaissances ?")) return;
    setDeletingId(id);
    try {
      const fd = new FormData();
      fd.append("id", id);
      await deleteKnowledgeSourceAction(fd);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Barre de contrôle : sélection de l'agent & statistiques */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-full sm:w-auto">
            <label htmlFor="agent-filter" className="block text-xs font-semibold text-slate-500 mb-1">
              Agent concerné :
            </label>
            <select
              id="agent-filter"
              value={selectedAgentId ?? activeAgent?.id ?? ""}
              onChange={(e) => handleAgentChange(e.target.value)}
              className={`${selectClass} max-w-xs`}
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} — {a.role}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 pt-4 sm:pt-4">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-navy-50 px-3 py-1 text-xs font-medium text-navy-800 border border-navy-200">
              <BookOpen className="h-3.5 w-3.5 text-navy-700" />
              {sources.length} document{sources.length > 1 ? "s" : ""}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 border border-emerald-200">
              <Layers className="h-3.5 w-3.5 text-emerald-600" />
              {totalChunks} fragment{totalChunks > 1 ? "s" : ""} indexé{totalChunks > 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {canManage && (
          <div className="flex flex-wrap items-start gap-2">
            <KnowledgeFileUpload agentId={activeAgent?.id} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsUrlModalOpen(true)}
              disabled={!activeAgent}
              className="gap-1.5 text-xs"
            >
              <Globe className="h-3.5 w-3.5 text-slate-600" />
              <span>+ Ajouter un lien</span>
            </Button>

            <Button
              type="button"
              variant="accent"
              size="sm"
              onClick={() => setIsTextModalOpen(true)}
              disabled={!activeAgent}
              className="gap-1.5 text-xs"
            >
              <Plus className="h-4 w-4" />
              <span>+ Ajouter un texte / FAQ</span>
            </Button>
          </div>
        )}
      </div>

      {/* Simulateur de recherche RAG en direct */}
      <Card className="p-4 bg-slate-50/70 border-slate-200 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-navy-800" />
          <h3 className="text-sm font-bold text-navy-900">
            Tester la recherche dans les connaissances (RAG)
          </h3>
        </div>
        <p className="text-xs text-slate-600">
          Tapez une question ou un mot-clé pour voir exactement les extraits que l&apos;agent sélectionnera pour répondre :
        </p>

        <form onSubmit={handleSearchTest} className="flex gap-2">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Ex. : frais visa schengen, pièces justificatives, caution..."
            className="bg-white flex-1 h-9 text-xs"
          />
          <Button
            type="submit"
            size="sm"
            disabled={isSearching || !searchQuery.trim() || !activeAgent}
            className="bg-navy-800 text-white hover:bg-navy-900 text-xs px-3 h-9"
          >
            <Search className="h-3.5 w-3.5 mr-1" />
            {isSearching ? "Recherche..." : "Tester"}
          </Button>
        </form>

        {/* Affichage des résultats du test */}
        {searchResults !== null && (
          <div className="pt-2 border-t border-slate-200 space-y-2">
            <p className="text-xs font-semibold text-slate-700">
              {searchResults.length === 0
                ? "Aucun extrait trouvé pour cette recherche."
                : `${searchResults.length} extrait${searchResults.length > 1 ? "s" : ""} pertinent${searchResults.length > 1 ? "s" : ""} extrait${searchResults.length > 1 ? "s" : ""} :`}
            </p>
            <div className="grid gap-2">
              {searchResults.map((snip, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-slate-200 bg-white p-3 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-navy-900">{snip.sourceTitle}</span>
                    <span className="text-[11px] font-mono text-slate-500">
                      Score : {snip.rank ? (snip.rank * 100).toFixed(0) : "100"}%
                    </span>
                  </div>
                  <p className="text-slate-700 italic">&ldquo;{snip.content}&rdquo;</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Liste des documents et sources */}
      <Section title="Documents et sources enregistrées">
        <p className="text-sm text-slate-600 mb-4 -mt-1">
          L&apos;agent consulte prioritairement ces sources avant de formuler ses réponses.
        </p>

        {sources.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="Aucun document dans la base de connaissances"
            description="Ajoutez votre première grille tarifaire, FAQ ou liste de pièces pour que l'agent réponde aux questions réelles de vos clients."
            action={
              canManage && activeAgent ? (
                <Button
                  type="button"
                  variant="accent"
                  size="sm"
                  onClick={() => setIsTextModalOpen(true)}
                  className="gap-1.5"
                >
                  <Plus className="h-4 w-4" />
                  <span>Ajouter une première FAQ</span>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sources.map((source) => {
              const isDeleting = deletingId === source.id;

              return (
                <Card key={source.id} className="flex flex-col justify-between p-4 space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-800 text-citron-400">
                          {source.kind === "url" ? (
                            <Globe className="h-4 w-4" />
                          ) : (
                            <FileText className="h-4 w-4" />
                          )}
                        </div>
                        <div>
                          <h4 className="font-bold text-navy-900 text-sm leading-tight line-clamp-1">
                            {source.title}
                          </h4>
                          <span className="text-[11px] text-slate-500 uppercase">
                            {source.kind === "url" ? "Lien web" : "Texte / Note"}
                          </span>
                        </div>
                      </div>

                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border ${
                          source.status === "ready"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : source.status === "failed"
                              ? "border-red-200 bg-red-50 text-red-800"
                              : "border-orange-200 bg-orange-50 text-orange-800"
                        }`}
                      >
                        {source.status === "ready" ? "Indexé" : source.status}
                      </span>
                    </div>

                    {source.sourceUrl && (
                      <a
                        href={source.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-navy-700 hover:underline truncate max-w-full"
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        <span className="truncate">{source.sourceUrl}</span>
                      </a>
                    )}

                    {source.rawContent && (
                      <p className="text-xs text-slate-600 line-clamp-3 bg-slate-50 p-2 rounded-lg border border-slate-100">
                        {source.rawContent}
                      </p>
                    )}
                  </div>

                  <div className="border-t border-slate-100 pt-2 flex items-center justify-between text-xs text-slate-500">
                    <span className="font-medium text-slate-700">
                      {source.chunksCount} fragment{source.chunksCount > 1 ? "s" : ""}
                    </span>

                    {canManage && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isDeleting}
                        onClick={() => handleDelete(source.id)}
                        className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        title="Supprimer ce document"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Section>

      {/* Modales d'ajout */}
      {isTextModalOpen && (
        <AddTextKnowledgeModal
          agents={agents}
          selectedAgentId={selectedAgentId}
          onClose={() => setIsTextModalOpen(false)}
        />
      )}

      {isUrlModalOpen && (
        <AddUrlKnowledgeModal
          agents={agents}
          selectedAgentId={selectedAgentId}
          onClose={() => setIsUrlModalOpen(false)}
        />
      )}
    </div>
  );
}
