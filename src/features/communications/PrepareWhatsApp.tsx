"use client";

import { useState, useTransition } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { selectClass } from "@/components/shared/form";
import { logPreparedMessageAction } from "./actions";
import type { MessageTemplate } from "./templates";

// Prépare un message WhatsApp : l'agent l'envoie lui-même depuis WhatsApp.
// Aucune intégration n'est simulée ; le journal indique « préparé, envoi manuel ».

export function PrepareWhatsApp({
  clientId,
  caseId,
  phoneDigits,
  templates,
}: {
  clientId: string;
  caseId?: string;
  /** Absent pour les clients fictifs : leur numéro ne doit pas être contacté. */
  phoneDigits?: string;
  templates: MessageTemplate[];
}) {
  const [templateKey, setTemplateKey] = useState(templates[0]?.key ?? "");
  const [text, setText] = useState(templates[0]?.text ?? "");
  const [pending, startTransition] = useTransition();
  const [logged, setLogged] = useState(false);

  const open = () => {
    const url = `https://wa.me/${phoneDigits ?? ""}?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    startTransition(async () => {
      await logPreparedMessageAction({ clientId, caseId, summary: templates.find((t) => t.key === templateKey)?.label ?? "Message" });
      setLogged(true);
    });
  };

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="modele-message" className="mb-1 block text-sm font-medium text-slate-800">
          Modèle
        </label>
        <select
          id="modele-message"
          className={selectClass}
          value={templateKey}
          onChange={(event) => {
            setTemplateKey(event.target.value);
            setText(templates.find((t) => t.key === event.target.value)?.text ?? "");
            setLogged(false);
          }}
        >
          {templates.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="texte-message" className="mb-1 block text-sm font-medium text-slate-800">
          Message (modifiable)
        </label>
        <Textarea id="texte-message" rows={8} value={text} onChange={(event) => setText(event.target.value)} />
      </div>
      {!phoneDigits && (
        <p className="text-sm text-slate-600">
          Client fictif : le numéro n&apos;est pas prérempli, WhatsApp vous laissera choisir le destinataire.
        </p>
      )}
      <Button type="button" onClick={open} disabled={pending || text.trim().length < 5} className="bg-emerald-700 hover:bg-emerald-800">
        <MessageCircle aria-hidden />
        Ouvrir dans WhatsApp
      </Button>
      {logged && (
        <p role="status" className="text-sm text-emerald-800">
          Message noté comme « préparé, envoi manuel » dans l&apos;historique des communications.
        </p>
      )}
    </div>
  );
}
