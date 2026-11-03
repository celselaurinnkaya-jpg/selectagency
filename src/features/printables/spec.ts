import type { InvoiceParty } from "@/features/invoices/document";

// Modèle commun des documents remis au client (devis, récapitulatif de dossier, confirmation de
// réservation) : le même objet alimente la page imprimable et le PDF A4, pour qu'ils soient
// identiques. Présentation alignée sur les factures : identité de l'agence, logo, cachet, signature.

export interface SpecColumn {
  label: string;
  align?: "right";
  /** Part de la largeur dans le PDF (les parts d'un tableau font 1 au total). */
  width: number;
}

export type ChecklistState = "done" | "current" | "todo" | "skipped" | "warning";

export type SpecSection =
  | { kind: "table"; title: string; columns: SpecColumn[]; rows: string[][]; total?: { label: string; value: string }; empty?: string }
  | { kind: "checklist"; title: string; items: { label: string; detail?: string; state: ChecklistState }[]; empty?: string }
  | { kind: "amounts"; title: string; rows: { label: string; value: string; strong?: boolean }[] }
  | { kind: "text"; title: string; text: string };

export interface DocumentSpec {
  /** Titre en capitales : « DEVIS », « RÉCAPITULATIF DE DOSSIER »… */
  title: string;
  numberLabel: string;
  number: string;
  issuerTitle: string;
  issuer: InvoiceParty;
  recipientTitle: string;
  recipient: InvoiceParty;
  /** Informations clés, sur deux colonnes (dates, dossier, prestataire…). */
  facts: { label: string; value: string }[];
  sections: SpecSection[];
  signatoryName?: string;
  /** Mentions de bas de page. */
  footer: string[];
  /** Mention en filigrane (« ANNULÉ »…). */
  watermark?: string;
  isDemo: boolean;
}

export const CHECKLIST_LABEL: Record<ChecklistState, string> = {
  done: "Fait",
  current: "En cours",
  todo: "À venir",
  skipped: "Non nécessaire",
  warning: "À fournir",
};
