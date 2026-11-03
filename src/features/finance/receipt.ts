import type { Agency, Charge, InvoiceSettings, Member, Payment, TravelCase } from "@/lib/domain/types";
import { formatDate } from "@/lib/format";
import { caseLabel, issuerParty, recipientParty, type InvoiceClient, type InvoiceParty } from "@/features/invoices/document";

// Reçu tel qu'il est remis au client : le même objet alimente la page imprimable et le PDF (A4).
// Seul un paiement confirmé a un reçu ; logo, cachet, signature et mentions viennent des réglages
// des factures (Paramètres > Factures), pour que reçus et factures de l'agence se ressemblent.

export interface ReceiptLine {
  label: string;
  nature: string;
  amountMinor: number;
}

export interface ReceiptDocumentData {
  number: string;
  paidAtLabel: string;
  currency: string;
  amountMinor: number;
  /** Reste à payer du dossier juste après ce paiement (absent pour les très anciens reçus). */
  balanceAfterMinor?: number;
  issuer: InvoiceParty;
  recipient: InvoiceParty;
  caseLabel: string;
  method: string;
  payerName?: string;
  receivedBy?: string;
  lines: ReceiptLine[];
  /** Reçu annulé : il reste consultable, avec la date, l'auteur et le motif. */
  voided?: { label: string; reason?: string };
  signatoryName?: string;
  footerNote?: string;
  isDemo: boolean;
}

export const RECEIPT_MENTION = "Reçu interne de paiement : il ne constitue pas une facture fiscale.";

export const chargeNature = (charge?: Pick<Charge, "chargeType">) =>
  charge?.chargeType === "third_party" ? "Montant destiné à un tiers" : "Frais de l'agence";

export function documentFromPayment(input: {
  payment: Payment & { receiptNumber: string };
  client: InvoiceClient;
  travelCase: Pick<TravelCase, "reference" | "title"> & Partial<Pick<TravelCase, "templateKey">>;
  charges: Charge[];
  agency: Agency;
  settings: InvoiceSettings;
  receivedBy?: Pick<Member, "fullName">;
  voidedBy?: Pick<Member, "fullName">;
  isDemo: boolean;
}): ReceiptDocumentData {
  const { payment: p, agency } = input;
  const tz = agency.timezone;
  return {
    number: p.receiptNumber,
    paidAtLabel: formatDate(p.paidAt, tz, "dateTime"),
    currency: p.currency,
    amountMinor: p.amountMinor,
    balanceAfterMinor: p.status === "voided" ? undefined : p.balanceAfterMinor,
    issuer: issuerParty(agency, input.settings),
    recipient: recipientParty(input.client),
    caseLabel: caseLabel(input.travelCase),
    method: p.transactionReference ? `${p.methodLabel} — réf. ${p.transactionReference}` : p.methodLabel,
    payerName: p.payerName,
    receivedBy: input.receivedBy?.fullName,
    lines: p.allocations.map((a) => {
      const charge = input.charges.find((c) => c.id === a.chargeId);
      return { label: charge?.label ?? "Prestation", nature: chargeNature(charge), amountMinor: a.amountMinor };
    }),
    voided:
      p.status === "voided"
        ? {
            label: [p.voidedAt && `Le ${formatDate(p.voidedAt, tz, "dateTime")}`, input.voidedBy && `par ${input.voidedBy.fullName}`].filter(Boolean).join(" "),
            reason: p.voidReason,
          }
        : undefined,
    signatoryName: input.settings.signatoryName || undefined,
    footerNote: input.settings.footerNote || undefined,
    isDemo: input.isDemo,
  };
}
