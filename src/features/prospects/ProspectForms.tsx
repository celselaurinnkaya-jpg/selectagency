"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CalendarClock, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { describedBy, FormField, FormMessage, selectClass } from "@/components/shared/form";
import { CLIENT_SOURCE, SERVICE_MOTIVES } from "@/lib/domain/labels";
import type { ClientSource } from "@/lib/domain/types";
import { initialFormState, type FormState } from "@/lib/form-state";
import { convertProspectAction, saveProspectAction, scheduleFollowUpAction } from "./actions";

// Formulaires des prospects. Champs contrôlés envoyés par onSubmit (React 19 vide un formulaire
// « action » après chaque réponse, même refusée : rien ne doit se perdre).

interface Option {
  value: string;
  label: string;
}

/** « 2026-11-01 » + n jours → « 2026-11-0x » (jour du fuseau de l'agence, sans heure). */
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const QUICK_DAYS = [
  { label: "Demain", days: 1 },
  { label: "Dans 3 jours", days: 3 },
  { label: "Dans une semaine", days: 7 },
];

const SOURCES = Object.entries(CLIENT_SOURCE) as [ClientSource, string][];

export function ProspectForm({
  countries,
  members,
  defaultCountry,
  defaultMemberId,
  today,
}: {
  countries: Option[];
  members: Option[];
  defaultCountry: string;
  defaultMemberId: string;
  today: string;
}) {
  const [state, setState] = useState<FormState>(initialFormState);
  const [saving, startTransition] = useTransition();
  const [leaving, setLeaving] = useState(false);
  const pending = saving || leaving;
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState(defaultCountry);
  const [city, setCity] = useState("");
  const [source, setSource] = useState<ClientSource | "">("");
  const [sourceDetail, setSourceDetail] = useState("");
  const [motive, setMotive] = useState("study_abroad");
  const [assignedTo, setAssignedTo] = useState(defaultMemberId);
  const [followUp, setFollowUp] = useState(addDays(today, 1));
  const [notes, setNotes] = useState("");
  const [partnerCode, setPartnerCode] = useState("");
  const e = state.fieldErrors ?? {};

  function save(confirmDuplicate = false) {
    startTransition(async () => {
      const result = await saveProspectAction({
        firstName, lastName, phone, whatsapp, email, residenceCountry: country, city, source: source as ClientSource,
        sourceDetail, serviceMotive: motive, assignedTo, notes, followUpDate: followUp, partnerCode, confirmDuplicate,
      });
      // Chargement complet de la fiche : Next garde parfois l'ancienne page en mémoire.
      if (result.redirectTo) {
        setLeaving(true);
        window.location.assign(result.redirectTo);
      } else setState(result);
    });
  }

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      {state.duplicates?.length ? (
        <div role="alert" className="space-y-3 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-950">
          <p className="font-semibold">{state.message}</p>
          <ul className="space-y-1">
            {state.duplicates.map((d) => (
              <li key={d.id}>
                <Link href={`/clients/${d.id}`} className="font-medium underline">
                  {d.label}
                </Link>{" "}
                : {d.reasons.join(", ")}
              </li>
            ))}
          </ul>
          <p>S&apos;il s&apos;agit d&apos;une autre personne, vous pouvez créer la fiche. Rien n&apos;est fusionné automatiquement.</p>
          <Button type="button" variant="outline" disabled={pending} onClick={() => save(true)}>
            Ce n&apos;est pas la même personne : créer la fiche
          </Button>
        </div>
      ) : (
        <FormMessage message={state.ok ? undefined : state.message} />
      )}

      <fieldset className="space-y-4 rounded-2xl bg-surface p-4 sm:p-5">
        <legend className="sr-only">Contact</legend>
        <h2 className="text-base font-semibold text-navy-800">Le contact</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="p-first" label="Prénom" required error={e.firstName}>
            <Input id="p-first" autoComplete="off" value={firstName} onChange={(ev) => setFirstName(ev.target.value)} {...describedBy("p-first", e.firstName)} />
          </FormField>
          <FormField id="p-last" label="Nom" required error={e.lastName}>
            <Input id="p-last" autoComplete="off" value={lastName} onChange={(ev) => setLastName(ev.target.value)} {...describedBy("p-last", e.lastName)} />
          </FormField>
          <FormField id="p-phone" label="Téléphone" required error={e.phone} hint="L'indicatif suit le pays choisi.">
            <Input id="p-phone" type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={(ev) => setPhone(ev.target.value)} {...describedBy("p-phone", e.phone, "hint")} />
          </FormField>
          <FormField id="p-whatsapp" label="WhatsApp" error={e.whatsapp} hint="Vide s'il s'agit du même numéro.">
            <Input id="p-whatsapp" type="tel" inputMode="tel" autoComplete="off" value={whatsapp} onChange={(ev) => setWhatsapp(ev.target.value)} {...describedBy("p-whatsapp", e.whatsapp, "hint")} />
          </FormField>
          <FormField id="p-country" label="Pays" required error={e.residenceCountry}>
            <select id="p-country" value={country} onChange={(ev) => setCountry(ev.target.value)} className={selectClass}>
              {countries.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="p-city" label="Ville" error={e.city}>
            <Input id="p-city" value={city} onChange={(ev) => setCity(ev.target.value)} />
          </FormField>
          <FormField id="p-email" label="Adresse e-mail" error={e.email} className="sm:col-span-2">
            <Input id="p-email" type="email" inputMode="email" autoComplete="off" value={email} onChange={(ev) => setEmail(ev.target.value)} {...describedBy("p-email", e.email)} />
          </FormField>
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-2xl bg-surface p-4 sm:p-5">
        <legend className="sr-only">Origine et projet</legend>
        <h2 className="text-base font-semibold text-navy-800">D&apos;où vient-il, que cherche-t-il ?</h2>
        <div className="space-y-2">
          <p id="p-source-label" className="text-sm text-slate-800">
            Origine du contact <span className="text-red-700" aria-hidden>*</span>
          </p>
          <div role="radiogroup" aria-labelledby="p-source-label" className="flex flex-wrap gap-2">
            {SOURCES.map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={source === value}
                onClick={() => setSource(value)}
                className="inline-flex min-h-10 items-center rounded-full border border-slate-200 bg-white px-4 text-sm text-slate-700 transition hover:border-navy-300 aria-checked:border-navy-800 aria-checked:bg-navy-800 aria-checked:text-white"
              >
                {label}
              </button>
            ))}
          </div>
          {e.source?.length ? <p className="text-sm text-red-700">{e.source[0]}</p> : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="p-source-detail"
            label={source === "referral" ? "Recommandé par" : "Précision sur l'origine"}
            error={e.sourceDetail}
            hint={source === "referral" ? "Nom de la personne ou du partenaire qui l'envoie." : "Ex. : publicité de la rentrée, salon étudiant."}
          >
            <Input id="p-source-detail" maxLength={120} value={sourceDetail} onChange={(ev) => setSourceDetail(ev.target.value)} {...describedBy("p-source-detail", e.sourceDetail, "hint")} />
          </FormField>
          <FormField id="p-partner" label="Code partenaire" error={e.partnerCode} hint="Si un partenaire vous l'envoie : sa commission sera suivie.">
            <Input id="p-partner" maxLength={20} autoComplete="off" value={partnerCode} onChange={(ev) => setPartnerCode(ev.target.value.toUpperCase())} placeholder="Ex. : AMINA-2026" className="font-mono uppercase" {...describedBy("p-partner", e.partnerCode, "hint")} />
          </FormField>
          <FormField id="p-motive" label="Projet" error={e.serviceMotive}>
            <select id="p-motive" value={motive} onChange={(ev) => setMotive(ev.target.value)} className={selectClass}>
              {Object.entries(SERVICE_MOTIVES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </FormField>
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-2xl bg-surface p-4 sm:p-5">
        <legend className="sr-only">Suivi</legend>
        <h2 className="text-base font-semibold text-navy-800">Suivi par l&apos;agence</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="p-advisor" label="Conseiller" required error={e.assignedTo}>
            <select id="p-advisor" value={assignedTo} onChange={(ev) => setAssignedTo(ev.target.value)} className={selectClass}>
              {members.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="p-follow" label="Première relance" error={e.followUpDate} hint="Une tâche « Relancer… » est créée pour le conseiller. Vide : aucune relance.">
            <Input id="p-follow" type="date" min={today} value={followUp} onChange={(ev) => setFollowUp(ev.target.value)} {...describedBy("p-follow", e.followUpDate, "hint")} />
          </FormField>
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_DAYS.map((q) => (
            <button
              key={q.days}
              type="button"
              aria-pressed={followUp === addDays(today, q.days)}
              onClick={() => setFollowUp(addDays(today, q.days))}
              className="inline-flex min-h-10 items-center rounded-full border border-slate-200 bg-white px-4 text-sm text-slate-700 transition hover:border-navy-300 aria-pressed:border-navy-800 aria-pressed:bg-navy-800 aria-pressed:text-white"
            >
              {q.label}
            </button>
          ))}
        </div>
        <FormField id="p-notes" label="Notes" hint="Ce qu'il a demandé, son budget, ses dates. Ni numéro de passeport ni donnée bancaire.">
          <Textarea id="p-notes" rows={3} maxLength={2000} value={notes} onChange={(ev) => setNotes(ev.target.value)} {...describedBy("p-notes", undefined, "hint")} />
        </FormField>
      </fieldset>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button asChild variant="outline">
          <Link href="/prospects">Annuler</Link>
        </Button>
        <Button type="submit" variant="accent" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer le prospect"}
        </Button>
      </div>
    </form>
  );
}

/** Le prospect devient client : même fiche, même historique. Confirmation en deux temps. */
export function ConvertProspectButton({ clientId, name }: { clientId: string; name: string }) {
  const [state, setState] = useState<FormState>(initialFormState);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  if (!confirming) {
    return (
      <Button type="button" variant="accent" onClick={() => setConfirming(true)}>
        <UserCheck aria-hidden />
        Transformer en client
      </Button>
    );
  }
  return (
    <div className="w-full space-y-2 rounded-xl border border-navy-200 bg-white p-3 text-sm">
      <p className="text-slate-800">
        {name} devient client de l&apos;agence. La fiche reste la même : rendez-vous, relances et historique sont conservés.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="accent" disabled={pending} onClick={() => startTransition(async () => setState(await convertProspectAction(clientId)))}>
          {pending ? "Transformation…" : "Confirmer"}
        </Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
          Annuler
        </Button>
      </div>
      <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
    </div>
  );
}

/** Planifier une relance : tâche datée confiée au conseiller de la fiche. */
export function FollowUpForm({ clientId, today }: { clientId: string; today: string }) {
  const [state, setState] = useState<FormState>(initialFormState);
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState(addDays(today, 2));
  const [time, setTime] = useState("09:00");
  const [title, setTitle] = useState("");
  const id = clientId.slice(0, 8);
  return (
    <form
      noValidate
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await scheduleFollowUpAction({ clientId, date, time, title });
          setState(result);
          if (result.ok) setTitle("");
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <FormField id={`fu-title-${id}`} label="Objet de la relance" hint="Vide : « Relancer » suivi du nom.">
          <Input id={`fu-title-${id}`} value={title} maxLength={160} onChange={(ev) => setTitle(ev.target.value)} placeholder="Ex. : Envoyer le devis, rappeler après la réunion de famille" {...describedBy(`fu-title-${id}`, undefined, "hint")} />
        </FormField>
        <FormField id={`fu-date-${id}`} label="Date" required error={state.fieldErrors?.date}>
          <Input id={`fu-date-${id}`} type="date" min={today} value={date} onChange={(ev) => setDate(ev.target.value)} />
        </FormField>
        <FormField id={`fu-time-${id}`} label="Heure">
          <Input id={`fu-time-${id}`} type="time" value={time} onChange={(ev) => setTime(ev.target.value)} />
        </FormField>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="outline" disabled={pending}>
          <CalendarClock aria-hidden />
          {pending ? "Planification…" : "Planifier la relance"}
        </Button>
        <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
      </div>
    </form>
  );
}
