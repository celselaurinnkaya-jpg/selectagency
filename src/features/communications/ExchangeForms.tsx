"use client";

import { useState, useTransition } from "react";
import { ArrowDownLeft, ArrowUpRight, NotebookPen } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { describedBy, FormField, FormMessage, selectClass } from "@/components/shared/form";
import { COMMUNICATION_CHANNEL, EXCHANGE_CHANNELS } from "@/lib/domain/labels";
import type { CommunicationChannel, CommunicationDirection } from "@/lib/domain/types";
import { initialFormState, type FormState } from "@/lib/form-state";
import { addNoteAction, logExchangeAction } from "./actions";

// Champs contrôlés et envoi par onSubmit : React 19 ne remet pas le formulaire à zéro après l'enregistrement.

/** Noter un échange fait hors de SELECT (appel, WhatsApp, Messenger, visite…), avec la relance suivante. */
export function LogExchangeForm({ clientId, caseId, today, nowTime }: { clientId: string; caseId?: string; today: string; nowTime: string }) {
  const [state, setState] = useState<FormState>(initialFormState);
  const [pending, startTransition] = useTransition();
  const [channel, setChannel] = useState<CommunicationChannel>("whatsapp");
  const [direction, setDirection] = useState<CommunicationDirection>("inbound");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState(nowTime);
  const [summary, setSummary] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const e = state.fieldErrors ?? {};
  const id = (name: string) => `echange-${name}${caseId ? "-dossier" : ""}`;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await logExchangeAction({ clientId, caseId: caseId ?? "", channel, direction, date, time, summary, followUpDate });
      setState(result);
      if (result.ok) {
        setSummary("");
        setFollowUpDate("");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id={id("canal")} label="Canal" required error={e.channel}>
          <select id={id("canal")} className={selectClass} value={channel} onChange={(ev) => setChannel(ev.target.value as CommunicationChannel)}>
            {EXCHANGE_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {COMMUNICATION_CHANNEL[c]}
              </option>
            ))}
          </select>
        </FormField>
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium text-slate-800">
            Qui a pris contact ?<span className="text-red-700" aria-hidden>*</span>
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {(["inbound", "outbound"] as const).map((d) => {
              const Icon = d === "inbound" ? ArrowDownLeft : ArrowUpRight;
              return (
                <label
                  key={d}
                  className={cn(
                    "flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm transition",
                    direction === d ? "border-navy-800 bg-navy-50 font-medium text-navy-900 ring-1 ring-navy-800" : "border-slate-200 bg-white text-slate-700 hover:border-navy-200",
                  )}
                >
                  <input type="radio" name={id("sens")} value={d} checked={direction === d} onChange={() => setDirection(d)} className="sr-only" />
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {d === "inbound" ? "Le client" : "L'agence"}
                </label>
              );
            })}
          </div>
        </fieldset>
        <FormField id={id("date")} label="Date" required error={e.date}>
          <Input id={id("date")} type="date" max={today} value={date} onChange={(ev) => setDate(ev.target.value)} {...describedBy(id("date"), e.date)} />
        </FormField>
        <FormField id={id("heure")} label="Heure" required error={e.time}>
          <Input id={id("heure")} type="time" value={time} onChange={(ev) => setTime(ev.target.value)} {...describedBy(id("heure"), e.time)} />
        </FormField>
      </div>
      <FormField id={id("resume")} label="Résumé de l'échange" required error={e.summary} hint="Ce qui a été dit ou demandé, et la suite convenue.">
        <Textarea
          id={id("resume")}
          rows={4}
          maxLength={1000}
          value={summary}
          onChange={(ev) => setSummary(ev.target.value)}
          placeholder="Ex. : a vu notre publication sur les études au Canada, demande les tarifs et les délais."
          {...describedBy(id("resume"), e.summary, "hint")}
        />
      </FormField>
      <FormField id={id("relance")} label="Prochaine relance le" error={e.followUpDate} hint="Crée une tâche « Relancer » pour le conseiller de la fiche.">
        <Input id={id("relance")} type="date" min={today} value={followUpDate} onChange={(ev) => setFollowUpDate(ev.target.value)} {...describedBy(id("relance"), e.followUpDate, "hint")} />
      </FormField>
      <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
      <Button type="submit" disabled={pending}>
        {pending ? "Enregistrement…" : "Noter l'échange"}
      </Button>
      <p className="text-xs text-slate-500">L&apos;échange est noté tel que vous le décrivez : SELECT n&apos;envoie rien à votre place.</p>
    </form>
  );
}

/** Note de suivi interne, ajoutée à l'historique de la fiche (ou du dossier). */
export function AddNoteForm({ clientId, caseId }: { clientId: string; caseId?: string }) {
  const [state, setState] = useState<FormState>(initialFormState);
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState("");
  const id = `note-suivi${caseId ? "-dossier" : ""}`;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await addNoteAction({ clientId, caseId: caseId ?? "", text });
      setState(result);
      if (result.ok) setText("");
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <FormField id={id} label="Note de suivi" required error={state.fieldErrors?.text} hint="Visible par l'équipe seulement. N'y inscrivez ni numéro de passeport ni donnée bancaire.">
        <Textarea id={id} rows={3} maxLength={1500} value={text} onChange={(ev) => setText(ev.target.value)} {...describedBy(id, state.fieldErrors?.text, "hint")} />
      </FormField>
      <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
      <Button type="submit" variant="outline" disabled={pending}>
        <NotebookPen aria-hidden />
        {pending ? "Enregistrement…" : "Ajouter la note"}
      </Button>
    </form>
  );
}
