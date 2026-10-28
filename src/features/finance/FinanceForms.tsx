"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { describedBy, FormField, FormMessage, selectClass } from "@/components/shared/form";
import { initialFormState } from "@/lib/form-state";
import { addChargeAction, recordPaymentAction } from "./actions";
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
