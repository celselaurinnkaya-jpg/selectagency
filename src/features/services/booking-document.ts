import type { Agency, InvoiceSettings, ServiceBooking, TravelCase } from "@/lib/domain/types";
import { formatDate, formatMoney } from "@/lib/format";
import { caseLabel, formatDay, issuerParty, recipientParty, type InvoiceClient } from "@/features/invoices/document";
import type { DocumentSpec } from "@/features/printables/spec";

// Confirmation de réservation remise au client : ce que l'agence a obtenu pour lui (hébergement,
// billet, assurance…), d'après les informations du prestataire.

export const BOOKING_MENTION =
  "Confirmation établie par l'agence d'après les informations transmises par le prestataire. Conservez-la et présentez-la si on vous la demande.";

export function bookingSpec(input: {
  booking: ServiceBooking;
  serviceName: string;
  client: InvoiceClient;
  travelCase?: Pick<TravelCase, "reference" | "title"> & Partial<Pick<TravelCase, "templateKey">>;
  agency: Agency;
  settings: InvoiceSettings;
  isDemo: boolean;
}): DocumentSpec {
  const { booking: b, agency } = input;
  return {
    title: "CONFIRMATION DE RÉSERVATION",
    numberLabel: "N° de confirmation",
    number: b.number,
    issuerTitle: "Établie par",
    issuer: issuerParty(agency, input.settings),
    recipientTitle: "Au nom de",
    recipient: recipientParty(input.client),
    facts: [
      { label: "Service", value: input.serviceName },
      { label: "Prestataire", value: b.provider || "—" },
      { label: "Référence de réservation", value: b.reference || "—" },
      { label: "Lieu", value: b.place || "—" },
      { label: "Du", value: b.startDate ? formatDay(b.startDate) : "—" },
      { label: "Au", value: b.endDate ? formatDay(b.endDate) : "—" },
      ...(input.travelCase ? [{ label: "Dossier", value: caseLabel(input.travelCase) }] : []),
      { label: "Établie le", value: formatDate(b.createdAt, agency.timezone) },
    ],
    sections: [
      ...(b.details ? [{ kind: "text" as const, title: "Détails", text: b.details }] : []),
      ...(b.amountMinor !== undefined && b.currency
        ? [{ kind: "amounts" as const, title: "Montant", rows: [{ label: "Montant de la réservation", value: formatMoney(b.amountMinor, b.currency), strong: true }] }]
        : []),
    ],
    signatoryName: input.settings.signatoryName || undefined,
    footer: [BOOKING_MENTION, ...(input.settings.footerNote ? [input.settings.footerNote] : [])],
    isDemo: input.isDemo,
  };
}
