"use client";

import { useActionState } from "react";
import { X, Save, FileText, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField, FormMessage, selectClass } from "@/components/shared/form";
import { initialFormState, type FormState } from "@/lib/form-state";
import { saveTextKnowledgeAction } from "./knowledge-actions";
import type { AiAgentRecord } from "@/lib/domain/ai";

interface AddTextKnowledgeModalProps {
  agents: AiAgentRecord[];
  selectedAgentId?: string;
  onClose: () => void;
}

export function AddTextKnowledgeModal({
  agents,
  selectedAgentId,
  onClose,
}: AddTextKnowledgeModalProps) {
  const [state, formAction, isPending] = useActionState(
    async (prev: FormState, formData: FormData) => {
      const res = await saveTextKnowledgeAction(prev, formData);
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
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Ajouter un texte ou une FAQ</h2>
              <p className="text-xs text-navy-200">
                L&apos;agent utilisera ces informations vérifiées pour répondre précisément à vos clients.
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

          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs text-blue-900 flex items-start gap-2">
            <Sparkles className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <p>
              Le texte sera automatiquement segmenté en fragments intelligents (chunks)
              pour permettre à l&apos;IA de trouver la réponse exacte en une fraction de seconde sans déformer vos tarifs ni vos règles.
            </p>
          </div>

          <FormField id="agent-select" label="Rattacher à l'agent" required error={e.agentId}>
            <select
              id="agent-select"
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
            id="source-title"
            label="Titre du document ou de la section"
            required
            hint="Ex : Tarifs consulaires Schengen 2026, Procédure Campus France étape par étape..."
            error={e.title}
          >
            <Input
              id="source-title"
              name="title"
              defaultValue={v.title}
              placeholder="Ex. : Grille tarifaire et frais d'assistance 2026"
            />
          </FormField>

          <FormField
            id="source-content"
            label="Contenu textuel (procédures, tarifs, consignes)"
            required
            hint="Copiez-collez vos notes, questions fréquentes ou grilles officielles."
            error={e.content}
          >
            <Textarea
              id="source-content"
              name="content"
              rows={8}
              defaultValue={v.content}
              placeholder="Détaillez les informations ici...
Exemple :
Le visa Schengen touristique exige :
1. Un passeport valide au moins 6 mois après le séjour.
2. Deux photos 3.5 x 4.5 cm sur fond clair.
3. Les frais consulaires : (montant officiel du consulat).
4. Les frais de dossier de notre agence : (votre tarif)."
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
              {isPending ? "Indexation en cours..." : "Enregistrer et indexer"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

