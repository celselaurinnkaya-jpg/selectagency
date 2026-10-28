"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { describedBy, FormField, FormMessage, selectClass } from "@/components/shared/form";
import { initialFormState } from "@/lib/form-state";
import { CURRENCY_OPTIONS, TIMEZONE_OPTIONS } from "@/lib/format";
import type { Agency } from "@/lib/domain/types";
import { updateAgencyAction } from "./actions";

export function SettingsForm({ agency }: { agency: Agency }) {
  const [state, action, pending] = useActionState(updateAgencyAction, initialFormState);
  const e = state.fieldErrors ?? {};
  const v = state.ok ? agency : { ...agency, ...state.values };
  return (
    <form action={action} className="space-y-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="name" label="Nom de l'agence" required error={e.name}>
          <Input id="name" name="name" defaultValue={v.name} {...describedBy("name", e.name)} />
        </FormField>
        <FormField id="city" label="Ville" required error={e.city}>
          <Input id="city" name="city" defaultValue={v.city} {...describedBy("city", e.city)} />
        </FormField>
        <FormField id="currency" label="Devise par défaut" required error={e.currency} hint="S'applique aux nouveaux dossiers ; les dossiers existants gardent leur devise.">
          <select id="currency" name="currency" defaultValue={v.currency} className={selectClass} {...describedBy("currency", e.currency, "hint")}>
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="timezone" label="Fuseau horaire" required error={e.timezone}>
          <select id="timezone" name="timezone" defaultValue={v.timezone} className={selectClass}>
            {TIMEZONE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="receiptPrefix" label="Préfixe des reçus" required error={e.receiptPrefix} hint="Exemple : REC donne REC-2026-00091.">
          <Input id="receiptPrefix" name="receiptPrefix" defaultValue={v.receiptPrefix} className="font-mono uppercase" {...describedBy("receiptPrefix", e.receiptPrefix, "hint")} />
        </FormField>
      </div>
      <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
      <Button type="submit" variant="accent" disabled={pending}>
        {pending ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  );
}
