import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Logo } from "@/components/brand/Logo";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { PrintButton } from "@/components/shared/PrintButton";
import { Card, PageHeader, StatusBadge } from "@/components/shared/ui";
import { countryName } from "@/lib/countries";
import { METHOD_KIND } from "@/lib/domain/labels";
import { formatDate, formatMoney } from "@/lib/format";
import { SELECT_CONTACT } from "@/lib/select-contact";
import { getSubscriptionReceipt } from "@/features/billing/queries";

export const metadata: Metadata = { title: "Reçu d'abonnement" };

export default function SubscriptionReceiptPage({ params }: PageProps<"/settings/billing/recu/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SubscriptionReceipt params={params} />
    </Suspense>
  );
}

async function SubscriptionReceipt({ params }: Pick<PageProps<"/settings/billing/recu/[id]">, "params">) {
  const { id } = await params;
  const receipt = await getSubscriptionReceipt(id);
  if (!receipt) notFound();
  const { agency, payment: p, planName, number } = receipt;
  const tz = agency.timezone;
  const voided = p.status === "voided";
  const rows: [string, string][] = [
    ["Date du paiement", formatDate(p.paidAt, tz)],
    ["Montant reçu", formatMoney(p.amountMinor, p.currency)],
    ["Moyen de paiement", METHOD_KIND[p.methodKind]],
    ...(p.transactionReference ? ([["Référence de la transaction", p.transactionReference]] as [string, string][]) : []),
    ["Objet", `Abonnement à SELECT Agency${planName ? `, formule ${planName}` : ""}`],
    ...(p.periodEnd ? ([["Abonnement réglé jusqu'au", formatDate(p.periodEnd, tz)]] as [string, string][]) : []),
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="print:hidden">
        <PageHeader
          back={{ href: "/settings/billing", label: "Retour à l'abonnement" }}
          title={`Reçu ${number}`}
          description="Reçu du paiement de votre abonnement à SELECT Agency, à imprimer ou à enregistrer en PDF."
          actions={voided ? undefined : <PrintButton />}
        />
      </div>
      <Card className="space-y-6 p-6 print:shadow-none sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="rounded-lg bg-navy-800 px-3 py-2">
            <Logo className="h-7" />
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold text-navy-800">Reçu de paiement</p>
            <p className="font-mono text-sm text-slate-600">{number}</p>
            {voided && <StatusBadge spec={{ label: "Paiement annulé", tone: "danger" }} className="mt-1" />}
          </div>
        </div>
        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase">Émis par</p>
            <p className="font-medium text-slate-900">SELECT Agency</p>
            <p className="text-slate-600">{SELECT_CONTACT.email}</p>
            <p className="text-slate-600">{SELECT_CONTACT.phone}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase">Reçu de</p>
            <p className="font-medium text-slate-900">{agency.name}</p>
            <p className="text-slate-600">{[agency.city, countryName(agency.countryCode)].filter(Boolean).join(", ")}</p>
          </div>
        </div>
        <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:justify-between sm:gap-4">
              <dt className="text-slate-600">{label}</dt>
              <dd className="font-medium text-slate-900 tabular-nums sm:text-right">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-slate-500">
          {voided
            ? "Ce paiement a été annulé par SELECT (saisie erronée) : ce reçu n'a pas de valeur."
            : "SELECT Agency atteste avoir reçu ce paiement pour l'abonnement de l'agence désignée ci-dessus."}
        </p>
      </Card>
    </div>
  );
}
