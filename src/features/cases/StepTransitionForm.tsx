"use client";

import { startTransition, useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { describedBy, FormField, FormMessage, selectClass } from "@/components/shared/form";
import { initialFormState } from "@/lib/form-state";
import type { StepTransitionOption } from "@/lib/domain/types";
import { transitionCaseAction } from "./actions";

type Mode = "advance" | "skip" | "back";

// Changement d'étape. Pour une étape qui dépend d'un organisme extérieur, l'agent doit dire
// si l'information est seulement déclarée (avec sa source) ou confirmée par un justificatif.
//
// Le formulaire est soumis par onSubmit et non par la prop `action` : la réinitialisation
// automatique de React 19 remettait à zéro les champs à l'écran sans toucher à l'état, si bien
// qu'après une erreur la valeur envoyée pouvait différer de celle affichée (ex. « Visa refusé »
// envoyé comme « Visa accordé »). Les choix sont donc envoyés depuis l'état, via des champs cachés.

export function StepTransitionForm({
  caseId,
  currentLabel,
  forward,
  back,
  canSkip,
  needsConfirmation,
  balanceDue,
}: {
  caseId: string;
  currentLabel: string;
  forward: StepTransitionOption[];
  back: StepTransitionOption[];
  canSkip: boolean;
  needsConfirmation: boolean;
  /** Solde restant, déjà formaté ; absent si le dossier est soldé. */
  balanceDue?: string;
}) {
  const [state, action, pending] = useActionState(transitionCaseAction, initialFormState);
  const [mode, setMode] = useState<Mode>("advance");
  const [to, setTo] = useState(forward[0]?.to ?? "");
  const [confirmation, setConfirmation] = useState<"declared" | "confirmed" | "">("");
  // Quand l'étape change (transition réussie), on repart d'un formulaire vierge en gardant le message.
  const [seenStep, setSeenStep] = useState(currentLabel);
  if (seenStep !== currentLabel) {
    setSeenStep(currentLabel);
    setMode("advance");
    setTo(forward[0]?.to ?? "");
    setConfirmation("");
  }
  const e = state.fieldErrors ?? {};
  const closing = mode === "advance" && to === "closed";
  const options = mode === "back" ? back : forward;

  const modes: { key: Mode; label: string; available: boolean }[] = [
    { key: "advance", label: "Terminer l'étape", available: forward.length > 0 },
    { key: "skip", label: "Passer (étape facultative)", available: canSkip },
    { key: "back", label: "Revenir en arrière", available: back.length > 0 },
  ];

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(() => action(formData));
      }}
    >
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="mode" value={mode} />
      {mode !== "skip" && <input type="hidden" name="to" value={to} />}
      {mode === "advance" && needsConfirmation && confirmation && <input type="hidden" name="confirmation" value={confirmation} />}

      <p className="text-sm text-slate-700">
        Étape en cours : <strong className="text-navy-800">{currentLabel}</strong>
      </p>

      <div role="radiogroup" aria-label="Action sur l'étape" className="flex flex-wrap gap-2">
        {modes
          .filter((m) => m.available)
          .map((m) => (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={mode === m.key}
              onClick={() => {
                setMode(m.key);
                setTo(m.key === "back" ? (back.at(-1)?.to ?? "") : (forward[0]?.to ?? ""));
              }}
              className={`min-h-10 rounded-full border px-4 text-sm font-medium ${mode === m.key ? "border-navy-800 bg-navy-800 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-navy-300"}`}
            >
              {m.label}
            </button>
          ))}
      </div>

      {/* Les champs libres sont recréés à chaque nouvelle étape. */}
      <div key={currentLabel} className="space-y-4">
        {mode !== "skip" && (
          <FormField id="to" label={mode === "back" ? "Étape à reprendre" : "Suite du dossier"} required error={e.to}>
            <select id="to" value={to} onChange={(event) => setTo(event.target.value)} className={selectClass}>
              {options.map((o) => (
                <option key={o.to} value={o.to}>
                  {o.label}
                </option>
              ))}
            </select>
          </FormField>
        )}

        {mode === "advance" && needsConfirmation && (
          <fieldset className="space-y-3 rounded-xl border border-violet-200 bg-violet-50 p-3">
            <legend className="px-1 text-sm font-semibold text-violet-900">Cette étape dépend d&apos;un organisme extérieur</legend>
            <div role="radiogroup" aria-label="Niveau de preuve" className="space-y-2">
              {[
                { value: "declared" as const, label: "Déclaré", text: "Information reçue (client, appel…) mais non prouvée." },
                { value: "confirmed" as const, label: "Confirmé", text: "Un justificatif officiel est au dossier." },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={confirmation === option.value}
                  onClick={() => setConfirmation(option.value)}
                  className={`flex w-full items-start gap-2 rounded-lg border bg-white p-2.5 text-left text-sm ${confirmation === option.value ? "border-navy-700 ring-2 ring-navy-200" : "border-transparent"}`}
                >
                  <span className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2 ${confirmation === option.value ? "border-navy-800" : "border-slate-400"}`} aria-hidden>
                    {confirmation === option.value && <span className="size-2 rounded-full bg-navy-800" />}
                  </span>
                  <span>
                    <span className="font-medium text-slate-900">{option.label}</span>
                    <span className="block text-slate-600">{option.text}</span>
                  </span>
                </button>
              ))}
            </div>
            {e.confirmation && <p className="text-sm text-red-700">{e.confirmation[0]}</p>}
            {confirmation === "declared" && (
              <FormField id="sourceNote" label="Source de l'information" required error={e.sourceNote} hint="Exemple : appel du client le 12/11.">
                <Input id="sourceNote" name="sourceNote" {...describedBy("sourceNote", e.sourceNote, "hint")} />
              </FormField>
            )}
            {confirmation === "confirmed" && (
              <FormField id="evidenceRef" label="Référence du justificatif" required error={e.evidenceRef} hint="Exemple : récépissé de dépôt n° …, lettre d'admission vérifiée.">
                <Input id="evidenceRef" name="evidenceRef" {...describedBy("evidenceRef", e.evidenceRef, "hint")} />
              </FormField>
            )}
          </fieldset>
        )}

        {(mode === "skip" || mode === "back") && (
          <FormField id="reason" label="Motif" required error={e.reason}>
            <Textarea id="reason" name="reason" rows={2} {...describedBy("reason", e.reason)} />
          </FormField>
        )}

        {closing && balanceDue && (
          <label className="flex items-start gap-2 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-950">
            <input type="checkbox" name="acknowledgeBalance" value="1" className="mt-0.5 size-4 accent-navy-800" />
            <span>
              Le solde de <strong>{balanceDue}</strong> n&apos;est pas réglé. Je confirme la clôture malgré tout.
            </span>
          </label>
        )}
      </div>

      <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
      <Button type="submit" disabled={pending}>
        {pending ? "Enregistrement…" : closing ? "Clôturer le dossier" : "Enregistrer"}
      </Button>
    </form>
  );
}
