"use client";

import { useState } from "react";
import { Download, Mail, MessageCircle, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/shared/form";
import { logDocumentSharedAction, type SharedDocumentKind } from "./actions";
import { EmailDocumentButton } from "./EmailDocumentButton";

type Channel = "whatsapp" | "email";

/**
 * Actions sur un document remis au client (reçu, devis, récapitulatif, confirmation), comme pour une facture. WhatsApp : sur téléphone, le PDF est partagé
 * directement (feuille de partage du système) ; sur ordinateur, le PDF est téléchargé et WhatsApp
 * ou la messagerie s'ouvre avec le message, à compléter en joignant le fichier (noté « préparé, envoi manuel »).
 * E-mail : quand l'envoi direct est activé sur le serveur (directEmail), le document part directement au
 * client, PDF joint, après confirmation de l'adresse.
 */
export function DocumentToolbar({
  kind,
  id,
  pdfUrl,
  number,
  voided = false,
  phoneDigits,
  email,
  message,
  subject,
  directEmail = false,
  withFinance,
}: {
  kind: SharedDocumentKind;
  id: string;
  pdfUrl: string;
  number: string;
  /** Document annulé : impression et PDF seulement, pas d'envoi. */
  voided?: boolean;
  phoneDigits?: string;
  email?: string;
  message: string;
  subject: string;
  /** Envoi direct par e-mail possible sur ce serveur (Brevo configuré). */
  directEmail?: boolean;
  /** Récapitulatif : le PDF envoyé contient-il la situation financière ? */
  withFinance?: boolean;
}) {
  const [busy, setBusy] = useState<Channel | null>(null);
  const [note, setNote] = useState<{ text: string; tone: "success" | "error" } | null>(null);

  async function send(channel: Channel) {
    setBusy(channel);
    setNote(null);
    try {
      const response = await fetch(pdfUrl);
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      const file = new File([blob], `${number}.pdf`, { type: "application/pdf" });
      const logged = () => logDocumentSharedAction(kind, id, channel).catch(() => false);
      const touch = window.matchMedia("(pointer: coarse)").matches;
      if (channel === "whatsapp" && touch && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text: message });
          const noted = await logged();
          setNote({ text: `Document transmis à l'application choisie.${noted ? " L'envoi est noté dans les communications du client." : ""}`, tone: "success" });
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
      if (channel === "whatsapp") {
        window.open(`https://wa.me/${phoneDigits ?? ""}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
      } else {
        const mail = document.createElement("a");
        mail.href = `mailto:${email ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
        mail.click();
      }
      const noted = await logged();
      setNote({
        text: `PDF téléchargé (${number}.pdf) et ${channel === "whatsapp" ? "WhatsApp ouvert" : "votre messagerie ouverte"} avec le message : joignez le fichier, puis envoyez.${noted ? " L'envoi est noté dans les communications du client." : ""}`,
        tone: "success",
      });
    } catch {
      setNote({ text: "Le PDF n'a pas pu être préparé. Vérifiez votre connexion internet, puis réessayez.", tone: "error" });
    } finally {
      setBusy(null);
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
        {!voided && (
          <>
            <Button type="button" onClick={() => send("whatsapp")} disabled={busy !== null} className="bg-emerald-700 text-white hover:bg-emerald-800">
              <MessageCircle aria-hidden />
              {busy === "whatsapp" ? "Préparation du PDF…" : "Envoyer par WhatsApp"}
            </Button>
            {directEmail ? (
              <EmailDocumentButton kind={kind} id={id} number={number} email={email} withFinance={withFinance} />
            ) : (
              <Button type="button" variant="outline" onClick={() => send("email")} disabled={busy !== null}>
                <Mail aria-hidden />
                {busy === "email" ? "Préparation du PDF…" : "Envoyer par e-mail"}
              </Button>
            )}
          </>
        )}
      </div>
      {note && <FormMessage message={note.text} tone={note.tone} />}
      {!voided && !phoneDigits && <p className="text-xs text-slate-500">Client fictif ou sans numéro : WhatsApp vous laissera choisir le destinataire.</p>}
      {!voided && !email && (
        <p className="text-xs text-slate-500">
          {directEmail
            ? "Aucune adresse e-mail sur la fiche du client : ajoutez-la pour lui envoyer le document par e-mail."
            : "Aucune adresse e-mail sur la fiche du client : vous la saisirez dans votre messagerie."}
        </p>
      )}
    </div>
  );
}
