"use client";

import { startTransition, useActionState, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { describedBy, FormField, FormMessage, selectClass } from "@/components/shared/form";
import { initialFormState } from "@/lib/form-state";
import { addRequirementAction } from "@/features/cases/actions";
import { deleteRequirementAction, removeFileAction, reviewDocumentAction, updateRequirementAction } from "./actions";
import { OTHER_DOCUMENT } from "./checklists";

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

/**
 * Ajout d'une pièce à la liste : un type de la liste, ou « Autre pièce » nommée par l'agence. Le
 * choix est un champ contrôlé (il affiche la saisie du nom) : le formulaire est donc envoyé par
 * onSubmit, pour que React ne le réinitialise pas en cas d'erreur.
 */
export function AddRequirementForm({ caseId, options }: { caseId: string; options: { value: string; label: string }[] }) {
  const [state, action, pending] = useActionState(addRequirementAction, initialFormState);
  const [choice, setChoice] = useState("");
  const [handled, setHandled] = useState(state);
  // Pièce ajoutée : le choix revient à zéro (ajusté pendant le rendu, à chaque nouveau résultat).
  if (state !== handled) {
    setHandled(state);
    if (state.ok) setChoice("");
  }
  const other = choice === OTHER_DOCUMENT;

  return (
    <form
      className="space-y-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        formData.set("documentTypeCode", choice);
        startTransition(() => action(formData));
      }}
    >
      <input type="hidden" name="caseId" value={caseId} />
      <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
        <div>
          <label htmlFor="documentTypeCode" className="mb-1 block text-sm font-medium text-slate-800">
            Ajouter une pièce à la liste
          </label>
          <select id="documentTypeCode" value={choice} onChange={(e) => setChoice(e.target.value)} className={selectClass}>
            <option value="" disabled>
              Choisir un type de document
            </option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
            <option value={OTHER_DOCUMENT}>Autre pièce (à préciser)…</option>
          </select>
        </div>
        {other && (
          <div>
            <label htmlFor="customLabel" className="mb-1 block text-sm font-medium text-slate-800">
              Nom de la pièce <span className="text-red-700" aria-hidden>*</span>
            </label>
            <Input
              id="customLabel"
              name="customLabel"
              placeholder="Ex. : Attestation de bourse, certificat médical…"
              defaultValue={state.ok ? "" : state.values?.customLabel}
              aria-invalid={!!state.fieldErrors?.customLabel}
            />
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex min-h-10 items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="isRequired" value="1" defaultChecked className="size-4 accent-navy-800" />
          Obligatoire
        </label>
        <Button type="submit" variant="outline" disabled={pending || !choice}>
          {pending ? "Ajout…" : "Ajouter"}
        </Button>
      </div>
      <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
    </form>
  );
}

/** Suppression d'un fichier d'une pièce, en deux temps pour éviter un clic malheureux. */
export function RemoveFileButton({ fileId, requirementId, fileName }: { fileId: string; requirementId: string; fileName: string }) {
  const [state, action, pending] = useActionState(removeFileAction, initialFormState);
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-red-700 hover:underline">
        <Trash2 className="size-4" aria-hidden />
        Supprimer
      </button>
    );
  }
  return (
    <form action={action} className="inline-flex flex-wrap items-center gap-2">
      <input type="hidden" name="fileId" value={fileId} />
      <input type="hidden" name="requirementId" value={requirementId} />
      <input type="hidden" name="fileName" value={fileName} />
      <Button type="submit" size="sm" variant="destructive" disabled={pending}>
        {pending ? "Suppression…" : "Confirmer la suppression"}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
        Annuler
      </Button>
      {state.message && !state.ok && <FormMessage message={state.message} />}
    </form>
  );
}

/** Modifier une pièce (nom, obligatoire, date d'expiration) ou la retirer de la liste. */
export function RequirementEditor({
  requirementId,
  label,
  isRequired,
  expiresAt,
  fileCount,
}: {
  requirementId: string;
  label: string;
  isRequired: boolean;
  expiresAt?: string;
  fileCount: number;
}) {
  const [state, action, pending] = useActionState(updateRequirementAction, initialFormState);
  const [deleteState, deleteAction, deleting] = useActionState(deleteRequirementAction, initialFormState);
  const e = state.fieldErrors ?? {};
  const v = state.ok ? {} : (state.values ?? {});
  const id = requirementId.slice(0, 8);
  return (
    <details className="rounded-lg border border-slate-200">
      <summary className="flex min-h-10 cursor-pointer items-center gap-1.5 px-3 text-sm font-medium text-navy-800">
        <Pencil className="size-4" aria-hidden />
        Modifier la pièce
      </summary>
      <div className="space-y-4 border-t border-slate-100 p-3">
        <form action={action} className="space-y-3" noValidate>
          <input type="hidden" name="requirementId" value={requirementId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id={`req-label-${id}`} label="Nom de la pièce" required error={e.label}>
              <Input id={`req-label-${id}`} name="label" defaultValue={v.label ?? label} {...describedBy(`req-label-${id}`, e.label)} />
            </FormField>
            <FormField id={`req-expiry-${id}`} label="Date d'expiration" error={e.expiresAt} hint="Pour un passeport, un titre de séjour…">
              <Input id={`req-expiry-${id}`} name="expiresAt" type="date" defaultValue={v.expiresAt ?? expiresAt ?? ""} {...describedBy(`req-expiry-${id}`, e.expiresAt, "hint")} />
            </FormField>
          </div>
          <label className="inline-flex min-h-10 items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="isRequired" value="1" defaultChecked={v.isRequired ? v.isRequired === "1" : isRequired} className="size-4 accent-navy-800" />
            Obligatoire
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" variant="outline" disabled={pending}>
              {pending ? "Enregistrement…" : "Enregistrer"}
            </Button>
            <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
          </div>
        </form>

        <form action={deleteAction} className="space-y-2 border-t border-slate-100 pt-3">
          <input type="hidden" name="requirementId" value={requirementId} />
          <label className="flex min-h-10 items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" name="confirm" value="oui" className="mt-0.5 size-4 accent-navy-800" />
            Je confirme : retirer « {label} » de la liste{fileCount ? ` et supprimer ${fileCount > 1 ? `ses ${fileCount} fichiers` : "son fichier"}` : ""}.
          </label>
          <Button type="submit" size="sm" variant="destructive" disabled={deleting}>
            <Trash2 aria-hidden />
            {deleting ? "Retrait…" : "Retirer la pièce de la liste"}
          </Button>
          {deleteState.message && !deleteState.ok && <FormMessage message={deleteState.message} />}
        </form>
      </div>
    </details>
  );
}
