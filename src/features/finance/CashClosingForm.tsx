"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, AlertTriangle, Lock, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, Section, StatusBadge } from "@/components/shared/ui";
import { FormField, FormMessage } from "@/components/shared/form";
import { METHOD_KIND } from "@/lib/domain/labels";
import { formatMoney, formatDate } from "@/lib/format";
import { initialFormState } from "@/lib/form-state";
import type { PaymentMethodKind } from "@/lib/domain/types";
import type { DayCashSummary, CashClosing } from "./cash-closing";
import { closeDailyCashAction } from "./cash-closing-actions";

export function CashClosingForm({
  summary,
  closings,
  currency,
  timeZone,
  canWrite,
  bureauId,
  bureauNames = {},
}: {
  summary: DayCashSummary;
  closings: CashClosing[];
  currency: string;
  timeZone: string;
  canWrite: boolean;
  /** Caisse d'un bureau (vide : toute l'agence). */
  bureauId?: string;
  /** Nom des bureaux, pour l'historique. */
  bureauNames?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(closeDailyCashAction, initialFormState);
  const [actualInput, setActualInput] = useState(
    summary.closing
      ? String(summary.closing.actualCashMinor / (currency === "XAF" || currency === "XOF" ? 1 : 100))
      : summary.expectedCashMinor > 0
        ? String(summary.expectedCashMinor / (currency === "XAF" || currency === "XOF" ? 1 : 100))
        : "0",
  );
  const [isEditing, setIsEditing] = useState(!summary.closing);

  const e = state.fieldErrors ?? {};
  const isClosed = Boolean(summary.closing);

  const methods: PaymentMethodKind[] = ["cash", "mobile_money", "bank_transfer", "card"];

  return (
    <div className="space-y-6">
      {/* 1. État de la caisse du jour */}
      <Card className="space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-navy-800">Caisse du {summary.date}</h2>
            <p className="text-sm text-slate-500">
              Total collecté : <strong>{formatMoney(summary.totalCollectedMinor, currency)}</strong> ({summary.paymentsCount} encaissement{summary.paymentsCount > 1 ? "s" : ""})
            </p>
          </div>
          <div>
            {isClosed ? (
              <StatusBadge spec={{ label: "Caisse clôturée", tone: "success" }} />
            ) : (
              <StatusBadge spec={{ label: "En cours / Non clôturée", tone: "warning" }} />
            )}
          </div>
        </div>

        {/* Répartition par mode de paiement */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {methods.map((method) => {
            const amount = summary.breakdown[method] ?? 0;
            return (
              <div key={method} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <span className="block text-xs text-slate-500">{METHOD_KIND[method] ?? method}</span>
                <span className="block text-base font-semibold tabular-nums text-slate-900">
                  {formatMoney(amount, currency)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Détail si clôturée */}
        {isClosed && summary.closing && !isEditing && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 text-sm space-y-3">
            <div className="flex items-center gap-2 text-emerald-900 font-medium">
              <CheckCircle2 className="size-5 text-emerald-700" />
              <span>Clôturée le {formatDate(summary.closing.closedAt, timeZone)} par {summary.closing.closedByName ?? "un responsable"}</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 pt-2 border-t border-emerald-200/60">
              <div>
                <span className="block text-xs text-slate-500">Espèces attendues</span>
                <span className="font-semibold tabular-nums text-slate-800">{formatMoney(summary.closing.expectedCashMinor, currency)}</span>
              </div>
              <div>
                <span className="block text-xs text-slate-500">Espèces comptées en caisse</span>
                <span className="font-semibold tabular-nums text-slate-900">{formatMoney(summary.closing.actualCashMinor, currency)}</span>
              </div>
              <div>
                <span className="block text-xs text-slate-500">Écart de caisse</span>
                <span className={`font-semibold tabular-nums ${summary.closing.discrepancyMinor === 0 ? "text-emerald-700" : "text-red-700"}`}>
                  {summary.closing.discrepancyMinor === 0 ? "Aucun écart (parfait)" : formatMoney(summary.closing.discrepancyMinor, currency)}
                </span>
              </div>
            </div>
            {summary.closing.notes && (
              <p className="text-xs text-slate-600 italic border-t border-emerald-200/60 pt-2">
                Observation : {summary.closing.notes}
              </p>
            )}
            {canWrite && (
              <div className="pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                  Modifier le comptage ou la note
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Formulaire de validation / modification */}
        {(!isClosed || isEditing) && canWrite && (
          <form action={formAction} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
            <input type="hidden" name="closingDate" value={summary.date} />
            <input type="hidden" name="currency" value={currency} />
            <input type="hidden" name="bureauId" value={bureauId ?? ""} />

            <div className="flex items-center gap-2 text-navy-800 font-medium text-sm">
              <Lock className="size-4 text-citron-600" />
              <span>{isClosed ? "Modifier la clôture du jour" : "Arrêter et valider la caisse du jour"}</span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                id="actualCashAmount"
                label={`Espèces réelles comptées (${currency})`}
                required
                error={e.actualCashAmount}
                hint={`Total théorique en espèces : ${formatMoney(summary.expectedCashMinor, currency)}`}
              >
                <div className="relative">
                  <Banknote className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="actualCashAmount"
                    name="actualCashAmount"
                    type="text"
                    inputMode="decimal"
                    value={actualInput}
                    onChange={(evt) => setActualInput(evt.target.value)}
                    className="pl-9 font-medium tabular-nums"
                  />
                </div>
              </FormField>

              <FormField id="notes" label="Observation ou motif d'écart (facultatif)" error={e.notes}>
                <Textarea
                  id="notes"
                  name="notes"
                  rows={2}
                  placeholder="Ex : Billets vérifiés, caisse conforme."
                  defaultValue={summary.closing?.notes ?? ""}
                />
              </FormField>
            </div>

            <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />

            <div className="flex items-center gap-2 pt-2">
              <Button type="submit" variant="default" disabled={pending}>
                {pending ? "Enregistrement…" : isClosed ? "Mettre à jour la clôture" : "Valider la clôture du jour"}
              </Button>
              {isClosed && (
                <Button type="button" variant="ghost" onClick={() => setIsEditing(false)}>
                  Annuler
                </Button>
              )}
            </div>
          </form>
        )}
      </Card>

      {/* 2. Historique des clôtures récentes */}
      <Section title="Historique des clôtures récentes">
        {closings.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune clôture de caisse enregistrée pour le moment.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Clôturée par</th>
                  <th className="px-4 py-3 text-right">Espèces comptées</th>
                  <th className="px-4 py-3 text-right">Total collecté</th>
                  <th className="px-4 py-3 text-right">Écart</th>
                  <th className="px-4 py-3">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {closings.map((c) => {
                  const hasDiscrepancy = c.discrepancyMinor !== 0;
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-medium text-navy-800">
                        {c.closingDate}
                        {Object.keys(bureauNames).length > 0 && (
                          <span className="block text-xs font-normal text-slate-500">{c.bureauId ? bureauNames[c.bureauId] ?? "Bureau" : "Toute l'agence"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{c.closedByName ?? "Responsable"}</td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-900">
                        {formatMoney(c.actualCashMinor, c.currency)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                        {formatMoney(c.totalCollectedMinor, c.currency)}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium tabular-nums ${hasDiscrepancy ? "text-red-700" : "text-emerald-700"}`}>
                        {hasDiscrepancy ? formatMoney(c.discrepancyMinor, c.currency) : "0"}
                      </td>
                      <td className="px-4 py-3">
                        {hasDiscrepancy ? (
                          <StatusBadge spec={{ label: "Écart", tone: "danger" }} />
                        ) : (
                          <StatusBadge spec={{ label: "Équilibrée", tone: "success" }} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
