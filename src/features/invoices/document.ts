import type { Agency, Client, Invoice, InvoiceImageKind, InvoiceSettings, InvoiceStatus, TravelCase } from "@/lib/domain/types";
import { caseKindLabel } from "@/features/workflows/templates";
import type { InvoiceLine } from "./totals";

// Contenu d'une facture tel qu'il est imprimé : le même objet alimente l'aperçu en direct du
// formulaire, la page imprimable et le PDF, pour que les trois soient identiques.

export interface InvoiceParty {
  name: string;
  /** Lignes sous le nom : adresse, téléphone, e-mail… (vides retirées). */
  lines: string[];
}

export interface InvoiceDocumentData {
  /** Absent tant que la facture n'est pas enregistrée (numéro attribué à l'enregistrement). */
  number?: string;
  status: InvoiceStatus;
  overdue: boolean;
  issueDate: string;
  dueDate: string;
  currency: string;
  issuer: InvoiceParty;
  recipient: InvoiceParty;
  caseLabel?: string;
  items: (InvoiceLine & { label: string })[];
  discountLabel?: string;
  discountMinor: number;
  notes?: string;
  paymentDetails?: string;
  footerNote?: string;
  signatoryName?: string;
  isDemo: boolean;
}

export const IMAGE_KINDS: InvoiceImageKind[] = ["logo", "stamp", "signature"];

export const IMAGE_LABELS: Record<InvoiceImageKind, string> = {
  logo: "Logo",
  stamp: "Cachet",
  signature: "Signature",
};

/** Adresses des images d'une facture (page protégée de l'application, jamais un lien public). */
export type InvoiceImages = Partial<Record<InvoiceImageKind, string>>;

export function imagePath(settings: InvoiceSettings, kind: InvoiceImageKind): string | undefined {
  return { logo: settings.logoPath, stamp: settings.stampPath, signature: settings.signaturePath }[kind];
}

/** Le nom du fichier change à chaque envoi : il sert de version pour le cache du navigateur. */
export function imageUrls(settings: InvoiceSettings): InvoiceImages {
  const urls: InvoiceImages = {};
  for (const kind of IMAGE_KINDS) {
    const path = imagePath(settings, kind);
    if (path) urls[kind] = `/finance/invoices/images/${kind}?v=${encodeURIComponent(path.split("/").pop() ?? "")}`;
  }
  return urls;
}

export function issuerParty(agency: Agency, settings: InvoiceSettings): InvoiceParty {
  return {
    name: settings.legalName || agency.name,
    lines: [settings.address || agency.city, settings.phone, settings.email, settings.taxId].filter(Boolean),
  };
}

export type InvoiceClient = Pick<Client, "id" | "reference" | "firstName" | "lastName" | "email" | "phoneE164" | "address" | "city">;

export function recipientParty(client: InvoiceClient): InvoiceParty {
  return {
    name: `${client.firstName} ${client.lastName}`,
    lines: [client.address || client.city, client.phoneE164, client.email ?? "", `Client ${client.reference}`].filter(Boolean),
  };
}

/** Facture émise dont l'échéance (jour du fuseau de l'agence) est passée. */
export const isOverdue = (status: InvoiceStatus, dueDate: string, today: string) => status === "issued" && dueDate < today;

/** « 2026-11-02 » → « 2 novembre 2026 ». */
export function formatDay(day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "—";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
}

/** « DOS-2026-00001 — Master Lyon (Études en France — Campus France) » : la procédure d'études quand il y en a une. */
export const caseLabel = (travelCase: Pick<TravelCase, "reference" | "title"> & Partial<Pick<TravelCase, "templateKey">>) => {
  const procedure = caseKindLabel(travelCase.templateKey, "");
  return `${travelCase.reference} — ${travelCase.title}${procedure ? ` (${procedure})` : ""}`;
};

/** Facture enregistrée, prête à afficher ou à mettre en PDF. */
export function documentFromInvoice(input: {
  invoice: Invoice;
  client: InvoiceClient;
  travelCase?: Pick<TravelCase, "reference" | "title">;
  agency: Agency;
  settings: InvoiceSettings;
  isDemo: boolean;
  today: string;
}): InvoiceDocumentData {
  const { invoice, settings } = input;
  return {
    number: invoice.number,
    status: invoice.status,
    overdue: isOverdue(invoice.status, invoice.dueDate, input.today),
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    currency: invoice.currency,
    issuer: issuerParty(input.agency, settings),
    recipient: recipientParty(input.client),
    caseLabel: input.travelCase && caseLabel(input.travelCase),
    items: invoice.items.map(({ label, quantity, unitAmountMinor, taxRate }) => ({ label, quantity, unitAmountMinor, taxRate })),
    discountLabel: invoice.discountLabel,
    discountMinor: invoice.discountMinor,
    notes: invoice.notes,
    paymentDetails: invoice.paymentDetails,
    footerNote: settings.footerNote || undefined,
    signatoryName: settings.signatoryName || undefined,
    isDemo: input.isDemo,
  };
}

/** « Remise », « Remise fidélité », « Remise (Rentrée 2026) » : sans répéter le mot. */
export const discountTitle = (label?: string) => (!label ? "Remise" : /^remise\b/i.test(label) ? label : `Remise (${label})`);

/** Mention imprimée en filigrane selon l'état. */
export function watermark(status: InvoiceStatus): string | undefined {
  return status === "draft" ? "BROUILLON" : status === "cancelled" ? "ANNULÉE" : undefined;
}
