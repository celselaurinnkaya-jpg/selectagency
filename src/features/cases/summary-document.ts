import type { Agency, Appointment, CaseStep, DocumentRequirement, InvoiceSettings, RequirementStatus, TravelCase } from "@/lib/domain/types";
import { countryName } from "@/lib/countries";
import { APPOINTMENT_KIND, CASE_STATUS, CATEGORY_LABELS } from "@/lib/domain/labels";
import { formatDate, formatMoney } from "@/lib/format";
import { issuerParty, recipientParty, type InvoiceClient } from "@/features/invoices/document";
import type { CaseFinance } from "@/features/finance/calculations";
import type { ChecklistState, DocumentSpec, SpecSection } from "@/features/printables/spec";
import { caseKindLabel } from "@/features/workflows/templates";

// Récapitulatif de dossier remis au client (ou à un tiers) : où en est la démarche, les pièces, les
// rendez-vous et, au choix de l'agence à chaque fois, la situation financière.

export const CASE_SUMMARY_MENTION =
  "Document de suivi établi par l'agence à la date indiquée : il ne constitue ni une facture ni un reçu. L'agence ne garantit aucune décision des autorités ou des établissements.";

const REQUIREMENT_STATE: Record<RequirementStatus, { state: ChecklistState; label: string }> = {
  validated: { state: "done", label: "Validée" },
  received: { state: "done", label: "Reçue" },
  to_verify: { state: "current", label: "En vérification" },
  to_correct: { state: "warning", label: "À corriger" },
  expired: { state: "warning", label: "Expirée" },
  not_received: { state: "warning", label: "À fournir" },
  waived: { state: "skipped", label: "Non nécessaire" },
};

export function caseSummarySpec(input: {
  travelCase: TravelCase;
  client: InvoiceClient;
  steps: CaseStep[];
  requirements: DocumentRequirement[];
  appointments: Appointment[];
  finance?: CaseFinance;
  advisor?: string;
  agency: Agency;
  settings: InvoiceSettings;
  now: Date;
  isDemo: boolean;
}): DocumentSpec {
  const { travelCase: c, agency, now } = input;
  const tz = agency.timezone;
  const date = (iso: string) => formatDate(iso, tz);
  const money = (amount: number) => formatMoney(amount, c.billingCurrency);

  const steps: SpecSection = {
    kind: "checklist",
    title: "Étapes de la démarche",
    items: input.steps.map((s) => ({
      label: s.label,
      state: s.status === "done" ? "done" : s.status === "in_progress" ? "current" : s.status === "skipped" ? "skipped" : "todo",
      detail: s.status === "done" && s.completedAt ? `Fait le ${date(s.completedAt)}` : undefined,
    })),
  };
  const documents: SpecSection = {
    kind: "checklist",
    title: "Pièces du dossier",
    empty: "Aucune pièce demandée pour l'instant.",
    items: input.requirements
      .filter((r) => r.isRequired || r.status !== "not_received")
      .map((r) => {
        const s = REQUIREMENT_STATE[r.status];
        return { label: r.label, state: s.state, detail: r.receivedAt && s.state === "done" ? `${s.label} le ${date(r.receivedAt)}` : s.label };
      }),
  };
  const upcoming = input.appointments.filter((a) => a.status !== "cancelled" && a.status !== "done" && new Date(a.startsAt).getTime() >= now.getTime());
  const appointments: SpecSection = {
    kind: "table",
    title: "Rendez-vous à venir",
    empty: "Aucun rendez-vous prévu.",
    columns: [
      { label: "Date", width: 0.24 },
      { label: "Objet", width: 0.46 },
      { label: "Lieu", width: 0.3 },
    ],
    rows: upcoming.map((a) => [formatDate(a.startsAt, tz, a.allDay ? "date" : "dateTime"), `${a.title} (${APPOINTMENT_KIND[a.kind]})`, a.location ?? "—"]),
  };
  const finance: SpecSection[] = input.finance
    ? [
        {
          kind: "amounts",
          title: "Situation financière",
          rows: [
            { label: "Prestations convenues", value: money(input.finance.agreedMinor) },
            { label: "Déjà payé", value: money(input.finance.paidMinor) },
            ...(input.finance.pendingMinor ? [{ label: "Paiements en cours de vérification", value: money(input.finance.pendingMinor) }] : []),
            { label: "Reste à payer", value: input.finance.balanceMinor ? money(input.finance.balanceMinor) : "Soldé", strong: true },
          ],
        },
      ]
    : [];

  return {
    title: "RÉCAPITULATIF DE DOSSIER",
    numberLabel: "Dossier",
    number: c.reference,
    issuerTitle: "Agence",
    issuer: issuerParty(agency, input.settings),
    recipientTitle: "Client",
    recipient: recipientParty(input.client),
    facts: [
      { label: "Démarche", value: `${c.title} — ${caseKindLabel(c.templateKey, CATEGORY_LABELS[c.category])}` },
      { label: "Destination", value: countryName(c.destinationCountry) },
      { label: "Ouvert le", value: date(c.openedAt) },
      { label: "État", value: CASE_STATUS[c.status].label },
      { label: "Prochaine action", value: c.nextAction ? `${c.nextAction}${c.nextActionDueAt ? ` (avant le ${date(c.nextActionDueAt)})` : ""}` : "Aucune" },
      { label: "Conseiller", value: input.advisor ?? "—" },
      ...(c.plannedDepartureDate ? [{ label: "Départ envisagé", value: date(c.plannedDepartureDate) }] : []),
      { label: "Édité le", value: formatDate(now.toISOString(), tz, "dateTime") },
    ],
    sections: [steps, documents, appointments, ...finance],
    signatoryName: input.settings.signatoryName || undefined,
    footer: [CASE_SUMMARY_MENTION, ...(input.settings.footerNote ? [input.settings.footerNote] : [])],
    isDemo: input.isDemo,
  };
}
