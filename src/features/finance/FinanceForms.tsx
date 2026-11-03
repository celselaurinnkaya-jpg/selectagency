"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { describedBy, FormField, FormMessage, selectClass } from "@/components/shared/form";
import { CURRENCY_OPTIONS } from "@/lib/format";
import { initialFormState, type FormState } from "@/lib/form-state";
import { addChargeAction, confirmPaymentAction, createExpenseAction, recordPaymentAction, voidPaymentAction } from "./actions";
import { PAYMENT_METHODS } from "./payments";

/** Prestation convenue avec le client : frais de l'agence ou montant à reverser à un tiers. */
export function AddChargeForm({ caseId, currency }: { caseId: string; currency: string }) {
  const [state, action, pending] = useActionState(addChargeAction, initialFormState);
  const e = state.fieldErrors ?? {};
  const v = state.ok ? {} : (state.values ?? {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
      <input type="hidden" name="caseId" value={caseId} />
      <FormField id="charge-label" label="Prestation" required error={e.label} className="sm:col-span-2">
        <Input id="charge-label" name="label" defaultValue={v.label} placeholder="Ex. : Accompagnement visa court séjour" {...describedBy("charge-label", e.label)} />
      </FormField>
      <FormField id="charge-type" label="Ce montant revient à" required error={e.chargeType}>
        <select id="charge-type" name="chargeType" defaultValue={v.chargeType ?? "agency_fee"} className={selectClass}>
          <option value="agency_fee">L&apos;agence (frais de service)</option>
          <option value="third_party">Un tiers (frais officiels, établissement…)</option>
        </select>
      </FormField>
      <FormField id="charge-amount" label={`Montant (${currency})`} required error={e.amount}>
        <Input id="charge-amount" name="amount" inputMode="decimal" defaultValue={v.amount} placeholder="Ex. : 150 000" className="tabular-nums" {...describedBy("charge-amount", e.amount)} />
      </FormField>
      <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-4 sm:flex-row sm:items-center sm:justify-between">
        <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
        <Button type="submit" variant="outline" disabled={pending} className="sm:ml-auto">
          {pending ? "Ajout…" : "Ajouter la prestation"}
        </Button>
      </div>
    </form>
  );
}

const PAYMENT_STATES = [
  {
    value: "recorded",
    label: "Reçu et vérifié",
    description: "L'argent est dans la caisse ou sur le compte de l'agence : le reçu est créé tout de suite.",
  },
  {
    value: "pending",
    label: "Annoncé, à vérifier",
    description: "Le client dit avoir payé (virement, Mobile Money) : pas de reçu tant que la réception n'est pas confirmée.",
  },
] as const;

/**
 * Encaissement. Le montant est réparti automatiquement sur les prestations non soldées, dans l'ordre
 * où elles ont été convenues ; la base attribue le numéro de reçu (à la confirmation pour un paiement
 * à vérifier). Champs contrôlés envoyés par onSubmit : rien ne se perd après une erreur.
 */
export function RecordPaymentForm({
  caseId,
  currency,
  remainingLabel,
  pendingLabel,
  defaultDate,
  defaultPayer,
}: {
  caseId: string;
  currency: string;
  remainingLabel: string;
  /** Montant des paiements à vérifier sur le dossier, s'il y en a. */
  pendingLabel?: string;
  defaultDate: string;
  defaultPayer: string;
}) {
  const [state, setState] = useState<FormState>(initialFormState);
  const [saving, startTransition] = useTransition();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [status, setStatus] = useState<(typeof PAYMENT_STATES)[number]["value"]>("recorded");
  const [reference, setReference] = useState("");
  const [payer, setPayer] = useState(defaultPayer);
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("");
  const e = state.fieldErrors ?? {};

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData();
    for (const [key, value] of Object.entries({ caseId, amount, method, status, transactionReference: reference, payerName: payer, paidDate: date, paidTime: time })) {
      data.set(key, value);
    }
    startTransition(async () => {
      const result = await recordPaymentAction(initialFormState, data);
      setState(result);
      if (result.ok) {
        setAmount("");
        setReference("");
        setTime("");
        setStatus("recorded");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <p className="text-sm text-slate-600">
        Reste à payer : <strong className="tabular-nums text-slate-900">{remainingLabel}</strong>
        {pendingLabel && (
          <>
            {" "}
            (dont <strong className="tabular-nums text-orange-800">{pendingLabel}</strong> à vérifier)
          </>
        )}
        . Le montant est affecté aux prestations dans l&apos;ordre où elles ont été convenues.
      </p>
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="mb-1.5 text-sm font-medium text-slate-800">L&apos;argent a-t-il été reçu ?</legend>
        {PAYMENT_STATES.map((option) => (
          <label
            key={option.value}
            className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${status === option.value ? "border-navy-800 bg-navy-50 ring-1 ring-navy-800" : "border-slate-200 bg-white hover:border-navy-200"}`}
          >
            <input
              type="radio"
              name="payment-status"
              value={option.value}
              checked={status === option.value}
              onChange={() => setStatus(option.value)}
              className="mt-0.5 size-4 accent-navy-800"
            />
            <span>
              <span className="block font-medium text-slate-900">{option.label}</span>
              <span className="block text-slate-600">{option.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <FormField id="payment-amount" label={`Montant (${currency})`} required error={e.amount}>
          <Input
            id="payment-amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="Ex. : 250 000"
            className="tabular-nums"
            {...describedBy("payment-amount", e.amount)}
          />
        </FormField>
        <FormField id="payment-method" label="Moyen de paiement" required error={e.method}>
          <select id="payment-method" value={method} onChange={(event) => setMethod(event.target.value)} className={selectClass}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="payment-reference" label="Référence de la transaction" hint="Numéro Mobile Money ou de virement" error={e.transactionReference}>
          <Input
            id="payment-reference"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            maxLength={80}
            {...describedBy("payment-reference", e.transactionReference, "hint")}
          />
        </FormField>
        <FormField id="payment-payer" label="Payé par" error={e.payerName}>
          <Input id="payment-payer" value={payer} onChange={(event) => setPayer(event.target.value)} maxLength={120} />
        </FormField>
        <FormField id="payment-date" label="Date du paiement" required error={e.paidDate}>
          <Input id="payment-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} max={defaultDate} />
        </FormField>
        <FormField id="payment-time" label="Heure">
          <Input id="payment-time" type="time" value={time} onChange={(event) => setTime(event.target.value)} />
        </FormField>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
          {state.ok && state.redirectTo && (
            <Link href={state.redirectTo} className="inline-flex min-h-10 items-center text-sm font-medium text-navy-700 hover:underline">
              Voir, imprimer ou envoyer le reçu
            </Link>
          )}
        </div>
        <Button type="submit" variant="accent" disabled={saving} className="sm:ml-auto">
          {saving ? "Enregistrement…" : status === "pending" ? "Noter le paiement à vérifier" : "Enregistrer le paiement"}
        </Button>
      </div>
    </form>
  );
}

/** Paiement annoncé : confirmer sa réception (le reçu est créé) ou l'annuler s'il n'est jamais arrivé. */
export function PendingPaymentActions({ paymentId }: { paymentId: string }) {
  const [state, setState] = useState<FormState>(initialFormState);
  const [confirming, startTransition] = useTransition();
  return (
    <div className="space-y-2 print:hidden">
      <div className="flex flex-wrap items-start gap-2">
        <Button
          type="button"
          variant="accent"
          disabled={confirming}
          onClick={() => startTransition(async () => setState(await confirmPaymentAction(paymentId)))}
        >
          <CheckCircle2 aria-hidden />
          {confirming ? "Confirmation…" : "Confirmer la réception"}
        </Button>
      </div>
      <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
      {state.ok && state.redirectTo && (
        <Link href={state.redirectTo} className="inline-flex min-h-10 items-center text-sm font-medium text-navy-700 hover:underline">
          Voir, imprimer ou envoyer le reçu
        </Link>
      )}
      {!state.ok && <VoidPaymentForm paymentId={paymentId} pending />}
    </div>
  );
}

/** Dépense de l'agence, ou somme versée à un tiers pour le compte d'un client (rattachée à son dossier). */
export function ExpenseForm({ currency, defaultDate, cases }: { currency: string; defaultDate: string; cases: { value: string; label: string }[] }) {
  const [state, action, pending] = useActionState(createExpenseAction, initialFormState);
  const e = state.fieldErrors ?? {};
  const v = state.ok ? {} : (state.values ?? {});
  return (
    <form action={action} className="space-y-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FormField id="expense-label" label="Dépense" required error={e.label} className="sm:col-span-2">
          <Input id="expense-label" name="label" defaultValue={v.label} placeholder="Ex. : Loyer du bureau, frais de visa reversés" {...describedBy("expense-label", e.label)} />
        </FormField>
        <FormField id="expense-type" label="Nature" required error={e.expenseType}>
          <select id="expense-type" name="expenseType" defaultValue={v.expenseType ?? "operating"} className={selectClass}>
            <option value="operating">Dépense de l&apos;agence</option>
            <option value="client_disbursement">Reversement pour un client</option>
          </select>
        </FormField>
        <FormField id="expense-supplier" label="Fournisseur ou bénéficiaire" error={e.supplier}>
          <Input id="expense-supplier" name="supplier" defaultValue={v.supplier} />
        </FormField>
        <FormField id="expense-amount" label="Montant" required error={e.amount}>
          <Input id="expense-amount" name="amount" inputMode="decimal" defaultValue={v.amount} className="tabular-nums" {...describedBy("expense-amount", e.amount)} />
        </FormField>
        <FormField id="expense-currency" label="Devise" required error={e.currency}>
          <select id="expense-currency" name="currency" defaultValue={v.currency ?? currency} className={selectClass}>
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="expense-date" label="Date" required error={e.paidDate}>
          <Input id="expense-date" name="paidDate" type="date" defaultValue={v.paidDate ?? defaultDate} max={defaultDate} />
        </FormField>
        <FormField id="expense-case" label="Dossier du client" error={e.caseId} hint="Obligatoire pour un reversement">
          <select id="expense-case" name="caseId" defaultValue={v.caseId ?? ""} className={selectClass} {...describedBy("expense-case", e.caseId, "hint")}>
            <option value="">Aucun</option>
            {cases.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </FormField>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
        <Button type="submit" variant="accent" disabled={pending} className="sm:ml-auto">
          {pending ? "Enregistrement…" : "Enregistrer la dépense"}
        </Button>
      </div>
    </form>
  );
}

/**
 * Annulation d'un paiement, motif obligatoire. Avec reçu : il reste consultable, marqué « annulé ».
 * Paiement encore à vérifier (pending) : aucun reçu n'existe, sa part du reste à payer est libérée.
 */
export function VoidPaymentForm({ paymentId, pending = false }: { paymentId: string; pending?: boolean }) {
  const [state, action, voiding] = useActionState(voidPaymentAction, initialFormState);
  const id = `void-reason-${paymentId.slice(0, 8)}`;
  return (
    <details className="text-sm print:hidden">
      <summary className="inline-flex min-h-10 cursor-pointer items-center font-medium text-red-700">
        {pending ? "Pas reçu ? Annuler ce paiement" : "Annuler ce paiement"}
      </summary>
      <form action={action} className="mt-2 space-y-2">
        <input type="hidden" name="paymentId" value={paymentId} />
        <FormField
          id={id}
          label="Motif de l'annulation"
          required
          hint={pending ? "Ex. : virement jamais arrivé, paiement saisi deux fois." : "Ex. : montant saisi deux fois, paiement Mobile Money non reçu."}
        >
          <Input id={id} name="reason" defaultValue={state.ok ? "" : state.values?.reason} {...describedBy(id, undefined, "hint")} />
        </FormField>
        <p className="text-xs text-slate-600">
          {pending
            ? "Aucun reçu n'a été créé pour ce paiement : l'annulation reste notée dans l'historique du client."
            : "Le numéro du reçu n'est jamais réutilisé : le reçu reste consultable, marqué « annulé »."}
        </p>
        <Button type="submit" variant="destructive" disabled={voiding}>
          {voiding ? "Annulation…" : "Confirmer l'annulation"}
        </Button>
        <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
      </form>
    </details>
  );
}
