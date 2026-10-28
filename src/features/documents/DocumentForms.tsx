"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormMessage, selectClass } from "@/components/shared/form";
import { initialFormState } from "@/lib/form-state";
import { addRequirementAction } from "@/features/cases/actions";
import { reviewDocumentAction } from "./actions";

/** Vérification interne d'une pièce reçue : validée par l'agence, ou à corriger avec un commentaire. */
export function ReviewDocumentForm({ requirementId, label }: { requirementId: string; label: string }) {
  const [state, action, pending] = useActionState(reviewDocumentAction, initialFormState);
  const [correcting, setCorrecting] = useState(false);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="requirementId" value={requirementId} />
      {correcting && (
        <div>
          <label htmlFor={`comment-${requirementId}`} className="mb-1 block text-sm font-medium text-slate-800">
            Ce qu&apos;il faut corriger
          </label>
          <Textarea id={`comment-${requirementId}`} name="comment" rows={2} aria-invalid={!!state.fieldErrors?.comment} />
          {state.fieldErrors?.comment && <p className="mt-1 text-sm text-red-700">{state.fieldErrors.comment[0]}</p>}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {correcting ? (
          <>
            <Button type="submit" name="decision" value="to_correct" size="sm" variant="destructive" disabled={pending}>
              Demander une correction
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setCorrecting(false)}>
              Annuler
            </Button>
          </>
        ) : (
          <>
            <Button type="submit" name="decision" value="validated" size="sm" disabled={pending} aria-label={`Marquer « ${label} » comme vérifié par l'agence`}>
              Vérifié par l&apos;agence
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setCorrecting(true)}>
              À corriger
            </Button>
          </>
        )}
      </div>
      {!state.ok && state.message && !state.fieldErrors && <FormMessage message={state.message} />}
    </form>
  );
}

export function AddRequirementForm({ caseId, options }: { caseId: string; options: { value: string; label: string }[] }) {
  const [state, action, pending] = useActionState(addRequirementAction, initialFormState);
  if (options.length === 0) return null;
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <input type="hidden" name="caseId" value={caseId} />
      <div className="flex-1">
        <label htmlFor="documentTypeCode" className="mb-1 block text-sm font-medium text-slate-800">
          Ajouter une pièce à la liste
        </label>
        <select id="documentTypeCode" name="documentTypeCode" defaultValue="" className={selectClass}>
          <option value="" disabled>
            Choisir un type de document
          </option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <label className="inline-flex min-h-10 items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="isRequired" value="1" defaultChecked className="size-4 accent-navy-800" />
        Obligatoire
      </label>
      <Button type="submit" variant="outline" disabled={pending}>
        Ajouter
      </Button>
      <div className="sm:basis-full">
        <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
      </div>
    </form>
  );
}
