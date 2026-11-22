"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/shared/form";
import { logPreparedMessageAction } from "@/features/communications/actions";

// Relance des pièces manquantes par WhatsApp (rapport de re-test du 22/11), à côté de la relance par e-mail.
// WhatsApp manuel : le message s'ouvre déjà rédigé, la personne l'envoie elle-même. L'historique dit « préparé »,
// jamais « envoyé » : rien n'est envoyé par SELECT, et ce n'est pas l'agent IA.

export function MissingDocumentsWhatsAppButton({ clientId, caseId, phoneDigits, text }: { clientId: string; caseId: string; phoneDigits?: string; text: string }) {
  const [note, setNote] = useState<string>();
  return (
    <div className="space-y-2">
      <Button
        type="button"
        className="bg-emerald-700 text-white hover:bg-emerald-800"
        onClick={async () => {
          window.open(`https://wa.me/${phoneDigits ?? ""}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
          await logPreparedMessageAction({ clientId, caseId, summary: "Relance des pièces manquantes" });
          setNote("WhatsApp est ouvert avec la liste des pièces : vérifiez le message, puis envoyez-le. La relance est notée « préparée » dans l'historique.");
        }}
      >
        <MessageCircle aria-hidden />
        Relancer par WhatsApp
      </Button>
      {!phoneDigits && <p className="text-xs text-slate-500">Pas de numéro WhatsApp sur la fiche : WhatsApp vous laissera choisir le destinataire.</p>}
      <FormMessage message={note} tone="success" />
    </div>
  );
}
