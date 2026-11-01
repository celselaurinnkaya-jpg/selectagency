"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { Download, MessageCircle, Pencil, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/shared/form";
import type { InvoiceStatus } from "@/lib/domain/types";
import { initialFormState } from "@/lib/form-state";
import { deleteInvoiceAction, logInvoiceSharedAction, setInvoiceStatusAction } from "./actions";

const NEXT: Record<InvoiceStatus, { status: "issued" | "paid" | "cancelled"; label: string; variant: "accent" | "outline" | "destructive" }[]> = {
  draft: [{ status: "issued", label: "Émettre la facture", variant: "accent" }],
  issued: [
    { status: "paid", label: "Marquer comme payée", variant: "accent" },
    { status: "cancelled", label: "Annuler la facture", variant: "outline" },
  ],
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
}: {
  invoiceId: string;
  number: string;
  status: InvoiceStatus;
  canWrite: boolean;
  canDelete: boolean;
  phoneDigits?: string;
  message: string;
}) {
  const [statusState, statusAction, statusPending] = useActionState(setInvoiceStatusAction, initialFormState);
  const [deleteError, setDeleteError] = useState<string>();
  const [deleting, startDelete] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [note, setNote] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const pdfUrl = `/finance/invoices/${invoiceId}/pdf`;
  const editable = canWrite && (status === "draft" || status === "issued");

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
        {editable && (
          <Button asChild variant="outline">
            <Link href={`/finance/invoices/${invoiceId}/edit`}>
              <Pencil aria-hidden />
              Modifier
            </Link>
          </Button>
        )}
        {canDelete && status !== "paid" && !confirmDelete && (
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
          </div>
          <FormMessage message={statusState.message} tone={statusState.ok ? "success" : "error"} />
        </form>
      )}
      {status === "paid" && canWrite && <p className="text-xs text-slate-500">Une facture payée est verrouillée : remettez-la « à payer » pour la corriger.</p>}
    </div>
  );
}
