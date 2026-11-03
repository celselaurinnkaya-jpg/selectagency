"use client";

import { useState, useTransition } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/shared/form";
import type { FormState } from "@/lib/form-state";
import { sendDocumentEmailAction, type EmailDocumentKind } from "./email-actions";

/**
 * « Envoyer par e-mail » : le document part directement au client, PDF joint, au nom de l'agence.
 * L'agent voit l'adresse et confirme avant l'envoi. Un identifiant tiré à l'ouverture de la confirmation
 * garantit qu'un double clic n'envoie qu'un seul e-mail.
 */
export function EmailDocumentButton({
  kind,
  id,
  number,
  email,
  withFinance,
}: {
  kind: EmailDocumentKind;
  id: string;
  number: string;
  /** Adresse e-mail de la fiche du client (absente : envoi impossible). */
  email?: string;
  withFinance?: boolean;
}) {
  const [requestId, setRequestId] = useState<string | null>(null);
  const [result, setResult] = useState<FormState | null>(null);
  const [sending, startSending] = useTransition();

  if (!email) {
    return (
      <Button type="button" variant="outline" disabled title="Aucune adresse e-mail sur la fiche du client">
        <Mail aria-hidden />
        Envoyer par e-mail
      </Button>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setResult(null);
          setRequestId(crypto.randomUUID());
        }}
        disabled={sending || requestId !== null}
      >
        <Mail aria-hidden />
        Envoyer par e-mail
      </Button>

      {requestId && (
        <div className="basis-full space-y-3 rounded-xl border border-navy-200 bg-navy-50 p-4">
          <p className="text-sm text-navy-900">
            Le document <strong>{number}.pdf</strong> va être envoyé à <strong className="break-all">{email}</strong>, au nom de votre agence.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={sending}
              onClick={() =>
                startSending(async () => {
                  const res = await sendDocumentEmailAction({ kind, id, requestId, withFinance });
                  setResult(res);
                  setRequestId(null);
                })
              }
            >
              <Mail aria-hidden />
              {sending ? "Envoi en cours…" : "Envoyer maintenant"}
            </Button>
            <Button type="button" variant="ghost" disabled={sending} onClick={() => setRequestId(null)}>
              Annuler
            </Button>
          </div>
        </div>
      )}

      {result?.message && (
        <div className="basis-full">
          <FormMessage message={result.message} tone={result.ok ? "success" : "error"} />
        </div>
      )}
    </>
  );
}
