"use client";

import { useState, useTransition } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/shared/form";
import { missingDocumentNote, type MissingDocumentItem } from "@/lib/email/missing-documents";
import type { FormState } from "@/lib/form-state";
import { sendMissingDocumentsEmailAction } from "./email-actions";

/**
 * « Relancer par e-mail » : le client reçoit la liste des pièces obligatoires qui manquent encore.
 * L'agent voit l'adresse et la liste exacte avant d'envoyer ; un identifiant tiré à l'ouverture de la
 * confirmation garantit qu'un double clic n'envoie qu'un seul e-mail.
 */
export function MissingDocumentsEmailButton({
  caseId,
  email,
  optedOut,
  items,
}: {
  caseId: string;
  /** Adresse e-mail de la fiche du client (absente : relance impossible). */
  email?: string;
  /** Le client s'est désinscrit des relances par e-mail. */
  optedOut?: boolean;
  items: MissingDocumentItem[];
}) {
  const [requestId, setRequestId] = useState<string | null>(null);
  const [result, setResult] = useState<FormState | null>(null);
  const [sending, startSending] = useTransition();

  const blocked = !email ? "Aucune adresse e-mail sur la fiche du client." : optedOut ? "Ce client s'est désinscrit des relances par e-mail." : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={Boolean(blocked) || sending || requestId !== null}
          title={blocked ?? undefined}
          onClick={() => {
            setResult(null);
            setRequestId(crypto.randomUUID());
          }}
        >
          <Mail aria-hidden />
          Relancer par e-mail
        </Button>
        {blocked && <p className="text-sm text-slate-600">{blocked}</p>}
      </div>

      {requestId && email && (
        <div className="space-y-3 rounded-xl border border-navy-200 bg-navy-50 p-4">
          <p className="text-sm text-navy-900">
            Cette liste va être envoyée à <strong className="break-all">{email}</strong>, au nom de votre agence :
          </p>
          <ul className="space-y-1.5 text-sm">
            {items.map((item) => (
              <li key={item.label}>
                <span className="font-medium text-slate-900">{item.label}</span>
                <span className="block text-slate-600">{missingDocumentNote(item.status, item.comment)}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={sending}
              onClick={() =>
                startSending(async () => {
                  const res = await sendMissingDocumentsEmailAction({ caseId, requestId });
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

      {result?.message && <FormMessage message={result.message} tone={result.ok ? "success" : "error"} />}
    </div>
  );
}
