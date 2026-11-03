"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { FileCheck2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { describedBy, FormField, FormMessage, selectClass } from "@/components/shared/form";
import type { ServiceBooking } from "@/lib/domain/types";
import { CURRENCY_OPTIONS, minorUnits } from "@/lib/format";
import { initialFormState, type FormState } from "@/lib/form-state";
import { deleteBookingAction, saveBookingAction } from "./actions";

// Confirmations de réservation d'un client suivi dans un service. Champs contrôlés envoyés par
// onSubmit ; après l'enregistrement, la confirmation s'ouvre pour être imprimée ou envoyée.

const amountInput = (minor: number, currency: string) => {
  const digits = minorUnits(currency);
  return digits === 0 ? String(minor) : (minor / 10 ** digits).toFixed(digits).replace(".", ",");
};

export function BookingForm({ linkId, booking, defaultCurrency, onCancel }: { linkId: string; booking?: ServiceBooking; defaultCurrency: string; onCancel?: () => void }) {
  const [state, setState] = useState<FormState>(initialFormState);
  const [saving, startTransition] = useTransition();
  const [leaving, setLeaving] = useState(false);
  const [provider, setProvider] = useState(booking?.provider ?? "");
  const [reference, setReference] = useState(booking?.reference ?? "");
  const [startDate, setStartDate] = useState(booking?.startDate ?? "");
  const [endDate, setEndDate] = useState(booking?.endDate ?? "");
  const [place, setPlace] = useState(booking?.place ?? "");
  const [details, setDetails] = useState(booking?.details ?? "");
  const [currency, setCurrency] = useState(booking?.currency ?? defaultCurrency);
  const [amount, setAmount] = useState(booking?.amountMinor !== undefined ? amountInput(booking.amountMinor, booking.currency ?? defaultCurrency) : "");
  const e = state.fieldErrors ?? {};
  const id = (name: string) => `bk-${name}-${(booking?.id ?? linkId).slice(0, 8)}`;

  return (
    <form
      noValidate
      className="space-y-3 rounded-lg bg-surface p-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await saveBookingAction({ bookingId: booking?.id ?? "", linkId, provider, reference, startDate, endDate, place, details, amount, currency });
          if (result.ok && result.redirectTo) {
            setLeaving(true);
            window.location.assign(result.redirectTo);
          } else setState(result);
        });
      }}
    >
      <FormMessage message={state.ok ? undefined : state.message} />
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id={id("provider")} label="Prestataire" error={e.provider} hint="Compagnie, résidence, assureur…">
          <Input id={id("provider")} value={provider} maxLength={120} onChange={(ev) => setProvider(ev.target.value)} placeholder="Ex. : Air France, Résidence Studéa" {...describedBy(id("provider"), e.provider, "hint")} />
        </FormField>
        <FormField id={id("reference")} label="Référence de réservation" error={e.reference}>
          <Input id={id("reference")} value={reference} maxLength={80} onChange={(ev) => setReference(ev.target.value)} placeholder="Ex. : ABC123" className="font-mono" />
        </FormField>
        <FormField id={id("start")} label="Du" error={e.startDate}>
          <Input id={id("start")} type="date" value={startDate} onChange={(ev) => setStartDate(ev.target.value)} />
        </FormField>
        <FormField id={id("end")} label="Au" error={e.endDate}>
          <Input id={id("end")} type="date" min={startDate || undefined} value={endDate} onChange={(ev) => setEndDate(ev.target.value)} />
        </FormField>
        <FormField id={id("place")} label="Lieu" className="sm:col-span-2">
          <Input id={id("place")} value={place} maxLength={200} onChange={(ev) => setPlace(ev.target.value)} placeholder="Ex. : 12 rue de la République, Lyon · Aéroport de Douala" />
        </FormField>
        <FormField id={id("details")} label="Détails" className="sm:col-span-2" hint="Vol, bagages, type de logement, garanties… ce que le client doit savoir.">
          <Textarea id={id("details")} rows={3} maxLength={1500} value={details} onChange={(ev) => setDetails(ev.target.value)} {...describedBy(id("details"), undefined, "hint")} />
        </FormField>
        <FormField id={id("amount")} label={`Montant (${currency})`} error={e.amount}>
          <Input id={id("amount")} inputMode="decimal" value={amount} onChange={(ev) => setAmount(ev.target.value)} className="tabular-nums" placeholder="Vide : pas de montant affiché" />
        </FormField>
        <FormField id={id("currency")} label="Devise">
          <select id={id("currency")} value={currency} onChange={(ev) => setCurrency(ev.target.value)} className={selectClass}>
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </FormField>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="accent" disabled={saving || leaving}>
          {saving || leaving ? "Enregistrement…" : booking ? "Enregistrer les modifications" : "Créer la confirmation"}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
        )}
      </div>
    </form>
  );
}

/** Confirmations d'un client suivi : liste (vers le document) et préparation d'une nouvelle. */
export function BookingPanel({ linkId, bookings, defaultCurrency, canEdit }: { linkId: string; bookings: ServiceBooking[]; defaultCurrency: string; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  if (!canEdit && bookings.length === 0) return null;
  return (
    <div className="space-y-2">
      {bookings.length > 0 && (
        <ul className="space-y-1 text-sm">
          {bookings.map((b) => (
            <li key={b.id}>
              <Link href={`/services/confirmations/${b.id}`} className="inline-flex min-h-10 items-center gap-2 font-medium text-navy-700 hover:underline">
                <FileCheck2 className="size-4" aria-hidden />
                <span className="font-mono text-xs">{b.number}</span>
                {[b.provider, b.reference && `réf. ${b.reference}`].filter(Boolean).join(" · ")}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {canEdit &&
        (open ? (
          <BookingForm linkId={linkId} defaultCurrency={defaultCurrency} onCancel={() => setOpen(false)} />
        ) : (
          <Button type="button" variant="outline" onClick={() => setOpen(true)}>
            <Plus aria-hidden />
            Préparer une confirmation de réservation
          </Button>
        ))}
    </div>
  );
}

/** Sur la page de la confirmation : modifier ou supprimer. */
export function BookingActions({ booking, linkId, defaultCurrency, backTo }: { booking: ServiceBooking; linkId: string; defaultCurrency: string; backTo: string }) {
  const [mode, setMode] = useState<"idle" | "edit" | "delete">("idle");
  const [state, setState] = useState<FormState>(initialFormState);
  const [pending, startTransition] = useTransition();
  if (mode === "edit") return <BookingForm linkId={linkId} booking={booking} defaultCurrency={defaultCurrency} onCancel={() => setMode("idle")} />;
  return (
    <div className="space-y-2">
      {mode === "idle" ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setMode("edit")}>
            Modifier
          </Button>
          <Button type="button" variant="ghost" onClick={() => setMode("delete")} className="text-red-700 hover:bg-red-50 hover:text-red-800">
            <Trash2 aria-hidden />
            Supprimer
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <p className="flex-1">Supprimer la confirmation {booking.number} ? Son numéro ne sera pas réutilisé ; la suppression reste notée dans l&apos;historique.</p>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await deleteBookingAction(booking.id, backTo);
                if (result.ok && result.redirectTo) window.location.assign(result.redirectTo);
                else setState(result);
              })
            }
          >
            {pending ? "Suppression…" : "Confirmer la suppression"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setMode("idle")}>
            Annuler
          </Button>
        </div>
      )}
      <FormMessage message={state.message} />
    </div>
  );
}
