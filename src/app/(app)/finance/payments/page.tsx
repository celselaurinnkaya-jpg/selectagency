import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { CreditCard } from "lucide-react";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, PageHeader, PlannedAction, StatusBadge } from "@/components/shared/ui";
import { formatDate, formatMoney } from "@/lib/format";
import { listPayments } from "@/features/finance/queries";
import { FinanceTabs } from "@/features/finance/FinanceTabs";

export const metadata: Metadata = { title: "Paiements et reçus" };

export default function PaymentsPage() {
  return (
    <>
      <PageHeader
        title="Paiements et reçus"
        description="Chaque paiement reçoit un numéro de reçu unique et chronologique. Un paiement n'est jamais modifié : il peut seulement être annulé, avec un motif."
        actions={<PlannedAction icon={CreditCard} label="Enregistrer un paiement" reason="Formulaire d'encaissement prévu à la prochaine étape (Phase 4)." />}
      />
      <Suspense fallback={<PageSkeleton />}>
        <Payments />
      </Suspense>
    </>
  );
}

async function Payments() {
  const { rows, agency } = await listPayments();
  const tz = agency.timezone;
  return (
    <>
      <FinanceTabs />
      <div className="hidden overflow-hidden rounded-xl border border-slate-200 md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface text-xs font-semibold text-slate-600">
            <tr>
              <th scope="col" className="px-4 py-3">Reçu</th>
              <th scope="col" className="px-4 py-3">Date</th>
              <th scope="col" className="px-4 py-3">Client et dossier</th>
              <th scope="col" className="px-4 py-3">Moyen de paiement</th>
              <th scope="col" className="px-4 py-3">Reçu par</th>
              <th scope="col" className="px-4 py-3 text-right">Montant</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(({ payment: p, client, caseRef, receivedBy }) => (
              <tr key={p.id} className="hover:bg-navy-50/50">
                <td className="px-4 py-3">
                  <Link href={`/finance/receipts/${p.id}`} className="font-mono font-medium text-navy-800 hover:underline">
                    {p.receiptNumber}
                  </Link>
                  {p.status === "voided" && <StatusBadge className="ml-2" spec={{ label: "Annulé", tone: "danger" }} />}
                </td>
                <td className="px-4 py-3 text-slate-700">{formatDate(p.paidAt, tz, "dateTime")}</td>
                <td className="px-4 py-3 text-slate-700">
                  {client.firstName} {client.lastName}
                  <Link href={`/cases/${p.caseId}?tab=finance`} className="block font-mono text-xs text-navy-700 hover:underline">
                    {caseRef}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {p.methodLabel}
                  {p.transactionReference && <span className="block font-mono text-xs text-slate-500">{p.transactionReference}</span>}
                </td>
                <td className="px-4 py-3 text-slate-700">{receivedBy?.fullName}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">{formatMoney(p.amountMinor, p.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2 md:hidden">
        {rows.map(({ payment: p, client, caseRef }) => (
          <li key={p.id}>
            <Link href={`/finance/receipts/${p.id}`} className="block">
              <Card>
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold tabular-nums text-slate-900">{formatMoney(p.amountMinor, p.currency)}</span>
                  <span className="font-mono text-xs text-navy-700">{p.receiptNumber}</span>
                </span>
                <span className="block text-sm text-slate-700">
                  {client.firstName} {client.lastName} · {caseRef}
                </span>
                <span className="block text-xs text-slate-500">
                  {formatDate(p.paidAt, tz, "dateTime")} · {p.methodLabel}
                </span>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
