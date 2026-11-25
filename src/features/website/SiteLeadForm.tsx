"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { initialFormState } from "@/lib/form-state";
import { submitWebsiteLeadAction } from "./actions";

// Formulaire de contact du site de l'agence (visiteurs sans compte). La demande devient un prospect dans SELECT,
// avec une tâche « Rappeler » pour l'agence : aucun e-mail n'est promis au visiteur.

const field =
  "mt-1 block w-full min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-sm focus:border-[var(--p)] focus:outline-none focus:ring-2 focus:ring-[var(--p)]/30";

export function SiteLeadForm({
  slug,
  agencyName,
  services,
  ctaLabel,
  bureaux = [],
  preview = false,
}: {
  slug: string;
  agencyName: string;
  services: string[];
  ctaLabel: string;
  bureaux?: { id: string; name: string; city: string }[];
  preview?: boolean;
}) {
  const [state, action, pending] = useActionState(submitWebsiteLeadAction, initialFormState);
  const e = state.fieldErrors ?? {};
  const v = state.ok ? {} : (state.values ?? {});
  if (state.ok) {
    return (
      <div role="status" className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
        <CheckCircle2 className="mt-0.5 size-6 shrink-0" aria-hidden />
        <p>{state.message}</p>
      </div>
    );
  }
  const error = (name: string) =>
    e[name]?.[0] ? (
      <span id={`${name}-error`} className="mt-1 block text-sm text-red-700">
        {e[name]![0]}
      </span>
    ) : null;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      {/* Piège à robots : invisible pour les visiteurs. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Site internet
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Prénom *
          <input name="firstName" required maxLength={80} autoComplete="given-name" defaultValue={v.firstName} className={field} aria-invalid={!!e.firstName} />
          {error("firstName")}
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Nom *
          <input name="lastName" required maxLength={80} autoComplete="family-name" defaultValue={v.lastName} className={field} aria-invalid={!!e.lastName} />
          {error("lastName")}
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Téléphone ou WhatsApp *
          <input name="phone" type="tel" inputMode="tel" required autoComplete="tel" defaultValue={v.phone} className={field} aria-invalid={!!e.phone} />
          {error("phone")}
        </label>
        <label className="block text-sm font-medium text-slate-700">
          E-mail
          <input name="email" type="email" autoComplete="email" defaultValue={v.email} className={field} aria-invalid={!!e.email} />
          {error("email")}
        </label>
        {services.length > 0 && (
          <label className="block text-sm font-medium text-slate-700">
            Service souhaité
            <select key={`service-${v.service ?? ""}`} name="service" defaultValue={v.service ?? ""} className={field}>
              <option value="">Choisir…</option>
              {services.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value="Autre">Autre</option>
            </select>
          </label>
        )}
        {bureaux.length > 1 && (
          <label className="block text-sm font-medium text-slate-700">
            Bureau qui vous arrange
            <select key={`bureau-${v.bureauId ?? ""}`} name="bureauId" defaultValue={v.bureauId ?? ""} className={field}>
              <option value="">Peu importe</option>
              {bureaux.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.city && b.city !== b.name ? ` (${b.city})` : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        {bureaux.length === 1 && <input type="hidden" name="bureauId" value={bureaux[0]!.id} />}
        <label className="block text-sm font-medium text-slate-700">
          Destination
          <input name="destination" maxLength={120} defaultValue={v.destination} className={field} />
        </label>
      </div>
      <label className="block text-sm font-medium text-slate-700">
        Votre projet
        <textarea name="message" rows={4} maxLength={1500} defaultValue={v.message} className={field} aria-invalid={!!e.message} />
        {error("message")}
      </label>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          key={`consent-${v.consent ?? ""}`}
          type="checkbox"
          name="consent"
          required
          defaultChecked={v.consent === "on"}
          className="mt-1 size-4 accent-[var(--p)]"
        />
        <span>
          J&apos;accepte que {agencyName} utilise ces informations pour me recontacter au sujet de ma demande. *
          {error("consent")}
        </span>
      </label>
      {state.message && !state.ok && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || preview}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[var(--a)] px-6 text-base font-semibold text-[var(--on-a)] shadow-sm transition hover:brightness-95 disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Envoi…" : ctaLabel || "Envoyer ma demande"}
      </button>
      {preview && <p className="text-sm text-slate-500">Aperçu : le formulaire fonctionnera une fois le site publié.</p>}
    </form>
  );
}
