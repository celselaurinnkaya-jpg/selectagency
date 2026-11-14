"use client";

import { useActionState, useState } from "react";
import { X, Sparkles, Bot, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField, FormMessage, selectClass } from "@/components/shared/form";
import { initialFormState, type FormState } from "@/lib/form-state";
import { saveAiAgentAction } from "./actions";
import { AI_STARTER_MODELS, type AiAgentRecord, type AiStarterModel, type AiTone } from "@/lib/domain/ai";

interface AgentFormModalProps {
  agent?: AiAgentRecord | null;
  initialStarterModel?: AiStarterModel;
  onClose: () => void;
}

export function AgentFormModal({ agent, initialStarterModel, onClose }: AgentFormModalProps) {
  const [selectedStarter, setSelectedStarter] = useState<AiStarterModel>(
    agent?.starterModel || initialStarterModel || "general"
  );

  const initialSpec = AI_STARTER_MODELS[selectedStarter];

  const [name, setName] = useState(agent?.name || initialSpec.title);
  const [role, setRole] = useState(agent?.role || initialSpec.role);
  const [tone, setTone] = useState<AiTone>(agent?.tone || initialSpec.suggestedTone);
  const [personality, setPersonality] = useState(agent?.personality || "");
  const [instructions, setInstructions] = useState(agent?.systemInstructions || initialSpec.suggestedInstructions);
  const [services, setServices] = useState(agent?.servicesScope || initialSpec.suggestedServices);
  const [restricted, setRestricted] = useState(agent?.restrictedTopics || "");
  const [transfer, setTransfer] = useState(agent?.transferConditions || initialSpec.suggestedTransfer);
  const [isActive, setIsActive] = useState(agent ? agent.isActive : true);

  const [state, formAction, isPending] = useActionState(async (prev: FormState, formData: FormData) => {
    const res = await saveAiAgentAction(prev, formData);
    if (res.ok) {
      onClose();
    }
    return res;
  }, initialFormState);

  const handleStarterChange = (modelKey: AiStarterModel) => {
    setSelectedStarter(modelKey);
    const spec = AI_STARTER_MODELS[modelKey];
    if (spec) {
      if (!agent) {
        setName(spec.title);
        setRole(spec.role);
      }
      setTone(spec.suggestedTone);
      setInstructions(spec.suggestedInstructions);
      setServices(spec.suggestedServices);
      setTransfer(spec.suggestedTransfer);
    }
  };

  const e = state.fieldErrors ?? {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="relative my-6 flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-navy-100 bg-navy-800 px-5 py-4 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-citron-400 text-navy-900 font-bold">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {agent ? `Modifier l'agent : ${agent.name}` : "Configurer un nouvel agent IA"}
              </h2>
              <p className="text-xs text-navy-200">
                Personnalisez le rôle, le ton et les consignes de cet assistant
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

        {/* Corps scrollable */}
        <form action={formAction} className="flex-1 overflow-y-auto p-5 space-y-5">
          {agent?.id && <input type="hidden" name="id" value={agent.id} />}
          <input type="hidden" name="starterModel" value={selectedStarter} />

          {state.message && !state.ok && (
            <FormMessage message={state.message} tone="error" />
          )}

          {/* Sélecteur de modèle pré-configuré (si création) */}
          {!agent && (
            <div className="rounded-xl border border-citron-500/40 bg-citron-500/10 p-3.5 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-navy-900">
                <Sparkles className="h-4 w-4 text-navy-800" />
                <span>Modèle de départ pré-configuré</span>
              </div>
              <p className="text-xs text-slate-600">
                Sélectionnez un modèle pour charger instantanément ses consignes recommandées :
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                {(Object.keys(AI_STARTER_MODELS) as AiStarterModel[]).map((key) => {
                  const m = AI_STARTER_MODELS[key];
                  const isCur = selectedStarter === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleStarterChange(key)}
                      className={`text-left rounded-lg p-2 text-xs border transition-colors ${
                        isCur
                          ? "border-navy-800 bg-navy-800 text-white font-medium"
                          : "border-slate-200 bg-white text-slate-700 hover:border-navy-300"
                      }`}
                    >
                      <div className="truncate">{m.title}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Identité de base */}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="agent-name" label="Nom de l'agent" required error={e.name}>
              <Input
                id="agent-name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex. : Amina - Assistante Visas"
              />
            </FormField>

            <FormField id="agent-role" label="Rôle affiché" required error={e.role}>
              <Input
                id="agent-role"
                name="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Ex. : Conseillère voyages et visas"
              />
            </FormField>
          </div>

          {/* Ton et personnalité */}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="agent-tone" label="Ton de communication" required error={e.tone}>
              <select
                id="agent-tone"
                name="tone"
                value={tone}
                onChange={(e) => setTone(e.target.value as AiTone)}
                className={selectClass}
              >
                <option value="courtois">Courtois (Professionnel, poli et posé)</option>
                <option value="chaleureux">Chaleureux (Accueillant et bienveillant)</option>
                <option value="formel">Formel (Institutionnel et direct)</option>
                <option value="dynamique">Dynamique (Enthousiaste et proactif)</option>
              </select>
            </FormField>

            <FormField id="agent-personality" label="Personnalité (adjectifs clés)" error={e.personality}>
              <Input
                id="agent-personality"
                name="personality"
                value={personality}
                onChange={(e) => setPersonality(e.target.value)}
                placeholder="Ex. : Bienveillante, rigoureuse, encourageante"
              />
            </FormField>
          </div>

          {/* Consignes particulières */}
          <FormField
            id="agent-instructions"
            label="Consignes spécifiques données à l'agent"
            required
            hint="Rappelez à l'agent la manière de s'adresser au client et les points clés à demander."
            error={e.systemInstructions}
          >
            <Textarea
              id="agent-instructions"
              name="systemInstructions"
              rows={4}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Décrivez les instructions et attitudes attendues de l'agent..."
            />
          </FormField>

          {/* Services & Périmètre */}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="agent-services"
              label="Services couverts par l'agence"
              hint="Ex : Visas Schengen, Canada, Campus France, Billetterie."
              error={e.servicesScope}
            >
              <Textarea
                id="agent-services"
                name="servicesScope"
                rows={2}
                value={services}
                onChange={(e) => setServices(e.target.value)}
              />
            </FormField>

            <FormField
              id="agent-restricted"
              label="Sujets expressément interdits"
              hint="Ex : Pas d'estimations de bourses non officielles, pas de négociation."
              error={e.restrictedTopics}
            >
              <Textarea
                id="agent-restricted"
                name="restrictedTopics"
                rows={2}
                value={restricted}
                onChange={(e) => setRestricted(e.target.value)}
                placeholder="Ex. : Déconseiller tout paiement hors de l'agence..."
              />
            </FormField>
          </div>

          {/* Conditions de transfert vers un humain */}
          <FormField
            id="agent-transfer"
            label="Quand transférer à un conseiller de l'équipe ?"
            hint="L'IA déclenchera automatiquement une proposition de prise en charge humaine dans ces situations."
            error={e.transferConditions}
          >
            <Textarea
              id="agent-transfer"
              name="transferConditions"
              rows={2}
              value={transfer}
              onChange={(e) => setTransfer(e.target.value)}
              placeholder="Ex. : Dès que le client demande un devis chiffré ou a déjà essuyé un refus consulaire..."
            />
          </FormField>

          {/* Statut actif */}
          <div className="flex items-center gap-3 pt-2">
            <input
              type="checkbox"
              id="agent-active"
              name="isActive"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-navy-800 focus:ring-navy-500"
            />
            <label htmlFor="agent-active" className="text-sm font-medium text-slate-800">
              Agent actif (prêt à répondre)
            </label>
          </div>

          {/* Pied de modal fixe avec boutons */}
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
              {isPending ? "Enregistrement..." : agent ? "Mettre à jour l'agent" : "Créer l'agent"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

