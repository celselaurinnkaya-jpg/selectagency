import { NextResponse } from "next/server";
import { allowed, forbiddenMessage, type Permission } from "@/lib/auth/permissions";
import { readAgency } from "@/lib/data/agency";
import { countryName } from "@/lib/countries";
import { csvAmount, toCsv, type Cell } from "@/lib/csv";
import { CASE_OUTCOME, CASE_STATUS, CATEGORY_LABELS, CLIENT_TYPE, PAYMENT_STATUS, PRIORITY } from "@/lib/domain/labels";
import { dayKey, formatDate } from "@/lib/format";
import { summarizeCase } from "@/features/cases/summary";

// Exports CSV de l'agence. Réservés aux responsables (clients, dossiers) et aux rôles financiers
// (paiements, dépenses) : un export sort des données personnelles de l'application. Les numéros de
// pièce d'identité ne sont jamais exportés.

const REPORTS = {
  clients: { permission: "reports.export", title: "clients" },
  dossiers: { permission: "reports.export", title: "dossiers" },
  paiements: { permission: "finance.export", title: "paiements" },
  depenses: { permission: "finance.export", title: "depenses" },
} as const satisfies Record<string, { permission: Permission; title: string }>;

type Report = keyof typeof REPORTS;

export async function GET(_request: Request, { params }: RouteContext<"/reports/export/[report]">) {
  const { report } = await params;
  if (!(report in REPORTS)) return new NextResponse("Export inconnu.", { status: 404 });
  const spec = REPORTS[report as Report];

  const { data, ctx, now } = await readAgency({ clients: true, cases: true, steps: true, requirements: true, charges: true, payments: true, expenses: true });
  if (!allowed(ctx, spec.permission)) return new NextResponse(forbiddenMessage(ctx, spec.permission), { status: 403 });
  if (ctx.locked.includes("reports")) {
    return new NextResponse("Les rapports et exports sont inclus dans les formules PRO et BUSINESS.", { status: 403 });
  }
  const tz = data.agency.timezone;
  const date = (iso?: string) => (iso ? formatDate(iso, tz) : "");
  const memberName = (id?: string) => data.members.find((m) => m.id === id)?.fullName ?? "";
  const clientName = (id?: string) => {
    const c = data.clients.find((x) => x.id === id);
    return c ? `${c.firstName} ${c.lastName}` : "";
  };
  const caseRef = (id?: string) => data.cases.find((c) => c.id === id)?.reference ?? "";

  let header: string[];
  let rows: Cell[][];
  switch (report as Report) {
    case "clients":
      header = ["Référence", "Prénom", "Nom", "Type", "Téléphone", "WhatsApp", "E-mail", "Pays de résidence", "Ville", "Conseiller", "Inscrit le", "Archivé le"];
      rows = data.clients.map((c) => [
        c.reference, c.firstName, c.lastName, CLIENT_TYPE[c.clientType], c.phoneE164, c.whatsappE164, c.email,
        countryName(c.residenceCountry), c.city, memberName(c.assignedTo), date(c.registeredAt), date(c.archivedAt),
      ]);
      break;
    case "dossiers":
      header = [
        "Référence", "Intitulé", "Client", "Type de projet", "Destination", "Statut", "Résultat", "Priorité", "Conseiller",
        "Ouvert le", "Clôturé le", "Départ prévu", "Devise", "Convenu", "Encaissé", "Solde dû",
      ];
      rows = data.cases.map((c) => {
        const { finance } = summarizeCase(data, c, now);
        return [
          c.reference, c.title, clientName(c.clientId), CATEGORY_LABELS[c.category], countryName(c.destinationCountry), CASE_STATUS[c.status].label,
          CASE_OUTCOME[c.outcome].label, PRIORITY[c.priority].label, memberName(c.assignedTo), date(c.openedAt), date(c.closedAt),
          c.plannedDepartureDate ? formatDate(c.plannedDepartureDate, tz) : "", c.billingCurrency,
          csvAmount(finance.agreedMinor, c.billingCurrency), csvAmount(finance.paidMinor, c.billingCurrency), csvAmount(finance.balanceMinor, c.billingCurrency),
        ];
      });
      break;
    case "paiements":
      header = ["Reçu", "Date", "Client", "Dossier", "Montant", "Devise", "Moyen", "Référence de transaction", "Payé par", "Saisi par", "Statut", "Confirmé le", "Motif d'annulation"];
      rows = [...data.payments]
        .sort((a, b) => a.paidAt.localeCompare(b.paidAt))
        .map((p) => [
          p.receiptNumber ?? "", formatDate(p.paidAt, tz, "dateTime"), clientName(p.clientId), caseRef(p.caseId), csvAmount(p.amountMinor, p.currency), p.currency,
          p.methodLabel, p.transactionReference, p.payerName, memberName(p.receivedBy), PAYMENT_STATUS[p.status].label,
          p.confirmedAt ? formatDate(p.confirmedAt, tz, "dateTime") : "", p.voidReason,
        ]);
      break;
    case "depenses":
      header = ["Date", "Dépense", "Nature", "Fournisseur ou bénéficiaire", "Montant", "Devise", "Dossier", "Saisie par"];
      rows = [...data.expenses]
        .sort((a, b) => a.paidAt.localeCompare(b.paidAt))
        .map((e) => [
          date(e.paidAt), e.label, e.expenseType === "operating" ? "Dépense de l'agence" : "Reversement pour un client", e.supplier,
          csvAmount(e.amountMinor, e.currency), e.currency, caseRef(e.caseId), memberName(e.recordedBy),
        ]);
      break;
  }

  return new NextResponse(toCsv(header, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="select-agency-${spec.title}-${dayKey(now, tz)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
