"use client";

import { useActionState } from "react";
import { X, Save, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField, FormMessage, selectClass } from "@/components/shared/form";
import { initialFormState, type FormState } from "@/lib/form-state";
import { saveTemplateAction } from "./templates-actions";

interface AddTemplateModalProps {
  onClose: () => void;
}

export function AddTemplateModal({ onClose }: AddTemplateModalProps) {
  const [state, formAction, isPending] = useActionState(
    async (prev: FormState, formData: FormData) => {
      const res = await saveTemplateAction(prev, formData);
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
      <div className="relative my-6 flex max-h-[92vh] w-full max-w-xl flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-navy-100 bg-navy-800 px-5 py-4 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-citron-400 text-navy-900 font-bold">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Nouveau modèle WhatsApp Meta</h2>
              <p className="text-xs text-navy-200">
                Message structuré pour initier ou relancer une conversation (+24h)
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

        {/* Formulaire */}
        <form action={formAction} className="flex-1 overflow-y-auto p-5 space-y-4">
          {state.message && !state.ok && (
            <FormMessage message={state.message} tone="error" />
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              id="template-name"
              label="Nom technique"
              required
              hint="Minuscules, chiffres et tirets du bas uniquement."
              error={e.name}
            >
              <Input
                id="template-name"
                name="name"
                defaultValue={v.name}
                placeholder="ex: relance_rendez_vous"
              />
            </FormField>

            <FormField id="template-category" label="Catégorie Meta" required error={e.category}>
              <select
                id="template-category"
                name="category"
                defaultValue={v.category ?? "UTILITY"}
                className={selectClass}
              >
                <option value="UTILITY">Utilitaire (Rappels, suivis de dossier)</option>
                <option value="MARKETING">Marketing (Offres, actualités)</option>
                <option value="AUTHENTICATION">Authentification (Codes sécurisés)</option>
              </select>
            </FormField>
          </div>

          <FormField
            id="template-body"
            label="Corps du message"
            required
            hint="Vous pouvez utiliser des variables {{1}}, {{2}}."
            error={e.bodyText}
          >
            <Textarea
              id="template-body"
              name="bodyText"
              rows={5}
              defaultValue={v.bodyText}
              placeholder="Bonjour {{1}}, votre dossier de visa pour {{2}} est prêt pour le dépôt consulaire. Merci de passer à l'agence pour récupérer vos originaux."
            />
          </FormField>

          {/* Pied */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-navy-800 text-white hover:bg-navy-900"
            >
              <Save className="h-4 w-4 mr-1.5" />
              {isPending ? "Enregistrement..." : "Enregistrer le modèle"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

