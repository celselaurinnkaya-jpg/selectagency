"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "cn";
import { describedBy, FormField, FormMessage } from "@/components/shared/form";
import { ProBadge } from "@/components/shared/FeatureLocked";
import type { EmailSettings } from "@/lib/domain/types";
import { initialFormState, type FormState } from "@/lib/form-state";
import { retryQueuedEmailsAction, saveEmailSettingsAction } from "./email-actions";

type ToggleKey = "notifyPaymentConfirmed" | "notifyAppointmentReminder" | "notifyCaseStatus" | "notifyMissingDocuments";

// `pro` : e-mail automatique inclus dans les formules PRO et BUSINESS (pas dans STARTER).
const TOGGLES: { key: ToggleKey; title: string; detail: string; pro?: boolean }[] = [
  {
    key: "notifyPaymentConfirmed",
    title: "Confirmation de paiement avec le reçu PDF",
    detail: "Envoyée dès qu'un paiement est confirmé, jamais lorsqu'il est seulement annoncé « à vérifier ».",
  },
  {
    key: "notifyAppointmentReminder",
    pro: true,
    title: "Rappel de rendez-vous la veille",
    detail: "Prévient le client la veille d'un rendez-vous prévu ou confirmé avec l'agence (pas pour les dates limites internes).",
  },
  {
    key: "notifyCaseStatus",
    pro: true,
    title: "Changement d'état du dossier",
    detail: "Informe le client d'une décision (accordé, refusé, clôturé) ou d'une action qu'il doit faire.",
  },
  {
    key: "notifyMissingDocuments",
    pro: true,
    title: "Relance des pièces manquantes",
    detail:
      "Quand un dossier attend le client depuis 3 jours et que des pièces obligatoires manquent : une relance par semaine au plus, 3 au total. Le bouton « Relancer par e-mail » du dossier reste toujours disponible.",
  },
];

// Champs contrôlés et envoi par onSubmit : React 19 ne remet pas le formulaire à zéro après l'enregistrement.
/** `autoLocked` : formule STARTER, les e-mails automatiques réservés à PRO sont grisés (et s'enregistrent désactivés). */
export function EmailSettingsForm({ settings, agencyName, autoLocked = false }: { settings: EmailSettings; agencyName: string; autoLocked?: boolean }) {
  const [state, setState] = useState<FormState>(initialFormState);
  const [saving, startTransition] = useTransition();
  const [senderName, setSenderName] = useState(settings.senderName);
  const [replyToEmail, setReplyToEmail] = useState(settings.replyToEmail);
  const [toggles, setToggles] = useState<Record<ToggleKey, boolean>>({
    notifyPaymentConfirmed: settings.notifyPaymentConfirmed,
    notifyAppointmentReminder: settings.notifyAppointmentReminder && !autoLocked,
    notifyCaseStatus: settings.notifyCaseStatus && !autoLocked,
    notifyMissingDocuments: settings.notifyMissingDocuments && !autoLocked,
  });
  const e = state.fieldErrors ?? {};

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData();
    data.set("senderName", senderName);
    data.set("replyToEmail", replyToEmail);
    for (const { key } of TOGGLES) {
      if (toggles[key]) data.set(key, "on");
    }
    startTransition(async () => {
      setState(await saveEmailSettingsAction(initialFormState, data));
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="email-sender-name"
          label="Nom d'expéditeur affiché"
          hint={`Vide : « ${agencyName} via SELECT Agency ».`}
          error={e.senderName}
        >
          <Input
            id="email-sender-name"
            value={senderName}
            onChange={(event) => setSenderName(event.target.value)}
            placeholder={agencyName}
            maxLength={120}
            {...describedBy("email-sender-name", e.senderName, "hint")}
          />
        </FormField>
        <FormField
          id="email-reply-to"
          label="Adresse de réponse"
          hint="Quand un client répond à un e-mail, sa réponse arrive à cette adresse."
          error={e.replyToEmail}
        >
          <Input
            id="email-reply-to"
            type="email"
            value={replyToEmail}
            onChange={(event) => setReplyToEmail(event.target.value)}
            placeholder="contact@votre-agence.com"
            maxLength={254}
            {...describedBy("email-reply-to", e.replyToEmail, "hint")}
          />
        </FormField>
      </div>

      <fieldset className="space-y-3 border-t border-border pt-4">
        <legend className="text-sm font-semibold text-navy-800">E-mails automatiques aux clients</legend>
        <p className="text-sm text-slate-600">
          Tous sont désactivés au départ. Cochez ceux que vos clients doivent recevoir automatiquement.
        </p>
        {TOGGLES.map((t) => {
          const locked = autoLocked && t.pro;
          return (
            <label
              key={t.key}
              className={cn(
                "flex min-h-11 items-start gap-3 rounded-lg border p-3 text-sm transition",
                locked
                  ? "cursor-not-allowed border-dashed border-slate-300 bg-surface"
                  : toggles[t.key]
                    ? "cursor-pointer border-navy-800 bg-navy-50 ring-1 ring-navy-800"
                    : "cursor-pointer border-slate-200 bg-white hover:border-navy-200",
              )}
            >
              <input
                type="checkbox"
                checked={toggles[t.key]}
                disabled={locked}
                onChange={(event) => setToggles((prev) => ({ ...prev, [t.key]: event.target.checked }))}
                className="mt-0.5 size-4 accent-navy-800"
              />
              <span>
                <span className={cn("flex flex-wrap items-center gap-2 font-medium", locked ? "text-slate-500" : "text-slate-900")}>
                  {t.title}
                  {locked && <ProBadge />}
                </span>
                <span className="block text-slate-600">{t.detail}</span>
              </span>
            </label>
          );
        })}
        <p className="text-xs text-slate-500">
          Les e-mails de compte (confirmation d&apos;adresse, mot de passe) et les alertes d&apos;abonnement SELECT Agency
          partent toujours : ils ne dépendent pas de ces réglages.
        </p>
      </fieldset>

      <FormMessage message={state.message} tone={state.ok ? "success" : "error"} />
      <Button type="submit" variant="accent" disabled={saving}>
        {saving ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  );
}

export function FlushEmailOutboxButton({ queuedCount }: { queuedCount: number }) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<FormState | null>(null);

  if (queuedCount === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            setFeedback(await retryQueuedEmailsAction());
          });
        }}
      >
        {pending ? "Envoi en cours…" : `Envoyer les ${queuedCount} e-mail(s) en attente`}
      </Button>
      <FormMessage message={feedback?.message} tone={feedback?.ok ? "success" : "error"} />
    </div>
  );
}
