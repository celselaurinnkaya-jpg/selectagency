"use client";

import { useActionState } from "react";
import { X, Save, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField, FormMessage, selectClass } from "@/components/shared/form";
import { initialFormState, type FormState } from "@/lib/form-state";
import { saveUrlKnowledgeAction } from "./knowledge-actions";
import type { AiAgentRecord } from "@/lib/domain/ai";

interface AddUrlKnowledgeModalProps {
  agents: AiAgentRecord[];
  selectedAgentId?: string;
  onClose: () => void;
}

export function AddUrlKnowledgeModal({
  agents,
  selectedAgentId,
  onClose,
}: AddUrlKnowledgeModalProps) {
  const [state, formAction, isPending] = useActionState(
    async (prev: FormState, formData: FormData) => {
      const res = await saveUrlKnowledgeAction(prev, formData);
      if (res.ok) {
        onClose();
      }
      return res;
    },
    initialFormState
  );

  const e = state.fieldErrors ?? {};
  const v = state.values ?? {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="relative my-6 flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-navy-100 bg-navy-800 px-5 py-4 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-citron-400 text-navy-900 font-bold">
              <Globe className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Ajouter un lien web officiel</h2>
              <p className="text-xs text-navy-200">
                Site officiel d&apos;ambassade, plateforme de bourses ou portail de démarches.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-navy-100 hover:text-white hover:bg-navy-700 h-8 w-8 p-0"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Corps */}
        <form action={formAction} className="flex-1 overflow-y-auto p-5 space-y-4">
          {state.message && !state.ok && (
            <FormMessage message={state.message} tone="error" />
          )}

          <FormField id="url-agent-select" label="Rattacher à l'agent" required error={e.agentId}>
            <select
              id="url-agent-select"
              name="agentId"
              defaultValue={v.agentId ?? selectedAgentId ?? agents[0]?.id}
              className={selectClass}
            >
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} ({agent.role})
                </option>
              ))}
            </select>
          </FormField>

          <FormField
            id="url-title"
            label="Titre de la source"
            required
            hint="Ex : Portail Campus France Cameroun, Consulat Général de France à Douala..."
            error={e.title}
          >
            <Input
              id="url-title"
              name="title"
              defaultValue={v.title}
              placeholder="Ex. : Portail officiel Campus France"
            />
          </FormField>

          <FormField
            id="url-address"
            label="Adresse Web (URL)"
            required
            hint="Le lien exact vers la page officielle."
            error={e.url}
          >
            <Input
              id="url-address"
              name="url"
              type="url"
              defaultValue={v.url}
              placeholder="https://www.cameroun.campusfrance.org"
            />
          </FormField>

          <FormField
            id="url-content"
            label="Informations clés et résumé pour l'agent"
            required
            hint="Résumez les points essentiels que l'agent doit connaître à partir de ce site."
            error={e.content}
          >
            <Textarea
              id="url-content"
              name="content"
              rows={5}
              defaultValue={v.content}
              placeholder="Résumez ici les éléments clés du site : dates de candidatures, pièces justificatives obligatoires, attestations de virement..."
            />
          </FormField>

          {/* Pied */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-navy-800 text-white hover:bg-navy-900"
            >
              <Save className="h-4 w-4 mr-1.5" />
              {isPending ? "Indexation..." : "Enregistrer et indexer"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
