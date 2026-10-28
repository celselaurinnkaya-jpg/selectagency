"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { describedBy, FormField, FormMessage, selectClass } from "@/components/shared/form";
import { initialFormState } from "@/lib/form-state";
import { CURRENCY_OPTIONS, TIMEZONE_OPTIONS } from "@/lib/format";
import { acceptInvitationAction, createAgencyAction, createDemoAgencyAction } from "./actions";

export function CreateAgencyForm({ countries, defaultFullName }: { countries: { code: string; name: string }[]; defaultFullName: string }) {
  const [state, action, pending] = useActionState(createAgencyAction, initialFormState);
  const e = state.fieldErrors ?? {};
  const v = state.values ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage message={state.message} />
      <FormField id="name" label="Nom de l'agence" required error={e.name}>
        <Input id="name" name="name" defaultValue={v.name} placeholder="Ex. : Horizon Voyages & Études" {...describedBy("name", e.name)} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="countryCode" label="Pays" required error={e.countryCode}>
          <select id="countryCode" name="countryCode" defaultValue={v.countryCode ?? "CM"} className={selectClass}>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="city" label="Ville" required error={e.city}>
          <Input id="city" name="city" defaultValue={v.city} placeholder="Ex. : Douala" {...describedBy("city", e.city)} />
        </FormField>
        <FormField id="currency" label="Devise de facturation" required error={e.currency}>
          <select id="currency" name="currency" defaultValue={v.currency ?? "XAF"} className={selectClass}>
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="timezone" label="Fuseau horaire" required error={e.timezone}>
          <select id="timezone" name="timezone" defaultValue={v.timezone ?? "Africa/Douala"} className={selectClass}>
            {TIMEZONE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="fullName" label="Votre nom" required error={e.fullName}>
          <Input id="fullName" name="fullName" defaultValue={v.fullName ?? defaultFullName} autoComplete="name" {...describedBy("fullName", e.fullName)} />
        </FormField>
        <FormField id="jobTitle" label="Votre fonction">
          <Input id="jobTitle" name="jobTitle" defaultValue={v.jobTitle} placeholder="Ex. : Directrice d'agence" />
        </FormField>
      </div>
      <p className="text-sm text-slate-600">Vous serez propriétaire de l&apos;agence. Vous pourrez inviter votre équipe ensuite.</p>
      <Button type="submit" variant="accent" size="lg" className="w-full" disabled={pending}>
        {pending ? "Création…" : "Créer mon agence"}
      </Button>
    </form>
  );
}

export function DemoAgencyButton() {
  const [state, action, pending] = useActionState(createDemoAgencyAction, initialFormState);
  return (
    <form action={action} className="space-y-2">
      <FormMessage message={state.message} />
      <Button type="submit" variant="outline" className="w-full" disabled={pending}>
        {pending ? "Préparation de la démonstration…" : "Essayer avec une agence de démonstration"}
      </Button>
    </form>
  );
}

export function AcceptInvitationForm({ token, label = "Rejoindre l'agence" }: { token: string; label?: string }) {
  const [state, action, pending] = useActionState(acceptInvitationAction, initialFormState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="token" value={token} />
      <FormMessage message={state.message} />
      <Button type="submit" variant="accent" disabled={pending}>
        {pending ? "Un instant…" : label}
      </Button>
    </form>
  );
}
