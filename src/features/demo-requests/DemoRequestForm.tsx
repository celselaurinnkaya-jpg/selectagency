"use client";

import { useActionState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { describedBy, FormField, FormMessage, selectClass } from "@/components/shared/form";
import { CountryOptions } from "@/components/shared/CountryOptions";
import { initialFormState } from "@/lib/form-state";
import { requestDemoAction } from "./actions";

// Formulaire public « Demander une démonstration ». La demande arrive dans la console SELECT (Démonstrations).

export function DemoRequestForm({ countries }: { countries: { code: string; name: string; frequent?: boolean }[] }) {
  const [state, action, pending] = useActionState(requestDemoAction, initialFormState);
  const e = state.fieldErrors ?? {};
  const v = state.values ?? {};

  if (state.ok) return <FormMessage message={state.message} tone="success" />;

  return (
    <form action={action} className="relative space-y-4 rounded-2xl bg-white p-4 shadow-[0_1px_3px_rgba(2,55,100,0.1)] ring-1 ring-border sm:p-6" noValidate>
      <h3 className="text-lg font-semibold text-navy-800">Demander une démonstration</h3>
      <FormMessage message={state.message} />
      {/* Piège à robots : invisible et ignoré par les personnes. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="demo-website">Site web</label>
        <input id="demo-website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="demo-name" label="Votre nom" required error={e.fullName}>
          <Input id="demo-name" name="fullName" autoComplete="name" defaultValue={v.fullName} {...describedBy("demo-name", e.fullName)} />
        </FormField>
        <FormField id="demo-agency" label="Nom de l'agence" required error={e.agencyName}>
          <Input id="demo-agency" name="agencyName" autoComplete="organization" defaultValue={v.agencyName} {...describedBy("demo-agency", e.agencyName)} />
        </FormField>
        <FormField id="demo-country" label="Pays" required error={e.countryCode}>
          <select id="demo-country" name="countryCode" defaultValue={v.countryCode ?? ""} className={selectClass} {...describedBy("demo-country", e.countryCode)}>
            <option value="">— Choisir —</option>
            <CountryOptions options={countries.map((c) => ({ value: c.code, label: c.name, frequent: c.frequent }))} />
          </select>
        </FormField>
        <FormField id="demo-phone" label="Téléphone ou WhatsApp" required error={e.phone}>
          <Input id="demo-phone" name="phone" type="tel" autoComplete="tel" placeholder="+221 77 000 00 00" defaultValue={v.phone} {...describedBy("demo-phone", e.phone)} />
        </FormField>
        <FormField id="demo-email" label="E-mail" error={e.email} className="sm:col-span-2">
          <Input id="demo-email" name="email" type="email" autoComplete="email" defaultValue={v.email} {...describedBy("demo-email", e.email)} />
        </FormField>
        <FormField id="demo-message" label="Votre besoin" error={e.message} className="sm:col-span-2">
          <Textarea id="demo-message" name="message" rows={3} maxLength={1000} placeholder="Nombre de conseillers, services proposés (visas, études…), questions." defaultValue={v.message} {...describedBy("demo-message", e.message)} />
        </FormField>
      </div>
      <Button type="submit" variant="accent" size="lg" className="w-full sm:w-auto" disabled={pending}>
        <Send aria-hidden />
        {pending ? "Envoi…" : "Envoyer ma demande"}
      </Button>
      <p className="text-xs text-slate-500">Vos coordonnées servent uniquement à vous recontacter pour la démonstration.</p>
    </form>
  );
}
