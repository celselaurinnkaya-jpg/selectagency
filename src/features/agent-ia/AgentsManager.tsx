"use client";

import { useState } from "react";
import type { ComponentType } from "react";
import { Bot, FileCheck, FlaskConical, Globe, GraduationCap, Headphones, LayoutGrid, Plane, Plus, Settings, Sparkles, Trash2, TrendingUp, X } from "lucide-react";
import { Card, Section, StatusBadge } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { AgentTesterModal } from "./AgentTesterModal";
import { AgentFormModal } from "./AgentFormModal";
import { AgentStudio } from "./AgentStudio";
import { AgentTemplateChooser } from "./AgentTemplateChooser";
import { deleteAiAgentAction } from "./actions";
import type { AiAgentRecord, AiKnowledgeSourceRecord, AiStarterModel, AiUsageSummary, WaAccountRecord } from "@/lib/domain/ai";

// « Mes agents » : comme sur les studios d'agents WhatsApp, on clique sur « Créer un agent IA », on choisit un
// modèle (Support client en premier) et l'agent s'ouvre directement dans le Studio (prompt, connaissances,
// produits et services, connexion, délai de réponse, testeur).

interface AgentsManagerProps {
  agents: AiAgentRecord[];
  usage: AiUsageSummary;
  agencyName: string;
  canManage: boolean;
  sources?: AiKnowledgeSourceRecord[];
  accounts?: WaAccountRecord[];
}

const STARTER_ICONS: Record<AiStarterModel, ComponentType<{ className?: string }>> = {
  general: Globe,
  visas: FileCheck,
  studies: GraduationCap,
  travel: Plane,
  sales: TrendingUp,
  support: Headphones,
};

const MODEL_LABEL = { haiku: "Claude Haiku 5.5", sonnet: "Claude Sonnet 5.5" } as const;

export function AgentsManager({ agents, usage, agencyName, canManage, sources = [], accounts = [] }: AgentsManagerProps) {
  const [viewMode, setViewMode] = useState<"studio" | "list">("studio");
  const [activeStudioAgentId, setActiveStudioAgentId] = useState<string | undefined>(agents[0]?.id);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [testingAgent, setTestingAgent] = useState<AiAgentRecord | null>(null);
  const [editingAgent, setEditingAgent] = useState<AiAgentRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const canCreate = canManage && agents.length < usage.maxAiAgents;

  const openInStudio = (id: string) => {
    setChooserOpen(false);
    setActiveStudioAgentId(id);
    setViewMode("studio");
  };

  const handleDelete = async (agentId: string) => {
    if (!confirm("Supprimer cet agent ? Cette action est définitive.")) return;
    setDeletingId(agentId);
    try {
      const fd = new FormData();
      fd.append("id", agentId);
      await deleteAiAgentAction(fd);
    } finally {
      setDeletingId(null);
    }
  };

  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-600 tabular-nums">
        Agents : {agents.length} / {usage.maxAiAgents}
        {canManage && !canCreate && <span className="ml-2 text-orange-800">(limite de la formule atteinte)</span>}
      </p>
      <div className="flex flex-wrap gap-2">
        {viewMode === "studio" ? (
          <Button type="button" variant="outline" className="h-10 gap-1.5" onClick={() => setViewMode("list")}>
            <LayoutGrid className="size-4" aria-hidden />
            Tous mes agents
          </Button>
        ) : null}
        {canManage && (
          <Button type="button" variant="accent" className="h-10 gap-1.5" disabled={!canCreate} onClick={() => setChooserOpen(true)}>
            <Plus className="size-4" aria-hidden />
            Créer un agent IA
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {toolbar}

      {viewMode === "studio" ? (
        <AgentStudio
          key={activeStudioAgentId}
          agents={agents}
          usage={usage}
          agencyName={agencyName}
          canManage={canManage}
          sources={sources}
          accounts={accounts}
          initialAgentId={activeStudioAgentId}
          onSwitchToList={() => setViewMode("list")}
        />
      ) : (
        <Section title="Support client">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {agents.map((agent) => {
              const Icon = STARTER_ICONS[agent.starterModel] ?? Bot;
              return (
                <Card key={agent.id} className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-navy-800 text-citron-400">
                        <Icon className="size-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-navy-800">{agent.name}</p>
                        <p className="truncate text-xs text-slate-600">{agent.role}</p>
                      </div>
                    </div>
                    <StatusBadge spec={agent.isActive ? { label: "Actif", tone: "success" } : { label: "Inactif", tone: "neutral" }} />
                  </div>
                  <p className="text-xs text-slate-600">
                    {MODEL_LABEL[agent.modelTier] ?? MODEL_LABEL.haiku} · réponse après {agent.responseDelaySeconds ?? 15} s
                  </p>
                  <div className="mt-auto flex flex-wrap gap-2 border-t border-border pt-3">
                    <Button type="button" variant="accent" size="sm" className="h-10 flex-1 gap-1.5" onClick={() => openInStudio(agent.id)}>
                      <Sparkles className="size-4" aria-hidden />
                      Ouvrir le Studio
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="h-10 gap-1.5" onClick={() => setTestingAgent(agent)}>
                      <FlaskConical className="size-4" aria-hidden />
                      Tester
                    </Button>
                    {canManage && (
                      <>
                        <Button type="button" variant="outline" size="icon" className="size-10" onClick={() => setEditingAgent(agent)} aria-label={`Modifier ${agent.name}`}>
                          <Settings className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-10 text-red-700"
                          disabled={deletingId === agent.id}
                          onClick={() => handleDelete(agent.id)}
                          aria-label={`Supprimer ${agent.name}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </Section>
      )}

      {chooserOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/50 p-4" role="dialog" aria-modal="true" aria-labelledby="choose-template-title">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-surface p-4 sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="choose-template-title" className="text-lg font-semibold text-navy-800">
                  Créer un agent IA
                </h2>
                <p className="text-sm text-slate-600">Choisissez un modèle de départ : l&apos;agent s&apos;ouvre ensuite dans le Studio.</p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setChooserOpen(false)} aria-label="Fermer">
                <X className="size-5" />
              </Button>
            </div>
            <AgentTemplateChooser onCreated={openInStudio} disabled={!canCreate} />
          </div>
        </div>
      )}

      {testingAgent && <AgentTesterModal agent={testingAgent} agencyName={agencyName} onClose={() => setTestingAgent(null)} />}
      {editingAgent && <AgentFormModal agent={editingAgent} onClose={() => setEditingAgent(null)} />}
    </div>
  );
}
