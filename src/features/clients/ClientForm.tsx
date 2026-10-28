"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { describedBy, FormField, FormMessage, selectClass } from "@/components/shared/form";
import { initialFormState } from "@/lib/form-state";
import {
  CLIENT_TYPE,
  LANGUAGES,
  GENDER_OPTIONS,
  MARITAL_STATUS,
  ID_DOC_TYPES,
  SERVICE_MOTIVES,
} from "@/lib/domain/labels";
import type { Client } from "@/lib/domain/types";
import { saveClientAction } from "./actions";

interface Option {
  value: string;
  label: string;
}

export function ClientForm({
  countries,
  members,
  defaultCountry,
  defaultMemberId,
  client,
}: {
  countries: Option[];
  members: Option[];
  defaultCountry: string;
  defaultMemberId: string;
  client?: Client;
}) {
  const [state, action, pending] = useActionState(saveClientAction, initialFormState);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};

  const [isSelfResponsible, setIsSelfResponsible] = useState<boolean>(() => {
    if (v.isSelfResponsible !== undefined) {
      return v.isSelfResponsible === "1" || v.isSelfResponsible === "true";
    }
    return client?.isSelfResponsible ?? true;
  });

  // Nationalité avec option "Autre"
  const initialNat = v.nationality ?? client?.nationality ?? "";
  const isInitialNatInList = countries.some((c) => c.label === initialNat || c.value === initialNat);
  const [natSelect, setNatSelect] = useState<string>(() => {
    if (!initialNat) return countries[0]?.label ?? defaultCountry;
    return isInitialNatInList ? initialNat : "__OTHER__";
  });
  const [customNat] = useState<string>(() => {
    return !isInitialNatInList && initialNat && initialNat !== "__OTHER__" ? initialNat : "";
  });

  // Pays de résidence avec option "Autre"
  const initialResidence = v.residenceCountry ?? client?.residenceCountry ?? defaultCountry;
  const isInitialResidenceInList = countries.some((c) => c.value === initialResidence);
  const [residenceSelect, setResidenceSelect] = useState<string>(() => {
    return isInitialResidenceInList ? initialResidence : "__OTHER__";
  });
  const [customResidence] = useState<string>(() => {
    return !isInitialResidenceInList && initialResidence && initialResidence !== "__OTHER__" ? initialResidence : "";
  });

  useEffect(() => {
    if (state.ok && state.redirectTo) {
      router.push(state.redirectTo);
    }
  }, [state.ok, state.redirectTo, router]);

  return (
    <form ref={formRef} action={action} className="space-y-6" noValidate>
      <input type="hidden" name="clientId" defaultValue={client?.id ?? ""} />
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
          <Button type="submit" name="confirmDuplicate" value="1" variant="outline" disabled={pending}>
            Ce n&apos;est pas la même personne : créer la fiche
          </Button>
        </div>
      ) : (
        <FormMessage message={state.ok ? undefined : state.message} />
      )}

      {/* 1. IDENTITÉ */}
      <fieldset className="space-y-4 rounded-2xl bg-surface p-4 sm:p-5">
        <legend className="sr-only">Identité</legend>
        <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
          <div className="h-4 w-1 rounded-full bg-navy-800" />
          <h2 className="text-base font-semibold text-navy-800">Identité</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="clientType" label="Type de client" required error={e.clientType}>
            <select id="clientType" name="clientType" defaultValue={v.clientType ?? client?.clientType ?? "individual"} className={selectClass}>
              {Object.entries(CLIENT_TYPE).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </FormField>

          <FormField id="serviceMotive" label="Motif de service" error={e.serviceMotive}>
            <select id="serviceMotive" name="serviceMotive" defaultValue={v.serviceMotive ?? client?.serviceMotive ?? "study_abroad"} className={selectClass}>
              {Object.entries(SERVICE_MOTIVES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </FormField>

          <FormField id="firstName" label="Prénom" required error={e.firstName}>
            <Input id="firstName" name="firstName" autoComplete="off" defaultValue={v.firstName ?? client?.firstName} {...describedBy("firstName", e.firstName)} />
          </FormField>

          <FormField id="lastName" label="Nom" required error={e.lastName}>
            <Input id="lastName" name="lastName" autoComplete="off" defaultValue={v.lastName ?? client?.lastName} {...describedBy("lastName", e.lastName)} />
          </FormField>

          <FormField id="gender" label="Sexe" error={e.gender}>
            <select id="gender" name="gender" defaultValue={v.gender ?? client?.gender ?? "M"} className={selectClass}>
              {Object.entries(GENDER_OPTIONS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </FormField>

          <FormField id="birthDate" label="Date de naissance" error={e.birthDate}>
            <Input id="birthDate" name="birthDate" type="date" defaultValue={v.birthDate ?? client?.birthDate} {...describedBy("birthDate", e.birthDate)} />
          </FormField>

          <FormField
            id="nationality"
            label="Nationalité"
            error={e.nationality}
            hint={natSelect === "__OTHER__" ? "Saisissez votre nationalité ci-dessous" : undefined}
          >
            <select
              id="nationality"
              name="nationality"
              value={natSelect}
              onChange={(e) => setNatSelect(e.target.value)}
              className={selectClass}
            >
              {countries.map((c) => (
                <option key={c.value} value={c.label}>
                  {c.label}
                </option>
              ))}
              <option value="__OTHER__">Autre nationalité (saisir manuellement)...</option>
            </select>
            {natSelect === "__OTHER__" && (
              <Input
                id="customNationality"
                name="customNationality"
                placeholder="Précisez votre nationalité..."
                defaultValue={customNat}
                className="mt-2"
                autoFocus
              />
            )}
          </FormField>

          <FormField id="maritalStatus" label="Statut / État civil" error={e.maritalStatus}>
            <select id="maritalStatus" name="maritalStatus" defaultValue={v.maritalStatus ?? client?.maritalStatus ?? "single"} className={selectClass}>
              {Object.entries(MARITAL_STATUS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </FormField>

          <FormField id="idDocType" label="Type de pièce d'identité" error={e.idDocType}>
            <select id="idDocType" name="idDocType" defaultValue={v.idDocType ?? client?.idDocType ?? "passport"} className={selectClass}>
              {Object.entries(ID_DOC_TYPES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </FormField>

          <FormField id="idDocNumber" label="Numéro de la pièce (passeport ou autre)" error={e.idDocNumber}>
            <Input
              id="idDocNumber"
              name="idDocNumber"
              placeholder="Ex : 24AA12345"
              autoComplete="off"
              defaultValue={v.idDocNumber ?? client?.idDocNumber}
              {...describedBy("idDocNumber", e.idDocNumber)}
            />
          </FormField>
        </div>
      </fieldset>

      {/* 2. COORDONNÉES */}
      <fieldset className="space-y-4 rounded-2xl bg-surface p-4 sm:p-5">
        <legend className="sr-only">Coordonnées</legend>
        <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
          <div className="h-4 w-1 rounded-full bg-navy-800" />
          <h2 className="text-base font-semibold text-navy-800">Coordonnées</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="residenceCountry"
            label="Pays de résidence"
            required
            error={e.residenceCountry}
            hint={residenceSelect === "__OTHER__" ? "Saisissez le pays de résidence ci-dessous" : undefined}
          >
            <select
              id="residenceCountry"
              name="residenceCountry"
              value={residenceSelect}
              onChange={(e) => setResidenceSelect(e.target.value)}
              className={selectClass}
            >
              {countries.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
              <option value="__OTHER__">Autre pays (saisir manuellement)...</option>
            </select>
            {residenceSelect === "__OTHER__" && (
              <Input
                id="customResidenceCountry"
                name="customResidenceCountry"
                placeholder="Précisez le pays de résidence (Ex : Japon, Canada...)"
                defaultValue={customResidence}
                className="mt-2"
                autoFocus
              />
            )}
          </FormField>

          <FormField id="city" label="Ville" required error={e.city}>
            <Input id="city" name="city" defaultValue={v.city ?? client?.city} {...describedBy("city", e.city)} />
          </FormField>

          <FormField id="address" label="Adresse complète" error={e.address} className="sm:col-span-2">
            <Input
              id="address"
              name="address"
              placeholder="Ex : Quartier Bastos, Rue 1.450"
              defaultValue={v.address ?? client?.address}
              {...describedBy("address", e.address)}
            />
          </FormField>

          <FormField id="phone" label="Téléphone" required error={e.phone} hint="L'indicatif du pays est automatiquement associé au pays de résidence.">
            <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="off" defaultValue={v.phone ?? client?.phoneE164} {...describedBy("phone", e.phone, "hint")} />
          </FormField>

          <FormField id="whatsapp" label="Numéro WhatsApp" error={e.whatsapp} hint="Facultatif : laisser vide s'il s'agit du même numéro.">
            <Input id="whatsapp" name="whatsapp" type="tel" inputMode="tel" autoComplete="off" defaultValue={v.whatsapp ?? client?.whatsappE164} {...describedBy("whatsapp", e.whatsapp, "hint")} />
          </FormField>

          <FormField id="email" label="Adresse e-mail" error={e.email} className="sm:col-span-2">
            <Input id="email" name="email" type="email" inputMode="email" autoComplete="off" defaultValue={v.email ?? client?.email} {...describedBy("email", e.email)} />
          </FormField>

          <FormField id="preferredLanguage" label="Langue de communication" required error={e.preferredLanguage} className="sm:col-span-2">
            <select id="preferredLanguage" name="preferredLanguage" defaultValue={v.preferredLanguage ?? client?.preferredLanguage ?? "fr"} className={selectClass}>
              {Object.entries(LANGUAGES).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        {/* Section Responsables / Tuteurs */}
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(2,55,100,0.05)]">
          <label className="flex cursor-pointer items-start gap-3 select-none">
            <input
              type="checkbox"
              name="isSelfResponsible"
              value="1"
              checked={isSelfResponsible}
              onChange={(evt) => setIsSelfResponsible(evt.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-navy-800 focus:ring-navy-600"
            />
            <div className="space-y-0.5">
              <span className="text-sm font-semibold text-navy-900">
                Le client est lui-même son propre responsable (majeur / autonome)
              </span>
              <p className="text-xs text-slate-500">
                Coché par défaut. Si décoché, vous pouvez renseigner un Responsable 1 et un Responsable 2 (parents, tuteurs ou garants).
              </p>
            </div>
          </label>

          {!isSelfResponsible && (
            <div className="mt-5 space-y-5 border-t border-slate-100 pt-5">
              {/* Responsable 1 */}
              <div className="rounded-lg border border-slate-200 bg-surface/80 p-3.5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-navy-800">Responsable 1</span>
                  <span className="text-xs text-slate-500">Contact principal (parent / tuteur)</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <FormField id="guardian1Name" label="Nom et prénom" error={e.guardian1Name}>
                    <Input id="guardian1Name" name="guardian1Name" placeholder="Ex : M. Jean Dupont" defaultValue={v.guardian1Name ?? client?.guardian1?.name} />
                  </FormField>
                  <FormField id="guardian1Phone" label="Téléphone" error={e.guardian1Phone}>
                    <Input id="guardian1Phone" name="guardian1Phone" type="tel" inputMode="tel" placeholder="Ex : +237 6..." defaultValue={v.guardian1Phone ?? client?.guardian1?.phone} />
                  </FormField>
                  <FormField id="guardian1Whatsapp" label="WhatsApp" error={e.guardian1Whatsapp}>
                    <Input id="guardian1Whatsapp" name="guardian1Whatsapp" type="tel" inputMode="tel" placeholder="Ex : +237 6..." defaultValue={v.guardian1Whatsapp ?? client?.guardian1?.whatsapp} />
                  </FormField>
                </div>
              </div>

              {/* Responsable 2 */}
              <div className="rounded-lg border border-slate-200 bg-surface/80 p-3.5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-navy-800">Responsable 2</span>
                  <span className="text-xs text-slate-500">Second contact / Garant / Urgence</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <FormField id="guardian2Name" label="Nom et prénom" error={e.guardian2Name}>
                    <Input id="guardian2Name" name="guardian2Name" placeholder="Ex : Mme Marie Dupont" defaultValue={v.guardian2Name ?? client?.guardian2?.name} />
                  </FormField>
                  <FormField id="guardian2Phone" label="Téléphone" error={e.guardian2Phone}>
                    <Input id="guardian2Phone" name="guardian2Phone" type="tel" inputMode="tel" placeholder="Ex : +237 6..." defaultValue={v.guardian2Phone ?? client?.guardian2?.phone} />
                  </FormField>
                  <FormField id="guardian2Whatsapp" label="WhatsApp" error={e.guardian2Whatsapp}>
                    <Input id="guardian2Whatsapp" name="guardian2Whatsapp" type="tel" inputMode="tel" placeholder="Ex : +237 6..." defaultValue={v.guardian2Whatsapp ?? client?.guardian2?.whatsapp} />
                  </FormField>
                </div>
              </div>
            </div>
          )}
        </div>
      </fieldset>

      {/* 3. SUIVI PAR L'AGENCE (Strictement préservé) */}
      <fieldset className="space-y-4 rounded-2xl bg-surface p-4 sm:p-5">
        <legend className="sr-only">Suivi</legend>
        <h2 className="text-base font-semibold text-navy-800">Suivi par l&apos;agence</h2>
        <FormField id="assignedTo" label="Conseiller principal" required error={e.assignedTo}>
          <select id="assignedTo" name="assignedTo" defaultValue={v.assignedTo ?? client?.assignedTo ?? defaultMemberId} className={selectClass}>
            {members.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="notes" label="Notes internes" hint="Contexte du projet, premier contact. N'y inscrivez ni numéro de passeport ni donnée bancaire.">
          <Textarea id="notes" name="notes" rows={3} defaultValue={v.notes ?? client?.notes} {...describedBy("notes", undefined, "hint")} />
        </FormField>
      </fieldset>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button asChild variant="outline">
          <Link href={client ? `/clients/${client.id}` : "/clients"}>Annuler</Link>
        </Button>
        <Button type="submit" variant="accent" disabled={pending}>
          {pending
            ? client
              ? "Modification en cours…"
              : "Enregistrement…"
            : client
              ? "Mettre à jour le client"
              : "Enregistrer le client"}
        </Button>
      </div>
    </form>
  );
}
