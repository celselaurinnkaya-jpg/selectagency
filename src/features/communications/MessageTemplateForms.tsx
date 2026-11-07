"use client";

import { useRef, useState, useTransition } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { describedBy, FormField, FormMessage, selectClass } from "@/components/shared/form";
import { StatusBadge } from "@/components/shared/ui";
import { MESSAGE_AUDIENCE } from "@/lib/domain/labels";
import type { MessageAudience, MessageTemplate } from "@/lib/domain/types";
import { initialFormState, type FormState } from "@/lib/form-state";
import { deleteMessageTemplateAction, saveMessageTemplateAction } from "./actions";
import { PLACEHOLDERS, renderTemplate, type TemplateValues } from "./templates";

// Modèles de messages de l'agence : liste, ajout, modification, suppression. Champs contrôlés et envoi par
// onSubmit : React 19 ne remet pas le formulaire à zéro après l'enregistrement.

/** Valeurs d'exemple pour l'aperçu (aucune vraie donnée de client). */
function sampleValues(agencyName: string): TemplateValues {
  return {
    prenom: "Aïcha",
    nom: "Mbarga",
    agence: agencyName,
    conseiller: "Paul Ndongo",
    dossier: "DOS-2026-00042",
    solde: "150 000 FCFA",
    pieces_manquantes: "- Relevés de notes\n- Attestation de logement",
    rendez_vous: "« Préparation de l'entretien » demain à 10:00",
  };
}

function TemplateForm({ template, agencyName, onDone }: { template?: MessageTemplate; agencyName: string; onDone: () => void }) {
  const [state, setState] = useState<FormState>(initialFormState);
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(template?.title ?? "");
  const [body, setBody] = useState(template?.body ?? "Bonjour {prenom},\n\n\n\n{agence}");
  const [audience, setAudience] = useState<MessageAudience>(template?.audience ?? "any");
  const [isActive, setIsActive] = useState(template?.isActive ?? true);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const e = state.fieldErrors ?? {};
  const prefix = template ? `modele-${template.id}` : "modele-nouveau";
  const preview = renderTemplate(body, sampleValues(agencyName)).text;

  // Insère la zone à l'endroit du curseur.
  function insert(key: string) {
    const el = bodyRef.current;
    const zone = `{${key}}`;
    if (!el) return setBody((b) => b + zone);
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + zone + body.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + zone.length, start + zone.length);
    });
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveMessageTemplateAction({ id: template?.id ?? "", title, body, audience, isActive });
      setState(result);
      if (result.ok) onDone();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id={`${prefix}-titre`} label="Nom du modèle" required error={e.title}>
          <Input id={`${prefix}-titre`} maxLength={80} value={title} onChange={(ev) => setTitle(ev.target.value)} {...describedBy(`${prefix}-titre`, e.title)} />
        </FormField>
        <FormField id={`${prefix}-public`} label="Proposé pour" required error={e.audience}>
          <select id={`${prefix}-public`} className={selectClass} value={audience} onChange={(ev) => setAudience(ev.target.value as MessageAudience)}>
            {(Object.keys(MESSAGE_AUDIENCE) as MessageAudience[]).map((a) => (
              <option key={a} value={a}>
                {MESSAGE_AUDIENCE[a]}
              </option>
            ))}
          </select>
        </FormField>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-800">Zones remplies automatiquement</p>
        <div className="flex flex-wrap gap-2">
          {PLACEHOLDERS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => insert(p.key)}
              className="inline-flex min-h-10 items-center rounded-full border border-navy-200 bg-navy-50 px-3 text-xs font-medium text-navy-800 transition hover:bg-navy-100"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <FormField
        id={`${prefix}-texte`}
        label="Texte"
        required
        error={e.body}
        hint="Cliquez sur une zone pour l'insérer. Si la fiche n'a pas la donnée (par exemple aucun solde), le modèle est proposé grisé."
      >
        <Textarea
          ref={bodyRef}
          id={`${prefix}-texte`}
          rows={8}
          maxLength={2000}
          value={body}
          onChange={(ev) => setBody(ev.target.value)}
          {...describedBy(`${prefix}-texte`, e.body, "hint")}
        />
      </FormField>
      <div className="rounded-lg border border-dashed border-slate-300 bg-surface p-3">
        <p className="text-xs font-semibold text-slate-600">Aperçu avec un client fictif</p>
        <p className="mt-1 text-sm whitespace-pre-line text-slate-800">{preview}</p>
      </div>
      <label className="flex min-h-10 items-center gap-2 text-sm text-slate-800">
        <input type="checkbox" checked={isActive} onChange={(ev) => setIsActive(ev.target.checked)} className="size-4 accent-navy-800" />
        Proposer ce modèle aux conseillers
      </label>
      <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="accent" disabled={pending}>
          {pending ? "Enregistrement…" : template ? "Enregistrer" : "Ajouter le modèle"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

function DeleteTemplateButton({ template }: { template: MessageTemplate }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string>();
  if (!confirming) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(true)} className="text-red-700 hover:bg-red-50 hover:text-red-800">
        <Trash2 aria-hidden />
        Supprimer
      </Button>
    );
  }
  return (
    <span role="group" aria-label={`Supprimer le modèle « ${template.title} »`} className="inline-flex flex-wrap items-center justify-end gap-1">
      <span className="text-xs text-slate-600">Supprimer ce modèle ?</span>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await deleteMessageTemplateAction(template.id);
            if (!result.ok) setMessage(result.message);
          })
        }
      >
        {pending ? "Suppression…" : "Confirmer"}
      </Button>
      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setConfirming(false)}>
        Annuler
      </Button>
      {message && <span className="w-full text-right text-xs text-red-700">{message}</span>}
    </span>
  );
}

export function MessageTemplateList({ templates, agencyName, canManage }: { templates: MessageTemplate[]; agencyName: string; canManage: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {canManage && editing !== "new" && (
        <Button type="button" variant="accent" onClick={() => setEditing("new")}>
          <Plus aria-hidden />
          Nouveau modèle
        </Button>
      )}
      {editing === "new" && (
        <div className="rounded-xl border border-navy-200 bg-white p-4 shadow-[0_1px_3px_rgba(2,55,100,0.1)]">
          <TemplateForm agencyName={agencyName} onDone={() => setEditing(null)} />
        </div>
      )}
      <ul className="space-y-3">
        {templates.map((t) => (
          <li key={t.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(2,55,100,0.08)]">
            {editing === t.id ? (
              <TemplateForm template={t} agencyName={agencyName} onDone={() => setEditing(null)} />
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-navy-800">{t.title}</p>
                    <StatusBadge spec={{ label: MESSAGE_AUDIENCE[t.audience], tone: "navy" }} />
                    {!t.isActive && <StatusBadge spec={{ label: "Non proposé", tone: "neutral" }} />}
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <Button type="button" variant="outline" size="sm" onClick={() => setEditing(t.id)}>
                        <Pencil aria-hidden />
                        Modifier
                      </Button>
                      <DeleteTemplateButton template={t} />
                    </div>
                  )}
                </div>
                <p className="line-clamp-4 text-sm whitespace-pre-line text-slate-600">{t.body}</p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
