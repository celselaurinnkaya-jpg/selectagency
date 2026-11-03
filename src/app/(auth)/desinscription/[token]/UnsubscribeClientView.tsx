"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, MailCheck, MailQuestion, MailX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleClientEmailSubscriptionAction, type UnsubscribeResult } from "./actions";

const CARD = "rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_3px_rgba(2,55,100,0.1)]";

export function UnsubscribeClientView({ token }: { token: string }) {
  // Rien n'est fait tant que la personne n'a pas cliqué.
  const [state, setState] = useState<UnsubscribeResult | null>(null);
  const [pending, startTransition] = useTransition();

  function apply(resubscribe: boolean) {
    startTransition(async () => {
      setState(await toggleClientEmailSubscriptionAction(token, resubscribe));
    });
  }

  if (state === null) {
    return (
      <div className={CARD}>
        <div className="mb-3 inline-flex size-10 items-center justify-center rounded-md bg-navy-800 text-citron-400">
          <MailQuestion className="size-5" aria-hidden />
        </div>
        <h1 className="text-lg font-bold text-navy-800">Ne plus recevoir les rappels par e-mail ?</h1>
        <p className="mt-2 text-sm text-slate-700">
          Vous ne recevrez plus les rappels de rendez-vous, les relances de pièces ni les nouvelles de votre dossier envoyés
          automatiquement par votre agence.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Les reçus de vos paiements et les documents que vous demandez à votre conseiller vous seront toujours envoyés.
        </p>
        <div className="mt-5">
          <Button type="button" disabled={pending} onClick={() => apply(false)} className="min-h-10">
            {pending ? "Enregistrement…" : "Oui, me désinscrire"}
          </Button>
        </div>
      </div>
    );
  }

  if (!state.ok) {
    return (
      <div className={CARD}>
        <div className="mb-3 inline-flex size-10 items-center justify-center rounded-md bg-red-50 text-red-700">
          <MailX className="size-5" aria-hidden />
        </div>
        <h1 className="text-lg font-bold text-navy-800">Lien invalide ou expiré</h1>
        <p className="mt-2 text-sm text-slate-600">{state.error ?? "Ce lien n'est plus valide."}</p>
      </div>
    );
  }

  return (
    <div className={CARD}>
      <div className="mb-3 inline-flex size-10 items-center justify-center rounded-md bg-navy-800 text-citron-400">
        {state.unsubscribed ? <CheckCircle2 className="size-5" aria-hidden /> : <MailCheck className="size-5" aria-hidden />}
      </div>
      <h1 className="text-lg font-bold text-navy-800">
        {state.unsubscribed ? "Désinscription prise en compte" : "Rappels par e-mail réactivés"}
      </h1>
      <p className="mt-2 text-sm text-slate-700">
        {state.unsubscribed ? (
          <>
            Bonjour <strong>{state.firstName}</strong>, vous ne recevrez plus les rappels ni les relances automatiques de{" "}
            <strong>{state.agencyName}</strong>.
          </>
        ) : (
          <>
            Bonjour <strong>{state.firstName}</strong>, vous recevrez de nouveau les rappels et les nouvelles de votre dossier de{" "}
            <strong>{state.agencyName}</strong>.
          </>
        )}
      </p>
      <p className="mt-2 text-xs text-slate-500">
        Les reçus de vos paiements et les documents que vous demandez à votre conseiller vous seront toujours envoyés.
      </p>
      <div className="mt-5">
        <Button type="button" variant="outline" disabled={pending} onClick={() => apply(Boolean(state.unsubscribed))} className="min-h-10">
          {pending ? "Enregistrement…" : state.unsubscribed ? "Me réinscrire" : "Me désinscrire"}
        </Button>
      </div>
    </div>
  );
}
