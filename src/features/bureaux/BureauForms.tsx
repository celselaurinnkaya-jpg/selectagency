"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { describedBy, FormField, FormMessage } from "@/components/shared/form";
import { initialFormState, type FormState } from "@/lib/form-state";
import type { Bureau } from "@/lib/domain/types";
import { saveBureauAction, setBureauArchivedAction, setBureauRestrictionAction, setMemberBureauxAction } from "./actions";
import { textOn } from "./display";

// Formulaires de la page Paramètres → Bureaux.

const SWATCHES = ["#023764", "#0F766E", "#B45309", "#7C3AED", "#BE123C", "#1D4ED8", "#15803D", "#475569"];

export function BureauForm({ bureau }: { bureau?: Bureau }) {
  const [state, action, pending] = useActionState(saveBureauAction, initialFormState);
  const [color, setColor] = useState(bureau?.color ?? SWATCHES[0]!);
  const [code, setCode] = useState(bureau?.code ?? "");
  const e = state.fieldErrors ?? {};
  const v = state.ok ? {} : (state.values ?? {});
  const key = bureau?.id ?? "nouveau";
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="bureauId" value={bureau?.id ?? ""} />
      <input type="hidden" name="color" value={color} />
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField id={`b-name-${key}`} label="Nom du bureau" required error={e.name} className="sm:col-span-2">
          <Input id={`b-name-${key}`} name="name" required minLength={2} maxLength={80} defaultValue={v.name ?? bureau?.name} placeholder="Ex. : Douala – Akwa" {...describedBy(`b-name-${key}`, e.name)} />
        </FormField>
        <FormField id={`b-code-${key}`} label="Code (badge)" required error={e.code} hint="2 à 5 lettres, ex. DLA">
          <Input
            id={`b-code-${key}`}
            name="code"
            required
            maxLength={5}
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            className="font-mono uppercase"
            {...describedBy(`b-code-${key}`, e.code, "hint")}
          />
        </FormField>
        <FormField id={`b-city-${key}`} label="Ville" error={e.city}>
          <Input id={`b-city-${key}`} name="city" maxLength={80} defaultValue={v.city ?? bureau?.city} />
        </FormField>
        <FormField id={`b-phone-${key}`} label="Téléphone" error={e.phone}>
          <Input id={`b-phone-${key}`} name="phone" type="tel" maxLength={40} defaultValue={v.phone ?? bureau?.phone} />
        </FormField>
        <FormField id={`b-email-${key}`} label="E-mail" error={e.email}>
          <Input id={`b-email-${key}`} name="email" type="email" maxLength={254} defaultValue={v.email ?? bureau?.email} />
        </FormField>
        <FormField id={`b-address-${key}`} label="Adresse (reçus et factures)" error={e.address} className="sm:col-span-3">
          <Input id={`b-address-${key}`} name="address" maxLength={200} defaultValue={v.address ?? bureau?.address} />
        </FormField>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-slate-800">Couleur du badge</legend>
        <div className="flex flex-wrap items-center gap-2">
          {SWATCHES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setColor(s)}
              aria-label={`Couleur ${s}`}
              aria-pressed={color === s}
              className={`size-9 rounded-full border-2 ${color === s ? "border-slate-900" : "border-transparent"}`}
              style={{ background: s }}
            />
          ))}
          <span className="ml-2 rounded px-2 py-0.5 font-mono text-sm font-semibold" style={{ background: color, color: textOn(color) }}>
            {code || "CODE"}
          </span>
        </div>
      </fieldset>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
        <Button type="submit" variant={bureau ? "outline" : "accent"} disabled={pending} className="sm:ml-auto">
          {pending ? "Enregistrement…" : bureau ? "Enregistrer le bureau" : "Créer le bureau"}
        </Button>
      </div>
    </form>
  );
}

export function ArchiveBureauButton({ bureauId, archived }: { bureauId: string; archived: boolean }) {
  const [state, setState] = useState<FormState>(initialFormState);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-1">
      <Button
        type="button"
        size="sm"
        variant={archived ? "outline" : "ghost"}
        disabled={pending}
        className={archived ? "" : "text-red-700"}
        onClick={() => {
          if (!archived && !confirm("Fermer ce bureau ? Il ne sera plus proposé ; ses clients et ses paiements gardent leur bureau.")) return;
          start(async () => setState(await setBureauArchivedAction(bureauId, !archived)));
        }}
      >
        {pending ? "…" : archived ? "Rouvrir le bureau" : "Fermer le bureau"}
      </Button>
      <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
    </div>
  );
}

/** Bureaux d'un membre : cases à cocher, enregistrées d'un clic. */
export function MemberBureauxForm({ memberId, bureaux, initial }: { memberId: string; bureaux: Bureau[]; initial: string[] }) {
  const [chosen, setChosen] = useState<string[]>(initial);
  const [state, setState] = useState<FormState>(initialFormState);
  const [pending, start] = useTransition();
  const changed = chosen.slice().sort().join() !== initial.slice().sort().join();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {bureaux.map((b) => (
          <label key={b.id} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm">
            <input
              type="checkbox"
              checked={chosen.includes(b.id)}
              onChange={(event) => setChosen((ids) => (event.target.checked ? [...ids, b.id] : ids.filter((id) => id !== b.id)))}
              className="size-4 accent-navy-800"
            />
            <span className="rounded px-1.5 font-mono text-xs font-semibold" style={{ background: b.color, color: textOn(b.color) }}>
              {b.code}
            </span>
            {b.name}
          </label>
        ))}
        {changed && (
          <Button type="button" size="sm" variant="outline" disabled={pending} className="h-10" onClick={() => start(async () => setState(await setMemberBureauxAction(memberId, chosen)))}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        )}
      </div>
      <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
    </div>
  );
}

export function BureauRestrictionToggle({ on }: { on: boolean }) {
  const [state, setState] = useState<FormState>(initialFormState);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant={on ? "outline" : "accent"}
        disabled={pending}
        onClick={() => {
          const next = !on;
          if (
            next &&
            !confirm(
              "Activer la visibilité par bureau ? Les conseillers, comptables et lectures seules ne verront plus que les clients de leurs bureaux (et ceux sans bureau). Vous et les administrateurs voyez tout.",
            )
          )
            return;
          start(async () => setState(await setBureauRestrictionAction(next)));
        }}
      >
        {pending ? "Enregistrement…" : on ? "Désactiver : tout le monde voit tous les clients" : "Activer la visibilité par bureau"}
      </Button>
      <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
    </div>
  );
}
