import type { Agency, InvoiceSettings, Member, Quote, TravelCase } from "@/lib/domain/types";
import { formatDate, formatMoney } from "@/lib/format";
import { caseLabel, issuerParty, recipientParty, type InvoiceClient } from "@/features/invoices/document";
import type { DocumentSpec } from "@/features/printables/spec";

// Devis remis au client : même présentation que les factures (identité, logo, cachet, signature).

export const QUOTE_MENTION =
  "Les montants destinés à des tiers (frais officiels, établissements…) sont reversés par l'agence ; leur montant final dépend de l'organisme. Ce devis ne garantit aucune décision des autorités.";

export function quoteSpec(input: {
  quote: Quote;
  total: number;
  client: InvoiceClient;
  travelCase: Pick<TravelCase, "reference" | "title"> & Partial<Pick<TravelCase, "templateKey">>;
  agency: Agency;
  settings: InvoiceSettings;
  author?: Pick<Member, "fullName">;
  isDemo: boolean;
}): DocumentSpec {
  const { quote: q, agency } = input;
  const money = (amount: number) => formatMoney(amount, q.currency);
  return {
    title: "DEVIS",
    numberLabel: "N° de devis",
    number: q.reference,
    issuerTitle: "Établi par",
    issuer: issuerParty(agency, input.settings),
    recipientTitle: "Établi pour",
    recipient: recipientParty(input.client),
    facts: [
      { label: "Date", value: formatDate(q.createdAt, agency.timezone) },
      { label: "Valable jusqu'au", value: q.validUntil ? formatDate(q.validUntil, agency.timezone) : "Non précisé" },
      { label: "Dossier", value: caseLabel(input.travelCase) },
      { label: "Conseiller", value: input.author?.fullName ?? "—" },
    ],
    sections: [
      {
        kind: "table",
        title: "Prestations proposées",
        columns: [
          { label: "Désignation", width: 0.42 },
          { label: "Nature", width: 0.2 },
          { label: "Qté", align: "right", width: 0.07 },
          { label: "Prix unit.", align: "right", width: 0.15 },
          { label: "Montant", align: "right", width: 0.16 },
        ],
        rows: q.items.map((item) => [
          item.label,
          item.chargeType === "agency_fee" ? "Frais de l'agence" : "Pour un tiers",
          String(item.quantity),
          money(item.unitAmountMinor),
          money(item.quantity * item.unitAmountMinor),
        ]),
        total: { label: "Total", value: money(input.total) },
      },
      ...(q.notes ? [{ kind: "text" as const, title: "Conditions", text: q.notes }] : []),
    ],
    signatoryName: input.settings.signatoryName || undefined,
    footer: [QUOTE_MENTION, ...(input.settings.footerNote ? [input.settings.footerNote] : [])],
    watermark: q.status === "cancelled" ? "ANNULÉ" : q.status === "refused" ? "REFUSÉ" : undefined,
    isDemo: input.isDemo,
  };
}
