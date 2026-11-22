"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormField, FormMessage, selectClass } from "@/components/shared/form";
import { initialFormState } from "@/lib/form-state";
import { addInvoiceToChargesAction } from "./actions";

// Une facture émise entre dans le reste à payer de son dossier sur décision d'une personne : si elle reprend
// des prestations déjà convenues (devis accepté, saisie), l'ajouter ferait payer deux fois le client.

export function InvoiceBalanceForm({
  invoiceId,
  caseReference,
  totalLabel,
  otherChargesLabel,
}: {
  invoiceId: string;
  caseReference: string;
  totalLabel: string;
  /** Prestations déjà convenues dans le dossier (hors cette facture), s'il y en a. */
  otherChargesLabel?: string;
}) {
  const [state, action, pending] = useActionState(addInvoiceToChargesAction, initialFormState);
  if (state.ok) return <FormMessage message={state.message} tone="success" />;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <p>
        Le montant de cette facture ({totalLabel}) n&apos;est pas encore dans le reste à payer du dossier {caseReference}. Ajoutez-le pour que les
        paiements du dossier puissent le régler, avec reçu.
      </p>
      {otherChargesLabel && (
        <p className="font-medium">
          Le dossier a déjà {otherChargesLabel} de prestations convenues. Si cette facture reprend ces prestations, ne l&apos;ajoutez pas : le client
          devrait deux fois la même somme.
        </p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <FormField id="balance-type" label="Nature du montant" required className="min-w-0 sm:w-72">
          <select id="balance-type" name="chargeType" defaultValue="agency_fee" className={selectClass}>
            <option value="agency_fee">Frais de l&apos;agence (revenu de l&apos;agence)</option>
            <option value="third_party">Montant pour un tiers (à reverser)</option>
          </select>
        </FormField>
        <Button type="submit" variant="accent" className="h-11" disabled={pending}>
          {pending ? "Ajout…" : "Ajouter au reste à payer du dossier"}
        </Button>
      </div>
      <FormMessage message={state.message} />
    </form>
  );
}
