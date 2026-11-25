"use client";

import { textOn } from "./display";

/** Bureau proposé dans un formulaire (code et couleur du badge, nom, ville). */
export interface BureauOption {
  value: string;
  label: string;
  code: string;
  name: string;
  city: string;
  color: string;
}

/**
 * Choix du bureau d'un client, placé à la fin du formulaire et obligatoire dès que l'agence a des bureaux
 * (demande de l'utilisateur du 25/11/2026) : des cases bien visibles, avec le badge qui s'affichera sur la fiche.
 * Sans `onChange`, le choix est envoyé avec le formulaire (champ « bureauId ») ; sinon il est piloté par l'état.
 */
export function BureauChoice({
  options,
  defaultValue,
  value,
  onChange,
  error,
  subject = "client",
}: {
  options: BureauOption[];
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  error?: string;
  subject?: "client" | "prospect";
}) {
  if (options.length === 0) return null;
  const controlled = onChange !== undefined;
  return (
    <fieldset
      className={`space-y-3 rounded-2xl border-2 bg-white p-4 sm:p-5 ${error ? "border-red-300" : "border-navy-200"}`}
      aria-describedby={error ? "bureau-choice-error" : "bureau-choice-hint"}
    >
      <legend className="px-1 text-base font-semibold text-navy-800">
        Bureau du {subject} <span className="text-red-700">*</span>
      </legend>
      <p id="bureau-choice-hint" className="text-sm text-slate-600">
        Cochez le bureau de l&apos;agence d&apos;où vient ce {subject} : son code s&apos;affichera à côté de son nom, partout dans l&apos;application.
      </p>
      <div role="radiogroup" aria-label={`Bureau du ${subject}`} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 transition hover:border-navy-300 has-[:checked]:border-navy-800 has-[:checked]:bg-navy-50 has-[:checked]:ring-2 has-[:checked]:ring-navy-200"
          >
            <input
              type="radio"
              name="bureauId"
              value={o.value}
              required
              {...(controlled ? { checked: value === o.value, onChange: () => onChange(o.value) } : { defaultChecked: defaultValue === o.value })}
              className="size-4 shrink-0 accent-navy-800"
            />
            <span className="shrink-0 rounded px-2 py-0.5 font-mono text-sm font-bold" style={{ background: o.color, color: textOn(o.color) }}>
              {o.code}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium text-slate-900">{o.name}</span>
              {o.city && o.city !== o.name && <span className="block truncate text-xs text-slate-500">{o.city}</span>}
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p id="bureau-choice-error" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </fieldset>
  );
}
