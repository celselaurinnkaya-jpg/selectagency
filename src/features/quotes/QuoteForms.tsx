"use client";

import { startTransition, useActionState, useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormMessage, selectClass } from "@/components/shared/form";
import type { ChargeType, QuoteStatus } from "@/lib/domain/types";
import { formatMoney } from "@/lib/format";
import { initialFormState } from "@/lib/form-state";
import { parseAmount } from "@/features/finance/payments";
import { createQuoteAction, setQuoteStatusAction } from "./actions";

interface Line {
  key: number;
  label: string;
  chargeType: ChargeType;
  quantity: string;
  unitAmount: string;
}

const emptyLine = (key: number): Line => ({ key, label: "", chargeType: "agency_fee", quantity: "1", unitAmount: "" });

/**
 * Préparation d'un devis ligne par ligne. Les lignes sont des champs contrôlés : le formulaire est
 * envoyé par onSubmit (et non action=…) pour que React ne le réinitialise pas en cas d'erreur, et
 * les lignes partent dans un champ caché.
 */
export function QuoteForm({ caseId, currency }: { caseId: string; currency: string }) {
  const [state, action, pending] = useActionState(createQuoteAction, initialFormState);
  const [lines, setLines] = useState<Line[]>([emptyLine(1)]);
  const [nextKey, setNextKey] = useState(2);
  const update = (key: number, patch: Partial<Line>) => setLines((all) => all.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const total = lines.reduce((sum, l) => sum + (parseAmount(l.unitAmount, currency) ?? 0) * (Number(l.quantity) || 0), 0);

  return (
    <form
      className="space-y-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        formData.set("items", JSON.stringify(lines.map(({ label, chargeType, quantity, unitAmount }) => ({ label, chargeType, quantity, unitAmount }))));
        startTransition(() => action(formData));
      }}
    >
      <input type="hidden" name="caseId" value={caseId} />
      <ul className="space-y-3">
        {lines.map((line, index) => (
          <li key={line.key} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[2fr_1.2fr_0.6fr_1fr_auto] sm:items-end">
            <FormField id={`q-label-${line.key}`} label={`Ligne ${index + 1}`} required>
              <Input id={`q-label-${line.key}`} value={line.label} onChange={(e) => update(line.key, { label: e.target.value })} placeholder="Ex. : Accompagnement visa étudiant" />
            </FormField>
            <FormField id={`q-type-${line.key}`} label="Revient à" required>
              <select id={`q-type-${line.key}`} value={line.chargeType} onChange={(e) => update(line.key, { chargeType: e.target.value as ChargeType })} className={selectClass}>
                <option value="agency_fee">L&apos;agence</option>
                <option value="third_party">Un tiers</option>
              </select>
            </FormField>
            <FormField id={`q-qty-${line.key}`} label="Qté" required>
              <Input id={`q-qty-${line.key}`} type="number" min={1} max={999} value={line.quantity} onChange={(e) => update(line.key, { quantity: e.target.value })} className="tabular-nums" />
            </FormField>
            <FormField id={`q-unit-${line.key}`} label={`Prix unitaire (${currency})`} required>
              <Input id={`q-unit-${line.key}`} inputMode="decimal" value={line.unitAmount} onChange={(e) => update(line.key, { unitAmount: e.target.value })} className="tabular-nums" />
            </FormField>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Retirer la ligne ${index + 1}`}
              disabled={lines.length === 1}
              onClick={() => setLines((all) => all.filter((l) => l.key !== line.key))}
            >
              <Trash2 aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={lines.length >= 50}
        onClick={() => {
          setLines((all) => [...all, emptyLine(nextKey)]);
          setNextKey((k) => k + 1);
        }}
      >
        <Plus aria-hidden />
        Ajouter une ligne
      </Button>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField id="q-valid" label="Valable jusqu'au">
          <Input id="q-valid" name="validUntil" type="date" />
        </FormField>
        <FormField id="q-notes" label="Conditions et remarques" className="sm:col-span-2">
          <Input id="q-notes" name="notes" placeholder="Ex. : acompte de 50 % à la signature, frais officiels non remboursables" />
        </FormField>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-700">
          Total du devis : <strong className="tabular-nums text-slate-900">{formatMoney(total, currency)}</strong>
        </p>
        <Button type="submit" variant="accent" disabled={pending}>
          {pending ? "Préparation…" : "Préparer le devis"}
        </Button>
      </div>
      <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
      {state.ok && state.redirectTo && (
        <Link href={state.redirectTo} className="text-sm font-medium text-navy-700 hover:underline">
          Voir et imprimer le devis
        </Link>
      )}
    </form>
  );
}

const NEXT: Record<QuoteStatus, { status: QuoteStatus; label: string; variant: "accent" | "outline" | "destructive" }[]> = {
  draft: [
    { status: "sent", label: "Marquer comme remis au client", variant: "accent" },
    { status: "accepted", label: "Accepté par le client", variant: "outline" },
    { status: "cancelled", label: "Annuler le devis", variant: "destructive" },
  ],
  sent: [
    { status: "accepted", label: "Accepté par le client", variant: "accent" },
    { status: "refused", label: "Refusé par le client", variant: "outline" },
    { status: "cancelled", label: "Annuler le devis", variant: "destructive" },
  ],
  accepted: [],
  refused: [],
  cancelled: [],
};

/** Étapes d'un devis. « Remis au client » : l'agence l'a transmis elle-même (impression, PDF, WhatsApp). */
export function QuoteStatusButtons({ quoteId, status }: { quoteId: string; status: QuoteStatus }) {
  const [state, action, pending] = useActionState(setQuoteStatusAction, initialFormState);
  if (NEXT[status].length === 0) return null;
  return (
    <form action={action} className="space-y-2 print:hidden">
      <input type="hidden" name="quoteId" value={quoteId} />
      <div className="flex flex-wrap gap-2">
        {NEXT[status].map((n) => (
          <Button key={n.status} type="submit" name="status" value={n.status} variant={n.variant} size="sm" disabled={pending}>
            {n.label}
          </Button>
        ))}
      </div>
      <p className="text-xs text-slate-500">À l&apos;acceptation, chaque ligne devient une prestation du dossier, sur laquelle les paiements sont ensuite affectés.</p>
      <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
    </form>
  );
}
