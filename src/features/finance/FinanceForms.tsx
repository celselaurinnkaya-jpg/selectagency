"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { describedBy, FormField, FormMessage, selectClass } from "@/components/shared/form";
import { CURRENCY_OPTIONS } from "@/lib/format";
import { initialFormState } from "@/lib/form-state";
import { addChargeAction, createExpenseAction, recordPaymentAction, voidPaymentAction } from "./actions";
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

/**
 * Encaissement. Le montant est réparti automatiquement sur les prestations non soldées, dans l'ordre
 * où elles ont été convenues ; la base attribue le numéro de reçu.
 */
export function RecordPaymentForm({
  caseId,
  currency,
  remainingLabel,
  defaultDate,
  defaultPayer,
}: {
  caseId: string;
  currency: string;
  remainingLabel: string;
  defaultDate: string;
  defaultPayer: string;
}) {
  const [state, action, pending] = useActionState(recordPaymentAction, initialFormState);
  const e = state.fieldErrors ?? {};
  const v = state.ok ? {} : (state.values ?? {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="caseId" value={caseId} />
      <p className="text-sm text-slate-600">
        Reste à payer : <strong className="tabular-nums text-slate-900">{remainingLabel}</strong>. Le montant est affecté aux prestations dans
        l&apos;ordre où elles ont été convenues.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <FormField id="payment-amount" label={`Montant reçu (${currency})`} required error={e.amount}>
          <Input id="payment-amount" name="amount" inputMode="decimal" defaultValue={v.amount} placeholder="Ex. : 250 000" className="tabular-nums" {...describedBy("payment-amount", e.amount)} />
        </FormField>
        <FormField id="payment-method" label="Moyen de paiement" required error={e.method}>
          <select id="payment-method" name="method" defaultValue={v.method ?? "cash"} className={selectClass}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="payment-reference" label="Référence de la transaction" hint="Numéro Mobile Money ou de virement" error={e.transactionReference}>
          <Input id="payment-reference" name="transactionReference" defaultValue={v.transactionReference} {...describedBy("payment-reference", e.transactionReference, "hint")} />
        </FormField>
        <FormField id="payment-payer" label="Payé par" error={e.payerName}>
          <Input id="payment-payer" name="payerName" defaultValue={v.payerName ?? defaultPayer} />
        </FormField>
        <FormField id="payment-date" label="Date du paiement" required error={e.paidDate}>
          <Input id="payment-date" name="paidDate" type="date" defaultValue={v.paidDate ?? defaultDate} max={defaultDate} />
        </FormField>
        <FormField id="payment-time" label="Heure">
          <Input id="payment-time" name="paidTime" type="time" defaultValue={v.paidTime} />
        </FormField>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
          {state.ok && state.redirectTo && (
            <Link href={state.redirectTo} className="text-sm font-medium text-navy-700 hover:underline">
              Voir et imprimer le reçu
            </Link>
          )}
        </div>
        <Button type="submit" variant="accent" disabled={pending} className="sm:ml-auto">
          {pending ? "Enregistrement…" : "Enregistrer le paiement"}
        </Button>
      </div>
    </form>
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

/** Annulation d'un paiement : motif obligatoire, le reçu reste consultable avec la mention « annulé ». */
export function VoidPaymentForm({ paymentId }: { paymentId: string }) {
  const [state, action, pending] = useActionState(voidPaymentAction, initialFormState);
  return (
    <details className="text-sm print:hidden">
      <summary className="inline-flex min-h-10 cursor-pointer items-center font-medium text-red-700">Annuler ce paiement</summary>
      <form action={action} className="mt-2 space-y-2">
        <input type="hidden" name="paymentId" value={paymentId} />
        <FormField id="void-reason" label="Motif de l'annulation" required hint="Ex. : montant saisi deux fois, paiement Mobile Money non reçu.">
          <Input id="void-reason" name="reason" defaultValue={state.ok ? "" : state.values?.reason} {...describedBy("void-reason", undefined, "hint")} />
        </FormField>
        <p className="text-xs text-slate-600">Le numéro du reçu n&apos;est jamais réutilisé : le reçu reste consultable, marqué « annulé ».</p>
        <Button type="submit" size="sm" variant="destructive" disabled={pending}>
          {pending ? "Annulation…" : "Confirmer l'annulation"}
        </Button>
        <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
      </form>
    </details>
  );
}
