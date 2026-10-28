import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Logo } from "@/components/brand/Logo";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { PrintButton } from "@/components/shared/PrintButton";
import { PageHeader } from "@/components/shared/ui";
import { formatDate, formatMoney } from "@/lib/format";
import { getReceipt } from "@/features/finance/queries";

export const metadata: Metadata = { title: "Reçu de paiement" };

export default function ReceiptPage({ params }: PageProps<"/finance/receipts/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Receipt params={params} />
    </Suspense>
  );
}

async function Receipt({ params }: Pick<PageProps<"/finance/receipts/[id]">, "params">) {
  const { id } = await params;
  const receipt = await getReceipt(id);
  if (!receipt) notFound();
  const { payment: p, agency, client, travelCase, receivedBy, lines } = receipt;
  const tz = agency.timezone;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="print:hidden">
        <PageHeader back={{ href: "/finance/payments", label: "Retour aux paiements" }} title={`Reçu ${p.receiptNumber}`} actions={<PrintButton />} />
      </div>

      <article className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white print:rounded-none print:border-0">
        <header className="flex flex-col gap-3 bg-navy-800 px-6 py-5 text-white [print-color-adjust:exact] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-lg font-semibold">{agency.name}</p>
            <p className="text-sm text-navy-100">{agency.city}</p>
          </div>
          <Logo className="h-8 print:h-7" />
        </header>
        <div className="space-y-6 px-6 py-6">
          <div className="flex flex-col justify-between gap-2 sm:flex-row">
            <div>
              <h2 className="text-xl font-semibold text-navy-800">Reçu de paiement</h2>
              <p className="font-mono text-sm text-slate-600">{p.receiptNumber}</p>
            </div>
            <p className="text-sm text-slate-700">Date du paiement : {formatDate(p.paidAt, tz, "dateTime")}</p>
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Client</dt>
              <dd className="font-medium text-slate-900">
                {client.firstName} {client.lastName} ({client.reference})
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Dossier</dt>
              <dd className="font-medium text-slate-900">
                {travelCase.reference} — {travelCase.title}
              </dd>
            </div>
            {p.payerName && (
              <div>
                <dt className="text-slate-500">Payé par</dt>
                <dd className="font-medium text-slate-900">{p.payerName}</dd>
              </div>
            )}
            <div>
              <dt className="text-slate-500">Moyen de paiement</dt>
              <dd className="font-medium text-slate-900">
                {p.methodLabel}
                {p.transactionReference && ` — réf. ${p.transactionReference}`}
              </dd>
            </div>
          </dl>

          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
              <tr>
                <th scope="col" className="py-2">Affectation</th>
                <th scope="col" className="py-2">Nature</th>
                <th scope="col" className="py-2 text-right">Montant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((line) => (
                <tr key={line.chargeId}>
                  <td className="py-2 text-slate-900">{line.charge.label}</td>
                  <td className="py-2 text-slate-600">{line.charge.chargeType === "agency_fee" ? "Frais de l'agence" : "Montant destiné à un tiers"}</td>
                  <td className="py-2 text-right tabular-nums text-slate-900">{formatMoney(line.amountMinor, p.currency)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-navy-800">
                <th scope="row" colSpan={2} className="pt-3 text-left text-base font-semibold text-navy-800">
                  Total reçu
                </th>
                <td className="pt-3 text-right text-base font-semibold tabular-nums text-navy-800">{formatMoney(p.amountMinor, p.currency)}</td>
              </tr>
            </tfoot>
          </table>

          <p className="text-sm text-slate-700">Reçu par : {receivedBy?.fullName ?? "—"}</p>
          {p.status === "voided" && <p className="rounded-lg bg-red-50 p-3 text-center font-semibold text-red-800">REÇU ANNULÉ</p>}

          <footer className="space-y-1 border-t border-slate-200 pt-4 text-xs text-slate-500">
            <p>Reçu interne de paiement : il ne constitue pas une facture fiscale.</p>
            <p className="font-semibold text-orange-800">Document de démonstration : données fictives, sans valeur.</p>
          </footer>
        </div>
      </article>
    </div>
  );
}
