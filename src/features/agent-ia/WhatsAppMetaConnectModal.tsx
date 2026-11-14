"use client";

import { ShieldCheck, Smartphone, X } from "lucide-react";
import { PlannedAction } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";

// Connexion officielle du WhatsApp de l'agence : fenêtre « Embedded Signup » de Meta avec la Coexistence
// (l'agence garde son application WhatsApp Business et scanne un code QR affiché par Meta).
// Le bouton reste désactivé tant que Meta n'a pas validé SELECT (étape A de docs/ARCHITECTURE_AGENT_IA.md).
// Aucun code QR n'est fabriqué par SELECT : seul celui de Meta relie réellement un téléphone.

const STEPS = [
  "Cliquez sur « Continuer avec Meta » et connectez-vous avec le compte Facebook du responsable de l'agence.",
  "Choisissez le portefeuille Meta Business de l'agence, puis indiquez le numéro déjà utilisé dans l'application WhatsApp Business.",
  "Sur le téléphone, WhatsApp Business affiche un message de Meta : ouvrez-le et scannez le code QR qui apparaît à l'écran.",
  "Acceptez le partage de l'historique : les conversations arrivent dans SELECT et restent aussi sur le téléphone. Les nouveaux messages apparaissent des deux côtés.",
];

export function WhatsAppMetaConnectModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/50 p-4" role="dialog" aria-modal="true" aria-labelledby="meta-connect-title">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-[0_1px_3px_rgba(2,55,100,0.1)]">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-md bg-navy-800 text-citron-400">
              <Smartphone className="size-5" aria-hidden />
            </span>
            <div>
              <h2 id="meta-connect-title" className="font-semibold text-navy-800">
                Connecter le WhatsApp de l&apos;agence
              </h2>
              <p className="text-xs text-slate-600">Par la fenêtre officielle de Meta</p>
            </div>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Fermer">
            <X className="size-5" />
          </Button>
        </div>

        <div className="space-y-4 px-5 py-4 text-sm text-slate-700">
          <ol className="space-y-3">
            {STEPS.map((step, i) => (
              <li key={step} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-navy-800 text-xs font-semibold text-citron-400 tabular-nums">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          <div className="rounded-xl border border-border bg-surface p-3 text-xs text-slate-700">
            <p className="flex items-center gap-1.5 font-semibold text-navy-800">
              <ShieldCheck className="size-4" aria-hidden />
              Bon à savoir
            </p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              <li>SELECT ne demande jamais le mot de passe WhatsApp de l&apos;agence.</li>
              <li>Il faut l&apos;application WhatsApp Business à jour (pas WhatsApp classique), et l&apos;ouvrir régulièrement sur le téléphone.</li>
              <li>Meta facture certains messages : l&apos;agence ajoute un moyen de paiement dans son compte Meta.</li>
            </ul>
          </div>

          <PlannedAction label="Continuer avec Meta" reason="Disponible après la validation de SELECT par Meta." />
        </div>
      </div>
    </div>
  );
}
