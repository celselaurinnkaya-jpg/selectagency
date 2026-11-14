"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, LogIn, LogOut } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { describedBy, FormField, FormMessage, selectClass } from "@/components/shared/form";
import type { AttendanceSettings } from "@/lib/domain/types";
import { initialFormState, type FormState } from "@/lib/form-state";
import { clockInAction, clockOutAction, correctAttendanceAction, declareAttendanceAction, saveAttendanceSettingsAction } from "./actions";
import type { ClockState, MissingDeparture } from "./queries";

// Présences : bouton de pointage et formulaires. Champs contrôlés et envoi par onSubmit : React 19 ne remet pas
// le formulaire à zéro après l'enregistrement.

/** Bouton « Pointer mon arrivée / mon départ ». `onNavy` : dans la bannière bleu marine du tableau de bord. */
export function ClockPanel({ clock, onNavy = false, showMissingLink = false }: { clock: ClockState; onNavy?: boolean; showMissingLink?: boolean }) {
  const [state, setState] = useState<FormState>(initialFormState);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<FormState>) => startTransition(async () => setState(await action()));
  const arriving = clock.status !== "in";

  return (
    <div className={cn("space-y-2", onNavy ? "text-white" : "text-slate-900")}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{clock.headline}</p>
          {(clock.detail || clock.late) && (
            <p className={cn("text-sm", onNavy ? "text-navy-100" : "text-slate-600")}>
              {[clock.detail, clock.late].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        {clock.writable && (
          <Button
            type="button"
            variant={arriving ? "accent" : onNavy ? "onNavy" : "outline"}
            disabled={pending}
            onClick={() => run(arriving ? clockInAction : clockOutAction)}
            className={cn("min-h-11", !arriving && onNavy && "border border-white/40")}
          >
            {arriving ? <LogIn aria-hidden /> : <LogOut aria-hidden />}
            {pending ? "Enregistrement…" : clock.status === "out" ? "Pointer mon arrivée" : clock.status === "back" ? "Pointer un retour" : "Pointer mon départ"}
          </Button>
        )}
      </div>
      {state.message && (
        <p role={state.ok ? "status" : "alert"} className={cn("text-sm", state.ok ? (onNavy ? "text-citron-400" : "text-emerald-800") : onNavy ? "text-red-200" : "text-red-700")}>
          {state.message}
        </p>
      )}
      {showMissingLink && clock.missing.length > 0 && (
        <Link
          href="/tasks/presences#oublis"
          className={cn(
            "inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium",
            onNavy ? "bg-orange-50 text-orange-900" : "border border-orange-200 bg-orange-50 text-orange-800",
          )}
        >
          <AlertTriangle className="size-4" aria-hidden />
          {clock.missing.length === 1 ? `Départ non pointé ${clock.missing[0]!.label}` : `${clock.missing.length} départs non pointés`} : déclarez-le
        </Link>
      )}
    </div>
  );
}

/** Déclarer le départ oublié d'une présence. */
export function MissingDepartureForm({ missing }: { missing: MissingDeparture }) {
  const [state, setState] = useState<FormState>(initialFormState);
  const [pending, startTransition] = useTransition();
  const [time, setTime] = useState("");
  const [reason, setReason] = useState("");
  const id = `depart-${missing.id}`;
  const e = state.fieldErrors ?? {};

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => setState(await declareAttendanceAction({ entryId: missing.id, date: missing.day, departureTime: time, reason })));
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-orange-200 bg-orange-50 p-4" noValidate>
      <p className="text-sm font-semibold text-orange-900">
        Départ non pointé le {missing.label} (arrivée à {missing.arrival})
      </p>
      <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <FormField id={`${id}-heure`} label="Heure de départ" required error={e.departureTime}>
          <Input id={`${id}-heure`} type="time" value={time} onChange={(ev) => setTime(ev.target.value)} className="bg-white" {...describedBy(`${id}-heure`, e.departureTime)} />
        </FormField>
        <FormField id={`${id}-raison`} label="Raison de l'oubli" required error={e.reason}>
          <Input id={`${id}-raison`} maxLength={300} value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder="Ex. : téléphone déchargé" className="bg-white" {...describedBy(`${id}-raison`, e.reason)} />
        </FormField>
      </div>
      <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
      <Button type="submit" variant="outline" disabled={pending} className="bg-white">
        {pending ? "Enregistrement…" : "Déclarer l'heure de départ"}
      </Button>
    </form>
  );
}

/** Déclarer une arrivée oubliée (et son départ, s'il est connu), dans les 7 derniers jours. */
export function DeclareArrivalForm({ today, minDay }: { today: string; minDay: string }) {
  const [state, setState] = useState<FormState>(initialFormState);
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState(today);
  const [arrival, setArrival] = useState("");
  const [departure, setDeparture] = useState("");
  const [reason, setReason] = useState("");
  const e = state.fieldErrors ?? {};

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await declareAttendanceAction({ date, arrivalTime: arrival, departureTime: departure, reason });
      setState(result);
      if (result.ok) {
        setArrival("");
        setDeparture("");
        setReason("");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField id="oubli-jour" label="Jour" required error={e.date}>
          <Input id="oubli-jour" type="date" min={minDay} max={today} value={date} onChange={(ev) => setDate(ev.target.value)} {...describedBy("oubli-jour", e.date)} />
        </FormField>
        <FormField id="oubli-arrivee" label="Heure d'arrivée" required error={e.arrivalTime}>
          <Input id="oubli-arrivee" type="time" value={arrival} onChange={(ev) => setArrival(ev.target.value)} {...describedBy("oubli-arrivee", e.arrivalTime)} />
        </FormField>
        <FormField id="oubli-depart" label="Heure de départ" error={e.departureTime} hint={date === today ? "Vide si vous êtes encore là." : "Obligatoire pour un jour passé."}>
          <Input id="oubli-depart" type="time" value={departure} onChange={(ev) => setDeparture(ev.target.value)} {...describedBy("oubli-depart", e.departureTime, "hint")} />
        </FormField>
      </div>
      <FormField id="oubli-raison" label="Raison de l'oubli" required error={e.reason}>
        <Input id="oubli-raison" maxLength={300} value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder="Ex. : arrivé avant l'ouverture, pas de connexion" {...describedBy("oubli-raison", e.reason)} />
      </FormField>
      <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Enregistrement…" : "Déclarer la présence"}
      </Button>
    </form>
  );
}

/** Responsable : corriger une présence, ou en ajouter une pour un membre. */
export function CorrectAttendanceForm({
  entry,
  members,
  today,
  onDone,
}: {
  entry?: { id: string; day: string; arrival: string; departure?: string };
  members: { id: string; name: string }[];
  today: string;
  onDone?: () => void;
}) {
  const [state, setState] = useState<FormState>(initialFormState);
  const [pending, startTransition] = useTransition();
  const [memberId, setMemberId] = useState(members[0]?.id ?? "");
  const [date, setDate] = useState(entry?.day ?? today);
  const [arrival, setArrival] = useState(entry?.arrival ?? "");
  const [departure, setDeparture] = useState(entry?.departure ?? "");
  const [reason, setReason] = useState("");
  const prefix = entry ? `corriger-${entry.id}` : "ajouter-presence";
  const e = state.fieldErrors ?? {};

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await correctAttendanceAction({ entryId: entry?.id ?? "", memberId: entry ? "" : memberId, date, arrivalTime: arrival, departureTime: departure, reason });
      setState(result);
      if (result.ok) {
        setReason("");
        if (!entry) {
          setArrival("");
          setDeparture("");
        }
        onDone?.();
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className={cn("grid gap-4", entry ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4")}>
        {!entry && (
          <FormField id={`${prefix}-membre`} label="Membre" required error={e.memberId}>
            <select id={`${prefix}-membre`} className={selectClass} value={memberId} onChange={(ev) => setMemberId(ev.target.value)}>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </FormField>
        )}
        <FormField id={`${prefix}-jour`} label="Jour" required error={e.date}>
          <Input id={`${prefix}-jour`} type="date" max={today} value={date} onChange={(ev) => setDate(ev.target.value)} {...describedBy(`${prefix}-jour`, e.date)} />
        </FormField>
        <FormField id={`${prefix}-arrivee`} label="Arrivée" required error={e.arrivalTime}>
          <Input id={`${prefix}-arrivee`} type="time" value={arrival} onChange={(ev) => setArrival(ev.target.value)} {...describedBy(`${prefix}-arrivee`, e.arrivalTime)} />
        </FormField>
        <FormField id={`${prefix}-depart`} label="Départ" error={e.departureTime} hint="Vide si inconnu.">
          <Input id={`${prefix}-depart`} type="time" value={departure} onChange={(ev) => setDeparture(ev.target.value)} {...describedBy(`${prefix}-depart`, e.departureTime, "hint")} />
        </FormField>
      </div>
      <FormField id={`${prefix}-raison`} label="Raison" required error={e.reason} hint="Visible avec la présence (ex. : badge oublié, vérifié avec la caméra de l'agence).">
        <Input id={`${prefix}-raison`} maxLength={300} value={reason} onChange={(ev) => setReason(ev.target.value)} {...describedBy(`${prefix}-raison`, e.reason, "hint")} />
      </FormField>
      <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant={entry ? "default" : "accent"} disabled={pending}>
          {pending ? "Enregistrement…" : entry ? "Enregistrer la correction" : "Ajouter la présence"}
        </Button>
        {onDone && (
          <Button type="button" variant="ghost" disabled={pending} onClick={onDone}>
            Annuler
          </Button>
        )}
      </div>
    </form>
  );
}

/** Bouton « Corriger » d'une ligne de présence, qui ouvre le formulaire sur place. */
export function CorrectEntryButton({ entry, today }: { entry: { id: string; day: string; arrival: string; departure?: string }; today: string }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Corriger
      </Button>
    );
  }
  return (
    <div className="w-full rounded-xl border border-navy-200 bg-surface p-3">
      <CorrectAttendanceForm entry={entry} members={[]} today={today} onDone={() => setOpen(false)} />
    </div>
  );
}

const WEEKDAYS = [
  { value: 1, label: "Lun." },
  { value: 2, label: "Mar." },
  { value: 3, label: "Mer." },
  { value: 4, label: "Jeu." },
  { value: 5, label: "Ven." },
  { value: 6, label: "Sam." },
  { value: 7, label: "Dim." },
];

/** Horaires de l'agence (responsables). */
export function AttendanceSettingsForm({ settings }: { settings: AttendanceSettings }) {
  const [state, setState] = useState<FormState>(initialFormState);
  const [pending, startTransition] = useTransition();
  const [start, setStart] = useState(settings.expectedStart);
  const [end, setEnd] = useState(settings.expectedEnd);
  const [days, setDays] = useState<number[]>(settings.workDays);
  const [grace, setGrace] = useState(String(settings.graceMinutes));
  const e = state.fieldErrors ?? {};

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () =>
      setState(await saveAttendanceSettingsAction({ expectedStart: start, expectedEnd: end, workDays: days, graceMinutes: Number(grace) })),
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField id="horaire-arrivee" label="Arrivée attendue" required error={e.expectedStart}>
          <Input id="horaire-arrivee" type="time" value={start} onChange={(ev) => setStart(ev.target.value)} />
        </FormField>
        <FormField id="horaire-depart" label="Départ attendu" required error={e.expectedEnd}>
          <Input id="horaire-depart" type="time" value={end} onChange={(ev) => setEnd(ev.target.value)} />
        </FormField>
        <FormField id="horaire-tolerance" label="Tolérance (minutes)" required error={e.graceMinutes} hint="Au-delà, l'arrivée compte comme un retard.">
          <Input id="horaire-tolerance" type="number" min={0} max={120} inputMode="numeric" value={grace} onChange={(ev) => setGrace(ev.target.value)} {...describedBy("horaire-tolerance", e.graceMinutes, "hint")} />
        </FormField>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-800">Jours travaillés</legend>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((d) => {
            const checked = days.includes(d.value);
            return (
              <label
                key={d.value}
                className={cn(
                  "inline-flex min-h-10 min-w-14 cursor-pointer items-center justify-center rounded-lg border px-3 text-sm font-medium transition",
                  checked ? "border-navy-800 bg-navy-800 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-navy-200",
                )}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  onChange={() => setDays((prev) => (checked ? prev.filter((x) => x !== d.value) : [...prev, d.value].sort()))}
                />
                {d.label}
              </label>
            );
          })}
        </div>
        {e.workDays?.length ? <p className="text-sm text-red-700">{e.workDays[0]}</p> : null}
      </fieldset>
      <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
      <Button type="submit" disabled={pending}>
        {pending ? "Enregistrement…" : "Enregistrer les horaires"}
      </Button>
    </form>
  );
}
