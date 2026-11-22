"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { Download, MessageCircle, Pencil, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { describedBy, FormField, FormMessage } from "@/components/shared/form";
import { Textarea } from "@/components/ui/textarea";
import type { InvoiceStatus } from "@/lib/domain/types";
import { EmailDocumentButton } from "@/features/printables/EmailDocumentButton";
import { initialFormState } from "@/lib/form-state";
import { deleteInvoiceAction, logInvoiceSharedAction, setInvoiceStatusAction } from "./actions";

const NEXT: Record<InvoiceStatus, { status: "issued" | "paid" | "cancelled"; label: string; variant: "accent" | "outline" | "destructive" }[]> = {
  draft: [{ status: "issued", label: "Émettre la facture", variant: "accent" }],
  // L'annulation a son propre formulaire, avec un motif obligatoire.
  issued: [{ status: "paid", label: "Marquer comme payée", variant: "accent" }],
  paid: [{ status: "issued", label: "Remettre à payer", variant: "outline" }],
  cancelled: [],
};

/**
 * Actions sur une facture. WhatsApp : sur téléphone, le PDF est partagé directement (feuille de
 * partage du système, WhatsApp compris) ; sur ordinateur, le PDF est téléchargé et WhatsApp s'ouvre
 * avec le message, à compléter en joignant le fichier. L'application n'envoie rien elle-même.
 */
export function InvoiceToolbar({
  invoiceId,
  number,
  status,
  canWrite,
  canDelete,
  phoneDigits,
  message,
  email,
  directEmail = false,
}: {
  invoiceId: string;
  number: string;
  status: InvoiceStatus;
  canWrite: boolean;
  canDelete: boolean;
  phoneDigits?: string;
  message: string;
  /** Adresse e-mail de la fiche du client. */
  email?: string;
  /** Envoi direct par e-mail possible sur ce serveur (Brevo configuré). */
  directEmail?: boolean;
}) {
  const [statusState, statusAction, statusPending] = useActionState(setInvoiceStatusAction, initialFormState);
  const [deleteError, setDeleteError] = useState<string>();
  const [deleting, startDelete] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [cancelState, cancelAction, cancelPending] = useActionState(setInvoiceStatusAction, initialFormState);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [note, setNote] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const pdfUrl = `/finance/invoices/${invoiceId}/pdf`;
  const editable = canWrite && status === "draft";

  async function sendWhatsApp() {
    setSharing(true);
    setNote(null);
    try {
      const response = await fetch(pdfUrl);
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      const file = new File([blob], `${number}.pdf`, { type: "application/pdf" });
      const touch = window.matchMedia("(pointer: coarse)").matches;
      if (touch && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text: message });
          await logInvoiceSharedAction(invoiceId);
          setNote({ text: "Facture transmise à l'application choisie. Elle est notée « préparée, envoi manuel » dans l'historique du client.", tone: "success" });
          return;
        } catch (error) {
          if ((error as Error).name === "AbortError") return;
          // Partage refusé par le navigateur : on passe au téléchargement.
        }
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${number}.pdf`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      window.open(`https://wa.me/${phoneDigits ?? ""}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
      await logInvoiceSharedAction(invoiceId);
      setNote({
        text: `PDF téléchargé (${number}.pdf) et WhatsApp ouvert avec le message : joignez le fichier à la conversation (trombone), puis envoyez.`,
        tone: "success",
      });
    } catch {
      setNote({ text: "Le PDF n'a pas pu être préparé. Vérifiez votre connexion internet, puis réessayez.", tone: "error" });
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="space-y-3 print:hidden">
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => window.print()}>
          <Printer aria-hidden />
          Imprimer
        </Button>
        <Button asChild variant="outline">
          <a href={pdfUrl} download={`${number}.pdf`}>
            <Download aria-hidden />
            Télécharger le PDF
          </a>
        </Button>
        <Button type="button" onClick={sendWhatsApp} disabled={sharing} className="bg-emerald-700 text-white hover:bg-emerald-800">
          <MessageCircle aria-hidden />
          {sharing ? "Préparation du PDF…" : "Envoyer par WhatsApp"}
        </Button>
        {/* Une facture brouillon ou annulée ne part pas par e-mail. */}
        {directEmail && (status === "issued" || status === "paid") && (
          <EmailDocumentButton kind="invoice" id={invoiceId} number={number} email={email} />
        )}
        {editable && (
          <Button asChild variant="outline">
            <Link href={`/finance/invoices/${invoiceId}/edit`}>
              <Pencil aria-hidden />
              Modifier
            </Link>
          </Button>
        )}
        {canDelete && status === "draft" && !confirmDelete && (
          <Button type="button" variant="destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 aria-hidden />
            Supprimer
          </Button>
        )}
      </div>
      {note && <FormMessage message={note.text} tone={note.tone} />}
      {!phoneDigits && <p className="text-xs text-slate-500">Client fictif ou sans numéro : WhatsApp vous laissera choisir le destinataire.</p>}

      {confirmDelete && (
        <form
          className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            startDelete(async () => {
              const result = await deleteInvoiceAction(invoiceId);
              // Chargement complet de la liste (même raison que pour l'enregistrement d'une facture).
              if (result.ok && result.redirectTo) window.location.assign(result.redirectTo);
              else setDeleteError(result.message);
            });
          }}
        >
          <p className="text-sm text-red-900">
            Supprimer définitivement la facture <strong>{number}</strong> ? Son numéro ne sera pas réutilisé et la suppression reste notée dans
            l&apos;historique du client.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="destructive" disabled={deleting}>
              {deleting ? "Suppression…" : "Confirmer la suppression"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>
              Annuler
            </Button>
          </div>
          <FormMessage message={deleteError} />
        </form>
      )}

      {canWrite && NEXT[status].length > 0 && (
        <form action={statusAction} className="space-y-2">
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <div className="flex flex-wrap gap-2">
            {NEXT[status].map((n) => (
              <Button key={n.status} type="submit" name="status" value={n.status} variant={n.variant} size="sm" disabled={statusPending}>
                {n.label}
              </Button>
            ))}
            {status === "issued" && !confirmCancel && (
              <Button type="button" variant="outline" size="sm" onClick={() => setConfirmCancel(true)}>
                Annuler la facture
              </Button>
            )}
          </div>
          <FormMessage message={statusState.message} tone={statusState.ok ? "success" : "error"} />
        </form>
      )}

      {canWrite && status === "issued" && confirmCancel && (
        <form action={cancelAction} className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-4">
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <input type="hidden" name="status" value="cancelled" />
          <FormField id="cancel-reason" label="Motif de l'annulation" required error={cancelState.fieldErrors?.reason}>
            <Textarea
              id="cancel-reason"
              name="reason"
              rows={2}
              required
              minLength={5}
              maxLength={300}
              placeholder="Ex. : montant erroné, facture refaite sous le numéro suivant."
              {...describedBy("cancel-reason", cancelState.fieldErrors?.reason)}
            />
          </FormField>
          <p className="text-xs text-red-900">
            La facture <strong>{number}</strong> restera visible, marquée « annulée », avec son numéro. Le motif est noté dans l&apos;historique du
            client.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="destructive" size="sm" disabled={cancelPending}>
              {cancelPending ? "Annulation…" : "Confirmer l'annulation"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmCancel(false)}>
              Garder la facture
            </Button>
          </div>
          <FormMessage message={cancelState.ok ? undefined : cancelState.message} />
        </form>
      )}

      {status === "issued" && canWrite && (
        <p className="text-xs text-slate-500">Facture émise : elle ne se modifie plus. En cas d&apos;erreur, annulez-la avec un motif, puis créez une nouvelle facture.</p>
      )}
      {status === "paid" && canWrite && (
        <p className="text-xs text-slate-500">
          Une facture payée est verrouillée. Si elle a été marquée payée par erreur, remettez-la « à payer ». Pour corriger son contenu, annulez-la
          avec un motif et créez-en une nouvelle.
        </p>
      )}
    </div>
  );
}
