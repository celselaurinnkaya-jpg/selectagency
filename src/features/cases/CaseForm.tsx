"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { describedBy, FormField, FormMessage, selectClass } from "@/components/shared/form";
import { initialFormState } from "@/lib/form-state";
import { APPLICANT_TAGS, CATEGORY_LABELS, PRIORITY } from "@/lib/domain/labels";
import type { CaseCategory } from "@/lib/domain/types";
import { createCaseAction } from "./actions";

interface Option {
  value: string;
  label: string;
}

export function CaseForm({
  clients,
  members,
  destinations,
  defaultClientId,
  defaultMemberId,
}: {
  clients: Option[];
  members: Option[];
  destinations: Option[];
  defaultClientId?: string;
  defaultMemberId: string;
}) {
  const [state, action, pending] = useActionState(createCaseAction, initialFormState);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};
  const [category, setCategory] = useState<CaseCategory>((v.category as CaseCategory) ?? "study_abroad");

  const initialDest = v.destinationCountry ?? "";
  const isInitialDestInList = destinations.some((d) => d.value === initialDest);
  const [destSelect, setDestSelect] = useState<string>(() => {
    if (!initialDest) return "";
    return isInitialDestInList ? initialDest : "__OTHER__";
  });
  const [customDest] = useState<string>(() => {
    return !isInitialDestInList && initialDest && initialDest !== "__OTHER__" ? initialDest : "";
  });

  useEffect(() => {
    if (state.ok && state.redirectTo) {
      formRef.current?.reset();
      router.push(state.redirectTo);
    }
  }, [state, router]);

  const checkedTags = new Set((v.applicantTags ?? "").split(",").filter(Boolean));

  return (
    <form ref={formRef} action={action} className="space-y-6" noValidate>
      <FormMessage message={state.ok ? undefined : state.message} />

      <fieldset className="space-y-4 rounded-2xl bg-surface p-4 sm:p-5">
        <legend className="sr-only">Projet</legend>
        <h2 className="text-base font-semibold text-navy-800">1. Client et projet</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="clientId" label="Client" required error={e.clientId} className="sm:col-span-2">
            <select id="clientId" name="clientId" defaultValue={v.clientId ?? defaultClientId ?? ""} className={selectClass} {...describedBy("clientId", e.clientId)}>
              <option value="" disabled>
                Choisir un client
              </option>
              {clients.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="category" label="Type de projet" required error={e.category}>
            {/* Non contrôlé : après une erreur, la réinitialisation de React revient à la valeur envoyée. */}
            <select id="category" name="category" defaultValue={v.category ?? "study_abroad"} onChange={(event) => setCategory(event.target.value as CaseCategory)} className={selectClass}>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField
            id="destinationCountry"
            label="Pays de destination"
            required
            error={e.destinationCountry}
            hint={destSelect === "__OTHER__" ? "Saisissez le pays de destination ci-dessous" : undefined}
          >
            <select
              id="destinationCountry"
              name="destinationCountry"
              value={destSelect}
              onChange={(event) => setDestSelect(event.target.value)}
              className={selectClass}
              {...describedBy("destinationCountry", e.destinationCountry)}
            >
              <option value="" disabled>
                Choisir un pays
              </option>
              {destinations.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
              <option value="__OTHER__">Autre pays (saisir manuellement)...</option>
            </select>
            {destSelect === "__OTHER__" && (
              <Input
                id="customDestinationCountry"
                name="customDestinationCountry"
                placeholder="Précisez le pays de destination (Ex : Australie, Japon...)"
                defaultValue={customDest}
                className="mt-2"
                autoFocus
              />
            )}
          </FormField>
          <FormField id="title" label="Intitulé du dossier" required error={e.title} hint="Exemple : Master 1 Informatique — Université Lyon 1" className="sm:col-span-2">
            <Input id="title" name="title" defaultValue={v.title} {...describedBy("title", e.title, "hint")} />
          </FormField>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-800">
            Profil du demandeur <span className="font-normal text-slate-500">(détermine la liste des pièces)</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {Object.entries(APPLICANT_TAGS).map(([value, label]) => (
              <label key={value} className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-slate-300 bg-white px-3 text-sm has-checked:border-navy-700 has-checked:bg-navy-50">
                <input type="checkbox" name="applicantTags" value={value} defaultChecked={checkedTags.has(value)} className="size-4 accent-navy-800" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      </fieldset>

      {category === "study_abroad" && (
        <fieldset className="space-y-4 rounded-2xl bg-surface p-4 sm:p-5">
          <legend className="sr-only">Études</legend>
          <h2 className="text-base font-semibold text-navy-800">Projet d&apos;études</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField id="institution" label="Établissement visé">
              <Input id="institution" name="institution" defaultValue={v.institution} />
            </FormField>
            <FormField id="program" label="Formation">
              <Input id="program" name="program" defaultValue={v.program} />
            </FormField>
            <FormField id="intake" label="Rentrée visée">
              <Input id="intake" name="intake" placeholder="Ex. : Septembre 2027" defaultValue={v.intake} />
            </FormField>
          </div>
        </fieldset>
      )}

      <fieldset className="space-y-4 rounded-2xl bg-surface p-4 sm:p-5">
        <legend className="sr-only">Suivi</legend>
        <h2 className="text-base font-semibold text-navy-800">2. Suivi</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="assignedTo" label="Conseiller responsable" required error={e.assignedTo}>
            <select id="assignedTo" name="assignedTo" defaultValue={v.assignedTo ?? defaultMemberId} className={selectClass}>
              {members.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="priority" label="Priorité" required>
            <select id="priority" name="priority" defaultValue={v.priority ?? "normal"} className={selectClass}>
              {Object.entries(PRIORITY).map(([value, spec]) => (
                <option key={value} value={value}>
                  {spec.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="nextAction" label="Prochaine action" hint="Par défaut : la deuxième étape du modèle." className="sm:col-span-2">
            <Input id="nextAction" name="nextAction" defaultValue={v.nextAction} {...describedBy("nextAction", undefined, "hint")} />
          </FormField>
          <FormField id="nextActionDueAt" label="Échéance de la prochaine action" error={e.nextActionDueAt}>
            <Input id="nextActionDueAt" name="nextActionDueAt" type="date" defaultValue={v.nextActionDueAt} />
          </FormField>
          <FormField id="plannedDepartureDate" label="Départ envisagé" error={e.plannedDepartureDate}>
            <Input id="plannedDepartureDate" name="plannedDepartureDate" type="date" defaultValue={v.plannedDepartureDate} />
          </FormField>
        </div>
      </fieldset>

      <p className="text-sm text-slate-600">
        À la création, le dossier reçoit une copie du modèle d&apos;étapes et de la liste de pièces correspondant à ce projet.
        Vous pourrez compléter la liste ensuite.
      </p>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button asChild variant="outline">
          <Link href="/cases">Annuler</Link>
        </Button>
        <Button type="submit" variant="accent" disabled={pending}>
          {pending ? "Création…" : "Créer le dossier"}
        </Button>
      </div>
    </form>
  );
}
