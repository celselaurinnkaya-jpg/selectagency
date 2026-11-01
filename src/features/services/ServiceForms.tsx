"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Pencil, Plus, Sparkles, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { describedBy, FormField, FormMessage, selectClass } from "@/components/shared/form";
import { SERVICE_CLIENT_STATUS } from "@/lib/domain/labels";
import type { AgencyService, ServiceClientStatus } from "@/lib/domain/types";
import { CURRENCY_OPTIONS, minorUnits } from "@/lib/format";
import { initialFormState, type FormState } from "@/lib/form-state";
import { addServiceClientAction, deleteServiceAction, removeServiceClientAction, saveServiceAction, updateServiceClientAction } from "./actions";
import { SERVICE_SUGGESTIONS } from "./suggestions";

// Formulaires des services. Champs contrôlés envoyés par onSubmit (React 19 vide un formulaire
// « action » après chaque réponse, même refusée : rien ne doit se perdre).

const STATUS_OPTIONS = Object.entries(SERVICE_CLIENT_STATUS) as [ServiceClientStatus, { label: string }][];

const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

/** Montant en unités mineures → saisie (« 150000 », « 12,50 »). */
const amountInput = (minor: number, currency: string) => {
  const digits = minorUnits(currency);
  return digits === 0 ? String(minor) : (minor / 10 ** digits).toFixed(digits).replace(".", ",");
};

export interface ServiceFormProps {
  service?: AgencyService;
  defaultCurrency: string;
  /** Noms déjà utilisés dans l'agence : ces suggestions ne sont plus proposées. */
  existingNames?: string[];
  initialName?: string;
}

/** Chaque « Nouveau service » ouvre un formulaire vierge, même si Next a gardé la page en mémoire. */
export function ServiceForm(props: ServiceFormProps) {
  const { bfcacheId } = useRouter();
  return <ServiceFormFields key={bfcacheId} {...props} />;
}

function ServiceFormFields({ service, defaultCurrency, existingNames = [], initialName }: ServiceFormProps) {
  const suggestion = initialName ? SERVICE_SUGGESTIONS.find((s) => normalize(s.name) === normalize(initialName)) : undefined;
  const [state, setState] = useState<FormState>(initialFormState);
  const [saving, startTransition] = useTransition();
  const [leaving, setLeaving] = useState(false);
  const pending = saving || leaving;
  const [name, setName] = useState(service?.name ?? initialName ?? "");
  const [description, setDescription] = useState(service?.description ?? suggestion?.description ?? "");
  const [currency, setCurrency] = useState(service?.currency ?? defaultCurrency);
  const [price, setPrice] = useState(service?.priceMinor ? amountInput(service.priceMinor, service.currency ?? defaultCurrency) : "");
  const [isActive, setIsActive] = useState(service?.isActive ?? true);
  const e = state.fieldErrors ?? {};
  const taken = new Set(existingNames.map(normalize));
  const suggestions = service ? [] : SERVICE_SUGGESTIONS.filter((s) => !taken.has(normalize(s.name)));

  return (
    <form
      noValidate
      className="space-y-5 rounded-2xl bg-surface p-4 sm:p-5"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await saveServiceAction({ serviceId: service?.id ?? "", name, description, price, currency, isActive });
          if (result.ok && result.redirectTo) {
            setLeaving(true);
            window.location.assign(result.redirectTo);
          } else setState(result);
        });
      }}
    >
      {suggestions.length > 0 && (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <Sparkles className="size-4 text-navy-700" aria-hidden />
            Suggestions : touchez un service pour remplir le formulaire
          </p>
          <ul className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <li key={s.name}>
                <button
                  type="button"
                  onClick={() => {
                    setName(s.name);
                    setDescription(s.description);
                  }}
                  aria-pressed={normalize(name) === normalize(s.name)}
                  className="inline-flex min-h-10 items-center rounded-full border border-slate-200 bg-white px-4 text-sm text-slate-700 transition hover:border-navy-300 aria-pressed:border-navy-800 aria-pressed:bg-navy-800 aria-pressed:text-white"
                >
                  {s.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 rounded-xl bg-white p-4 shadow-[0_1px_2px_rgba(2,55,100,0.08)] sm:grid-cols-2">
        <FormField id="s-name" label="Nom du service" required error={e.name} className="sm:col-span-2">
          <Input id="s-name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="Ex. : Hébergement" {...describedBy("s-name", e.name)} />
        </FormField>
        <FormField id="s-description" label="Description" error={e.description} hint="Ce que comprend le service, en une ou deux phrases." className="sm:col-span-2">
          <Textarea id="s-description" rows={3} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} {...describedBy("s-description", e.description, "hint")} />
        </FormField>
        <FormField id="s-price" label={`Tarif indicatif (${currency})`} error={e.price} hint="Proposé dans les factures. Laissez vide si le prix varie.">
          <Input id="s-price" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} className="tabular-nums" placeholder="Ex. : 75000" {...describedBy("s-price", e.price, "hint")} />
        </FormField>
        <FormField id="s-currency" label="Devise du tarif" required>
          <select id="s-currency" value={currency} onChange={(event) => setCurrency(event.target.value)} className={selectClass}>
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </FormField>
        {service && (
          <label className="flex min-h-10 items-start gap-3 text-sm text-slate-800 sm:col-span-2">
            <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} className="mt-0.5 size-5 accent-navy-800" />
            <span>
              <span className="font-medium">Service proposé actuellement</span>
              <span className="block text-xs text-slate-500">Décoché : le service et ses clients restent visibles, mais on ne peut plus y ajouter de clients.</span>
            </span>
          </label>
        )}
      </div>

      <FormMessage message={state.ok ? undefined : state.message} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button asChild variant="ghost">
          <Link href={service ? `/services/${service.id}` : "/services"}>Annuler</Link>
        </Button>
        <Button type="submit" variant="accent" disabled={pending}>
          {pending ? "Enregistrement…" : service ? "Enregistrer les modifications" : "Créer le service"}
        </Button>
      </div>
    </form>
  );
}

/** Suppression d'un service, après confirmation : les clients en sont retirés, rien d'autre ne change. */
export function DeleteServiceButton({ serviceId, name, clientCount }: { serviceId: string; name: string; clientCount: number }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [deleting, startDelete] = useTransition();
  const [leaving, setLeaving] = useState(false);
  const pending = deleting || leaving;

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)} className="border-red-200 text-red-700 hover:border-red-300 hover:bg-red-50 hover:text-red-800">
        <Trash2 aria-hidden />
        Supprimer
      </Button>
      {open && (
        <div role="dialog" aria-modal="true" aria-labelledby="delete-service-title" className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_3px_rgba(2,55,100,0.1)]">
            <div className="flex items-start gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-700">
                <AlertTriangle className="size-6" aria-hidden />
              </span>
              <div className="space-y-2">
                <h2 id="delete-service-title" className="text-base font-semibold text-navy-900">
                  Supprimer le service « {name} » ?
                </h2>
                <p className="text-sm text-slate-600">
                  {clientCount === 0
                    ? "Aucun client ne suit ce service."
                    : `${clientCount} client${clientCount > 1 ? "s seront retirés" : " sera retiré"} de ce service.`}{" "}
                  Les fiches clients, les dossiers, les paiements et les factures ne changent pas. Le retrait est noté dans l&apos;historique de
                  chaque client.
                </p>
                <p className="text-xs text-slate-500">Pour garder le service sans y ajouter de clients, préférez « Modifier », puis décochez « Service proposé actuellement ».</p>
              </div>
            </div>
            <div className="mt-4">
              <FormMessage message={error} />
            </div>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={pending}
                onClick={() =>
                  startDelete(async () => {
                    const result = await deleteServiceAction(serviceId);
                    if (result.ok && result.redirectTo) {
                      setLeaving(true);
                      window.location.assign(result.redirectTo);
                    } else setError(result.message);
                  })
                }
              >
                {pending ? "Suppression…" : "Supprimer le service"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface Option {
  id: string;
  label: string;
}

/**
 * Ajout d'un client à un service. Depuis la page du service, on choisit le client ; depuis la fiche
 * client, on choisit le service. Le dossier concerné est facultatif.
 */
export function EnrollForm({
  serviceId,
  services,
  clientId,
  clients,
  cases,
}: {
  serviceId?: string;
  services?: Option[];
  clientId?: string;
  clients?: Option[];
  cases: (Option & { clientId: string })[];
}) {
  const [state, setState] = useState<FormState>(initialFormState);
  const [pending, startTransition] = useTransition();
  const [pickedService, setPickedService] = useState(serviceId ?? "");
  const [pickedClient, setPickedClient] = useState(clientId ?? "");
  const [search, setSearch] = useState("");
  const [caseId, setCaseId] = useState("");
  const [status, setStatus] = useState<ServiceClientStatus>("in_progress");
  const [note, setNote] = useState("");
  const e = state.fieldErrors ?? {};
  const clientCases = cases.filter((c) => c.clientId === pickedClient);
  const query = normalize(search);
  const shownClients = clients?.filter((c) => !query || c.id === pickedClient || normalize(c.label).includes(query));

  return (
    <form
      noValidate
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await addServiceClientAction({ serviceId: pickedService, clientId: pickedClient, caseId, status, note });
          setState(result);
          if (result.ok) {
            if (!serviceId) setPickedService("");
            if (!clientId) setPickedClient("");
            setSearch("");
            setCaseId("");
            setStatus("in_progress");
            setNote("");
          }
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-start">
        {clients && (
          <div className="space-y-2 sm:col-span-2 lg:col-span-1">
            <FormField id="e-client" label="Client" required error={e.clientId}>
              <select
                id="e-client"
                value={pickedClient}
                onChange={(event) => {
                  setPickedClient(event.target.value);
                  setCaseId("");
                }}
                className={selectClass}
                {...describedBy("e-client", e.clientId)}
              >
                <option value="">{shownClients?.length ? "Choisir un client…" : "Aucun client trouvé"}</option>
                {shownClients?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </FormField>
            {clients.length > 8 && (
              <Input type="search" aria-label="Filtrer la liste des clients" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filtrer : nom, référence…" />
            )}
          </div>
        )}
        {services && (
          <FormField id="e-service" label="Service" required error={e.serviceId}>
            <select id="e-service" value={pickedService} onChange={(event) => setPickedService(event.target.value)} className={selectClass} {...describedBy("e-service", e.serviceId)}>
              <option value="">Choisir un service…</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </FormField>
        )}
        <FormField id="e-case" label="Dossier concerné" hint={pickedClient && clientCases.length === 0 ? "Ce client n'a aucun dossier." : undefined}>
          <select
            id="e-case"
            value={caseId}
            disabled={!pickedClient || clientCases.length === 0}
            onChange={(event) => setCaseId(event.target.value)}
            className={selectClass}
            {...describedBy("e-case", undefined, pickedClient && clientCases.length === 0 ? "hint" : undefined)}
          >
            <option value="">Aucun</option>
            {clientCases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="e-status" label="État du suivi" required>
          <select id="e-status" value={status} onChange={(event) => setStatus(event.target.value as ServiceClientStatus)} className={selectClass}>
            {STATUS_OPTIONS.map(([value, spec]) => (
              <option key={value} value={value}>
                {spec.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="e-note" label="Remarque" error={e.note}>
          <Input id="e-note" value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="Ex. : arrivée prévue le 1er septembre" {...describedBy("e-note", e.note)} />
        </FormField>
      </div>
      <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
      <div className="flex justify-end">
        <Button type="submit" variant="accent" disabled={pending}>
          {clients ? <UserPlus aria-hidden /> : <Plus aria-hidden />}
          {pending ? "Ajout…" : clients ? "Ajouter au service" : "Ajouter à ce service"}
        </Button>
      </div>
    </form>
  );
}

/** Changer l'état du suivi, le dossier concerné ou la remarque ; retirer le client du service. */
export function ServiceClientActions({
  link,
  who,
  cases,
}: {
  link: { id: string; status: ServiceClientStatus; caseId?: string; note: string };
  /** « Awa Diallo » sur la page du service, « Hébergement » sur la fiche client. */
  who: string;
  cases: Option[];
}) {
  const [mode, setMode] = useState<"idle" | "edit" | "remove">("idle");
  const [state, setState] = useState<FormState>(initialFormState);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState(link.status);
  const [caseId, setCaseId] = useState(link.caseId ?? "");
  const [note, setNote] = useState(link.note);
  const id = link.id.slice(0, 8);

  if (mode === "edit") {
    return (
      <form
        noValidate
        className="w-full space-y-3 rounded-xl border border-navy-100 bg-navy-50/40 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const result = await updateServiceClientAction({ linkId: link.id, status, caseId, note });
            setState(result);
            if (result.ok) setMode("idle");
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField id={`u-status-${id}`} label="État du suivi" required>
            <select id={`u-status-${id}`} value={status} onChange={(event) => setStatus(event.target.value as ServiceClientStatus)} className={selectClass}>
              {STATUS_OPTIONS.map(([value, spec]) => (
                <option key={value} value={value}>
                  {spec.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id={`u-case-${id}`} label="Dossier concerné">
            <select id={`u-case-${id}`} value={caseId} disabled={cases.length === 0} onChange={(event) => setCaseId(event.target.value)} className={selectClass}>
              <option value="">Aucun</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id={`u-note-${id}`} label="Remarque">
            <Input id={`u-note-${id}`} value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} />
          </FormField>
        </div>
        <FormMessage message={state.ok ? undefined : state.message} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setStatus(link.status);
              setCaseId(link.caseId ?? "");
              setNote(link.note);
              setState(initialFormState);
              setMode("idle");
            }}
          >
            Annuler
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer le suivi"}
          </Button>
        </div>
      </form>
    );
  }

  if (mode === "remove") {
    return (
      <div className="w-full space-y-2 rounded-xl border border-red-200 bg-red-50 p-3">
        <p className="text-sm text-red-900">
          Retirer <strong>{who}</strong> ? La fiche client, ses dossiers et ses paiements ne changent pas ; le retrait est noté dans son historique.
        </p>
        <FormMessage message={state.ok ? undefined : state.message} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={() => setMode("idle")}>
            Annuler
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await removeServiceClientAction(link.id);
                setState(result);
              })
            }
          >
            {pending ? "Retrait…" : "Confirmer le retrait"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" className="min-h-10" onClick={() => setMode("edit")}>
        <Pencil aria-hidden />
        Modifier le suivi
      </Button>
      <Button type="button" variant="ghost" size="sm" className="min-h-10 text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => setMode("remove")}>
        <Trash2 aria-hidden />
        Retirer
      </Button>
      {state.ok && state.message && (
        <span role="status" className="text-sm text-emerald-800">
          {state.message}
        </span>
      )}
    </div>
  );
}
