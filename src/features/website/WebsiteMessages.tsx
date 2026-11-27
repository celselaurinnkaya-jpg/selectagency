"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Mail, MessageCircle, Phone, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/shared/form";
import { StatusBadge } from "@/components/shared/ui";
import type { Bureau } from "@/lib/domain/types";
import { initialFormState, type FormState } from "@/lib/form-state";
import { BureauBadge } from "@/features/bureaux/BureauBadge";
import { deleteWebsiteMessagesAction } from "./actions";
import { MessageHandledButton } from "./MessageHandledButton";

// « Messages reçus par le site » : les demandes envoyées par le formulaire « Contact », avec des cases à cocher
// pour en supprimer une ou plusieurs d'un coup. Supprimer enlève seulement le message de la liste : la fiche
// prospect et la tâche « Rappeler » restent.

/** Message prêt à afficher (dates et numéro déjà mis en forme par le serveur, dans le fuseau de l'agence). */
export interface MessageView {
  id: string;
  clientId?: string;
  bureau?: Bureau;
  firstName: string;
  lastName: string;
  phone: string;
  phoneLabel: string;
  whatsapp?: string;
  email?: string;
  service: string;
  destination: string;
  message: string;
  isNewClient: boolean;
  receivedLabel: string;
  handled: boolean;
  handledLabel?: string;
  handledBy?: string;
}

const confirmText = (count: number) =>
  count > 1
    ? `Supprimer ces ${count} messages ? Ils disparaîtront de la liste. Les fiches prospects et les tâches « Rappeler » restent.`
    : "Supprimer ce message ? Il disparaîtra de la liste. La fiche prospect et la tâche « Rappeler » restent.";

export function WebsiteMessages({ messages, canManage, emptyText }: { messages: MessageView[]; canManage: boolean; emptyText: string }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [state, setState] = useState<FormState>(initialFormState);
  const [pending, start] = useTransition();
  const present = new Set(messages.map((m) => m.id));
  const chosen = selected.filter((id) => present.has(id));
  const allChecked = messages.length > 0 && chosen.length === messages.length;

  const remove = (ids: string[]) => {
    if (ids.length === 0 || !confirm(confirmText(ids.length))) return;
    start(async () => {
      const result = await deleteWebsiteMessagesAction(ids);
      setState(result);
      if (result.ok) setSelected((current) => current.filter((id) => !ids.includes(id)));
    });
  };
  const toggle = (id: string, on: boolean) => setSelected((current) => (on ? [...current, id] : current.filter((x) => x !== id)));

  return (
    <div className="space-y-3">
      <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
      {messages.length === 0 ? (
        <p className="rounded-xl bg-white p-4 text-sm text-slate-600">{emptyText}</p>
      ) : (
        <>
          {canManage && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-4 py-1.5 shadow-[0_1px_2px_rgba(2,55,100,0.08)]">
              <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={(event) => setSelected(event.target.checked ? messages.map((m) => m.id) : [])}
                  className="size-4 accent-navy-800"
                />
                Tout cocher
              </label>
              <div className="flex flex-wrap items-center gap-3">
                {chosen.length > 0 && <span className="text-sm text-slate-600">{chosen.length > 1 ? `${chosen.length} messages cochés` : "1 message coché"}</span>}
                <Button type="button" size="sm" variant="outline" className="text-red-700" disabled={chosen.length === 0 || pending} onClick={() => remove(chosen)}>
                  <Trash2 className="size-4" aria-hidden />
                  {pending ? "Suppression…" : "Supprimer la sélection"}
                </Button>
              </div>
            </div>
          )}
          <ul className="space-y-3">
            {messages.map((m) => (
              <MessageItem
                key={m.id}
                message={m}
                canManage={canManage}
                checked={chosen.includes(m.id)}
                onCheck={(on) => toggle(m.id, on)}
                onDelete={() => remove([m.id])}
                busy={pending}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function MessageItem({
  message: m,
  canManage,
  checked,
  onCheck,
  onDelete,
  busy,
}: {
  message: MessageView;
  canManage: boolean;
  checked: boolean;
  onCheck: (on: boolean) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  return (
    <li className={`flex gap-3 rounded-xl border p-4 ${checked ? "border-navy-400 bg-navy-50/40" : m.handled ? "border-slate-200 bg-slate-50" : "border-navy-200 bg-white"}`}>
      {canManage && (
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onCheck(event.target.checked)}
          aria-label={`Cocher le message de ${m.firstName} ${m.lastName}`}
          className="mt-1 size-4 shrink-0 accent-navy-800"
        />
      )}
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">
              {m.firstName} {m.lastName}
            </p>
            <p className="text-xs text-slate-500">Reçu le {m.receivedLabel}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <BureauBadge bureau={m.bureau} />
            {m.handled && <StatusBadge spec={{ label: "Traité", tone: "success" }} />}
            <StatusBadge spec={m.isNewClient ? { label: "Nouveau prospect", tone: "info" } : { label: "Client déjà connu", tone: "neutral" }} />
          </div>
        </div>

        {(m.service || m.destination) && (
          <p className="text-sm text-slate-700">
            {m.service && (
              <>
                Service : <strong className="font-medium text-slate-900">{m.service}</strong>
              </>
            )}
            {m.service && m.destination && " · "}
            {m.destination && (
              <>
                Destination : <strong className="font-medium text-slate-900">{m.destination}</strong>
              </>
            )}
          </p>
        )}
        {m.message ? (
          <p className="rounded-lg bg-slate-100/70 px-3 py-2 text-sm whitespace-pre-line text-slate-800">{m.message}</p>
        ) : (
          <p className="text-sm text-slate-500 italic">Pas de message écrit.</p>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {m.phone && (
            <a href={`tel:${m.phone}`} className="inline-flex min-h-10 items-center gap-1.5 font-medium text-navy-700 hover:underline">
              <Phone className="size-4" aria-hidden /> {m.phoneLabel}
            </a>
          )}
          {m.whatsapp && (
            <a href={m.whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 font-medium text-navy-700 hover:underline">
              <MessageCircle className="size-4" aria-hidden /> WhatsApp
            </a>
          )}
          {m.email && (
            <a href={`mailto:${m.email}`} className="inline-flex min-h-10 min-w-0 items-center gap-1.5 font-medium break-all text-navy-700 hover:underline">
              <Mail className="size-4 shrink-0" aria-hidden /> {m.email}
            </a>
          )}
          {m.clientId && (
            <Link href={`/clients/${m.clientId}`} className="inline-flex min-h-10 items-center font-medium text-navy-700 hover:underline">
              Ouvrir la fiche
            </Link>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          {m.handledLabel ? (
            <p className="text-xs text-slate-500">
              Traité le {m.handledLabel}
              {m.handledBy ? ` par ${m.handledBy}` : ""}
            </p>
          ) : (
            <span />
          )}
          {canManage && (
            <div className="flex flex-wrap items-start gap-2">
              <MessageHandledButton messageId={m.id} handled={m.handled} />
              <Button type="button" size="sm" variant="ghost" className="text-red-700" disabled={busy} onClick={onDelete}>
                <Trash2 className="size-4" aria-hidden />
                Supprimer
              </Button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
