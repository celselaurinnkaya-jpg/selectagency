"use client";

import { useActionState } from "react";
import { X, Plug, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormMessage } from "@/components/shared/form";
import { initialFormState, type FormState } from "@/lib/form-state";
import { connectWhatsAppAccountAction } from "./whatsapp-actions";

interface ConnectWhatsAppModalProps {
  onClose: () => void;
}

export function ConnectWhatsAppModal({ onClose }: ConnectWhatsAppModalProps) {
  const [state, formAction, isPending] = useActionState(
    async (prev: FormState, formData: FormData) => {
      const res = await connectWhatsAppAccountAction(prev, formData);
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
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-white font-bold">
              <Plug className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Connecter un numéro WhatsApp</h2>
              <p className="text-xs text-navy-200">
                Liaison officielle Cloud API avec Meta Business
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

          <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3 text-xs text-emerald-950 flex items-start gap-2.5">
            <ShieldCheck className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-emerald-900">Connexion sécurisée Cloud API</p>
              <p className="text-emerald-800/90 mt-0.5">
                SELECT Agency n&apos;a jamais accès à votre mot de passe ni à vos contacts personnels.
                Les messages transitent directement par les serveurs sécurisés de Meta.
              </p>
            </div>
          </div>

          <FormField
            id="display-phone"
            label="Numéro de téléphone WhatsApp"
            required
            hint="Avec indicatif international (ex : +237 6 99 11 22 33)."
            error={e.displayPhoneNumber}
          >
            <Input
              id="display-phone"
              name="displayPhoneNumber"
              defaultValue={v.displayPhoneNumber}
              placeholder="+237699112233"
            />
          </FormField>

          <FormField
            id="verified-name"
            label="Nom officiel affiché de l'agence"
            hint="Le nom d'entreprise validé dans Meta Business Suite."
            error={e.verifiedName}
          >
            <Input
              id="verified-name"
              name="verifiedName"
              defaultValue={v.verifiedName}
              placeholder="Ex. : Select Voyages & Visas"
            />
          </FormField>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              id="phone-number-id"
              label="Phone Number ID (Meta)"
              required
              hint="Identifiant numérique du numéro chez Meta."
              error={e.phoneNumberId}
            >
              <Input
                id="phone-number-id"
                name="phoneNumberId"
                defaultValue={v.phoneNumberId}
                placeholder="Ex. : 105829471938501"
              />
            </FormField>

            <FormField
              id="waba-id"
              label="WABA ID (Compte Business)"
              required
              hint="Identifiant du WhatsApp Business Account."
              error={e.wabaId}
            >
              <Input
                id="waba-id"
                name="wabaId"
                defaultValue={v.wabaId}
                placeholder="Ex. : 194820485910482"
              />
            </FormField>
          </div>

          {/* Option Coexistence */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2">
            <div className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-navy-800" />
              <label htmlFor="wa-coexistence" className="text-xs font-bold text-navy-900 cursor-pointer">
                Activer le mode Coexistence
              </label>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Permet de continuer à utiliser l&apos;application mobile WhatsApp Business sur le smartphone de votre agence
              tout en laissant l&apos;Agent IA de SELECT répondre aux nouveaux messages.
            </p>
            <div className="pt-1 flex items-center gap-2">
              <input
                type="checkbox"
                id="wa-coexistence"
                name="coexistence"
                defaultChecked={v.coexistence === "true"}
                className="h-4 w-4 rounded border-slate-300 text-navy-800 focus:ring-navy-500"
              />
              <label htmlFor="wa-coexistence" className="text-xs text-slate-700">
                Garder l&apos;application sur mon smartphone
              </label>
            </div>
          </div>

          {/* Boutons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-emerald-600 text-white hover:bg-emerald-700 font-medium"
            >
              <Plug className="h-4 w-4 mr-1.5" />
              {isPending ? "Connexion en cours..." : "Valider la connexion"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
