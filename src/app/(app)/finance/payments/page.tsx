import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { Pills } from "@/components/shared/navigation";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, EmptyState, Notice, PageHeader, StatusBadge } from "@/components/shared/ui";
import { PAYMENT_STATUS } from "@/lib/domain/labels";
import { formatDate, formatMoney } from "@/lib/format";
import { PendingPaymentActions } from "@/features/finance/FinanceForms";
import { isPaymentFilter, listPayments, type PaymentFilter } from "@/features/finance/queries";
import { FinanceRestricted } from "@/features/finance/FinanceRestricted";
import { FinanceTabs } from "@/features/finance/FinanceTabs";

export const metadata: Metadata = { title: "Paiements et reçus" };

const FILTERS: { key: PaymentFilter; label: string }[] = [
  { key: "tous", label: "Tous" },
  { key: "a-verifier", label: "À vérifier" },
  { key: "confirmes", label: "Confirmés" },
  { key: "annules", label: "Annulés" },
];

export default function PaymentsPage({ searchParams }: PageProps<"/finance/payments">) {
  return (
    <>
      <PageHeader
        title="Paiements et reçus"
        description="Un paiement confirmé reçoit un numéro de reçu unique et chronologique, attribué par la base de données. Un paiement annoncé (virement, Mobile Money) reste « à vérifier », sans reçu, jusqu'à ce que sa réception soit confirmée. Pour enregistrer un paiement, ouvrez le dossier concerné, onglet Finance."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Payments searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Payments({ searchParams }: Pick<PageProps<"/finance/payments">, "searchParams">) {
  const { vue } = await searchParams;
  const filter: PaymentFilter = isPaymentFilter(vue) ? vue : "tous";
  const { rows, agency, canSeeFinance, canWrite, counts, pendingTotals } = await listPayments(filter);
  const tz = agency.timezone;
  if (!canSeeFinance) return <><FinanceTabs /><FinanceRestricted /></>;
  const receiptLabel = (p: (typeof rows)[number]["payment"]) => p.receiptNumber ?? "Sans reçu";
  return (
    <>
      <FinanceTabs />
      {counts["a-verifier"] > 0 && filter !== "a-verifier" && (
        <div className="mb-4">
          <Notice tone="warning" title={`${counts["a-verifier"]} paiement(s) à vérifier`}>
            {pendingTotals.map((t) => formatMoney(t.amountMinor, t.currency)).join(" · ")} annoncé(s) par des clients, pas encore confirmé(s) : ils ne comptent pas
            dans les soldes et n&apos;ont pas de reçu.{" "}
            <Link href="/finance/payments?vue=a-verifier" className="font-medium underline">
              Les vérifier
            </Link>
          </Notice>
        </div>
      )}
      <Pills
        label="Filtrer les paiements"
        active={filter}
        items={FILTERS.map((f) => ({ key: f.key, label: f.label, href: f.key === "tous" ? "/finance/payments" : `/finance/payments?vue=${f.key}`, count: counts[f.key] }))}
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={filter === "a-verifier" ? "Aucun paiement à vérifier" : "Aucun paiement"}
          description={filter === "a-verifier" ? "Tous les paiements annoncés ont été confirmés ou annulés." : "Les paiements enregistrés dans les dossiers apparaissent ici."}
        />
      ) : filter === "a-verifier" ? (
        <ul className="space-y-2">
          {rows.map(({ payment: p, client, caseRef, receivedBy }) => (
            <li key={p.id}>
              <Card className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block font-semibold tabular-nums text-slate-900">{formatMoney(p.amountMinor, p.currency)}</span>
                    <span className="block text-sm text-slate-700">
                      {client.firstName} {client.lastName} ·{" "}
                      <Link href={`/cases/${p.caseId}?tab=finance`} className="font-mono text-navy-700 hover:underline">
                        {caseRef}
                      </Link>
                    </span>
                    <span className="block text-xs text-slate-500">
                      {formatDate(p.paidAt, tz, "dateTime")} · {p.methodLabel}
                      {p.transactionReference && ` · réf. ${p.transactionReference}`} · saisi par {receivedBy?.fullName ?? "—"}
                    </span>
                  </span>
                  <StatusBadge spec={PAYMENT_STATUS.pending} />
                </div>
                {canWrite && <PendingPaymentActions paymentId={p.id} />}
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <>
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
                        {receiptLabel(p)}
                      </Link>
                      {p.status !== "recorded" && <StatusBadge className="ml-2" spec={PAYMENT_STATUS[p.status]} />}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{formatDate(p.paidAt, tz, "dateTime")}</td>
                    <td className="px-4 py-3 text-slate-700">
                      <Link href={`/clients/${client.id}?tab=paiements`} className="hover:underline">
                        {client.firstName} {client.lastName}
                      </Link>
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
                      <span className="font-mono text-xs text-navy-700">{receiptLabel(p)}</span>
                    </span>
                    <span className="block text-sm text-slate-700">
                      {client.firstName} {client.lastName} · {caseRef}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      {formatDate(p.paidAt, tz, "dateTime")} · {p.methodLabel}
                      {p.status !== "recorded" && <StatusBadge spec={PAYMENT_STATUS[p.status]} />}
                    </span>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
