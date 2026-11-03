"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Check, Circle, CircleCheck, Plus, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormMessage } from "@/components/shared/form";
import type { ServiceClientStep } from "@/lib/domain/types";
import { formatDate } from "@/lib/format";
import { initialFormState, type FormState } from "@/lib/form-state";
import { saveServiceStepsAction, setServiceStepAction } from "./actions";
import { DEFAULT_SERVICE_STEPS } from "./suggestions";

// Étapes des services : l'éditeur de la liste (responsables) et le suivi étape par étape d'un client.

/** Liste des étapes d'un service : ajouter, renommer, déplacer, retirer, revenir aux étapes proposées. */
export function ServiceStepsEditor({ serviceId, steps, followed }: { serviceId: string; steps: string[]; followed: number }) {
  // Chaque ligne garde une clé stable : déplacer une étape ne mélange pas les champs en cours de saisie.
  const [rows, setRows] = useState(() => steps.map((label, i) => ({ key: `s${i}`, label })));
  const [counter, setCounter] = useState(steps.length);
  const [state, setState] = useState<FormState>(initialFormState);
  const [pending, startTransition] = useTransition();

  const update = (index: number, label: string) => setRows((r) => r.map((row, i) => (i === index ? { ...row, label } : row)));
  const move = (index: number, delta: number) =>
    setRows((r) => {
      const next = [...r];
      const [row] = next.splice(index, 1);
      next.splice(index + delta, 0, row!);
      return next;
    });
  const add = () => {
    setRows((r) => [...r, { key: `n${counter}`, label: "" }]);
    setCounter((c) => c + 1);
  };

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => setState(await saveServiceStepsAction(serviceId, rows.map((r) => r.label))));
      }}
    >
      <ol className="space-y-2">
        {rows.map((row, index) => (
          <li key={row.key} className="flex items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-navy-800 text-sm font-semibold text-citron-400 tabular-nums">{index + 1}</span>
            <Input
              aria-label={`Étape ${index + 1}`}
              value={row.label}
              maxLength={120}
              onChange={(event) => update(index, event.target.value)}
              placeholder="Ex. : Logement trouvé"
              className="min-w-0 flex-1"
            />
            <Button type="button" variant="ghost" size="icon" aria-label={`Monter l'étape ${index + 1}`} disabled={index === 0} onClick={() => move(index, -1)}>
              <ArrowUp aria-hidden />
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label={`Descendre l'étape ${index + 1}`} disabled={index === rows.length - 1} onClick={() => move(index, 1)}>
              <ArrowDown aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Retirer l'étape ${index + 1}`}
              disabled={rows.length === 1}
              onClick={() => setRows((r) => r.filter((_, i) => i !== index))}
              className="text-red-700 hover:bg-red-50 hover:text-red-800"
            >
              <X aria-hidden />
            </Button>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={rows.length >= 30} onClick={add}>
          <Plus aria-hidden />
          Ajouter une étape
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setRows(DEFAULT_SERVICE_STEPS.map((label, i) => ({ key: `d${counter + i}`, label })));
            setCounter((c) => c + DEFAULT_SERVICE_STEPS.length);
          }}
        >
          <RotateCcw aria-hidden />
          Revenir aux étapes proposées
        </Button>
      </div>
      {followed > 0 && (
        <p className="text-sm text-slate-600">
          {followed} client{followed > 1 ? "s" : ""} déjà suivi{followed > 1 ? "s" : ""} garde{followed > 1 ? "nt" : ""} ses étapes actuelles : la nouvelle liste
          s&apos;applique aux clients ajoutés ensuite.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="accent" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer les étapes"}
        </Button>
        <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
      </div>
    </form>
  );
}

/**
 * Avancement d'un client dans un service : barre, prochaine étape (un geste pour la valider) et
 * liste complète à cocher ou décocher. Sans droit d'écriture, la liste est seulement consultable.
 */
export function ServiceProgress({
  steps,
  canEdit,
  timezone,
}: {
  steps: ServiceClientStep[];
  canEdit: boolean;
  timezone: string;
}) {
  const [state, setState] = useState<FormState>(initialFormState);
  const [pending, startTransition] = useTransition();
  if (steps.length === 0) return null;
  const done = steps.filter((s) => s.doneAt).length;
  const next = steps.find((s) => !s.doneAt);
  const toggle = (step: ServiceClientStep) => startTransition(async () => setState(await setServiceStepAction(step.id, !step.doneAt)));

  return (
    <div className="space-y-2 rounded-lg bg-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium text-slate-900 tabular-nums">
          {done}/{steps.length} étape{steps.length > 1 ? "s" : ""}
        </span>
        <span className="text-slate-600">{next ? <>Prochaine : <strong className="font-medium text-slate-900">{next.label}</strong></> : "Toutes les étapes sont faites"}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done} aria-label="Avancement du service">
        <div className="h-full rounded-full bg-navy-800 transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      {canEdit && next && (
        <Button type="button" variant="outline" disabled={pending} onClick={() => toggle(next)} className="w-full justify-start sm:w-auto">
          <Check aria-hidden />
          {pending ? "Enregistrement…" : `Étape faite : ${next.label}`}
        </Button>
      )}
      <details className="text-sm">
        <summary className="inline-flex min-h-10 cursor-pointer items-center font-medium text-navy-700">Voir {canEdit ? "et cocher " : ""}toutes les étapes</summary>
        <ol className="mt-1 space-y-1">
          {steps.map((step) => {
            const content = (
              <>
                {step.doneAt ? <CircleCheck className="size-5 shrink-0 text-emerald-700" aria-hidden /> : <Circle className="size-5 shrink-0 text-slate-400" aria-hidden />}
                <span className={step.doneAt ? "text-slate-900" : "text-slate-700"}>
                  {step.position}. {step.label}
                </span>
                {step.doneAt && <span className="ml-auto shrink-0 text-xs text-slate-500">{formatDate(step.doneAt, timezone)}</span>}
              </>
            );
            return (
              <li key={step.id}>
                {canEdit ? (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={!!step.doneAt}
                    disabled={pending}
                    onClick={() => toggle(step)}
                    className="flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-white disabled:opacity-60"
                  >
                    {content}
                  </button>
                ) : (
                  <span className="flex min-h-10 items-center gap-2 px-2">{content}</span>
                )}
              </li>
            );
          })}
        </ol>
      </details>
      <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
    </div>
  );
}
