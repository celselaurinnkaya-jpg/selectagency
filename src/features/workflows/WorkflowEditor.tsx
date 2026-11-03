"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Lock, Plus, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormMessage, selectClass } from "@/components/shared/form";
import { StatusBadge } from "@/components/shared/ui";
import { STEP_KIND } from "@/lib/domain/labels";
import type { StepKind } from "@/lib/domain/types";
import { initialFormState, type FormState } from "@/lib/form-state";
import { resetWorkflowTemplateAction, saveWorkflowTemplateAction } from "./actions";

// Éditeur d'un modèle d'étapes. Les étapes liées à une décision (choix proposés, résultats, clôture)
// se renomment seulement ; les autres se renomment, changent de nature, se déplacent, se retirent.
// La clôture reste la dernière étape.

export interface EditorStep {
  key: string;
  label: string;
  kind: StepKind;
  optional: boolean;
  structural: boolean;
}

const ORDINARY_KINDS: StepKind[] = ["agency_action", "client_action", "external_event"];

export function WorkflowEditor({ templateKey, steps, customized }: { templateKey: string; steps: EditorStep[]; customized: boolean }) {
  const [rows, setRows] = useState(steps);
  const [counter, setCounter] = useState(1);
  const [state, setState] = useState<FormState>(initialFormState);
  const [pending, startTransition] = useTransition();
  const last = rows.length - 1;

  const update = (index: number, change: Partial<EditorStep>) => setRows((r) => r.map((row, i) => (i === index ? { ...row, ...change } : row)));
  const move = (index: number, delta: number) =>
    setRows((r) => {
      const next = [...r];
      const [row] = next.splice(index, 1);
      next.splice(index + delta, 0, row!);
      return next;
    });
  const add = () => {
    // Clé nouvelle, jamais déjà prise par une étape du modèle.
    let n = counter;
    while (rows.some((r) => r.key === `custom_${n}`)) n += 1;
    setRows((r) => [...r.slice(0, -1), { key: `custom_${n}`, label: "", kind: "agency_action", optional: false, structural: false }, r[r.length - 1]!]);
    setCounter(n + 1);
  };

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => setState(await saveWorkflowTemplateAction(templateKey, rows.map(({ key, label, kind, optional }) => ({ key, label, kind, optional })))));
      }}
    >
      <ol className="space-y-2">
        {rows.map((row, index) => {
          const isClosure = row.kind === "closure";
          return (
            <li key={row.key} className="rounded-xl bg-white p-3 shadow-[0_1px_2px_rgba(2,55,100,0.08)]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-navy-800 text-sm font-semibold text-citron-400 tabular-nums">{index + 1}</span>
                <Input
                  aria-label={`Nom de l'étape ${index + 1}`}
                  value={row.label}
                  maxLength={120}
                  onChange={(event) => update(index, { label: event.target.value })}
                  placeholder="Ex. : Traduction des diplômes"
                  className="min-w-0 flex-1 basis-56"
                />
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="icon" aria-label={`Monter l'étape ${index + 1}`} disabled={isClosure || index === 0} onClick={() => move(index, -1)}>
                    <ArrowUp aria-hidden />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Descendre l'étape ${index + 1}`} disabled={isClosure || index >= last - 1} onClick={() => move(index, 1)}>
                    <ArrowDown aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={row.structural ? `L'étape ${index + 1} est liée à une décision` : `Retirer l'étape ${index + 1}`}
                    title={row.structural ? "Étape liée à une décision : renommez-la plutôt" : undefined}
                    disabled={row.structural}
                    onClick={() => setRows((r) => r.filter((_, i) => i !== index))}
                    className="text-red-700 hover:bg-red-50 hover:text-red-800"
                  >
                    {row.structural ? <Lock aria-hidden /> : <X aria-hidden />}
                  </Button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 pl-10 text-sm">
                {row.structural ? (
                  <StatusBadge spec={{ label: STEP_KIND[row.kind].label, tone: STEP_KIND[row.kind].tone }} />
                ) : (
                  <select
                    aria-label={`Qui agit à l'étape ${index + 1}`}
                    value={row.kind}
                    onChange={(event) => update(index, { kind: event.target.value as StepKind })}
                    className={`${selectClass} w-auto`}
                  >
                    {ORDINARY_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {STEP_KIND[kind].label}
                      </option>
                    ))}
                  </select>
                )}
                {!row.structural && (
                  <label className="inline-flex min-h-10 items-center gap-2 text-slate-700">
                    <input type="checkbox" checked={row.optional} onChange={(event) => update(index, { optional: event.target.checked })} className="size-4 accent-navy-800" />
                    Facultative
                  </label>
                )}
                {row.structural && <span className="text-xs text-slate-500">Liée à une décision : se renomme, ne se retire pas.</span>}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={rows.length >= 60} onClick={add}>
          <Plus aria-hidden />
          Ajouter une étape
        </Button>
        {customized && (
          <Button type="button" variant="ghost" disabled={pending} onClick={() => startTransition(async () => setState(await resetWorkflowTemplateAction(templateKey)))}>
            <RotateCcw aria-hidden />
            Revenir au modèle de départ
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="accent" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer le modèle"}
        </Button>
        <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
      </div>
    </form>
  );
}
