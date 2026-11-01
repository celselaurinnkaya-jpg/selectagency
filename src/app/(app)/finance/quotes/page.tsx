import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { FileSignature } from "lucide-react";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/shared/ui";
import { QUOTE_STATUS } from "@/lib/domain/labels";
import { formatDate, formatMoney } from "@/lib/format";
import { FinanceRestricted } from "@/features/finance/FinanceRestricted";
import { FinanceTabs } from "@/features/finance/FinanceTabs";
import { listQuotes } from "@/features/quotes/queries";

export const metadata: Metadata = { title: "Devis" };

export default function QuotesPage() {
  return (
    <>
      <PageHeader
        title="Devis"
        description="Propositions chiffrées remises aux clients. Un devis accepté devient les prestations du dossier. Pour préparer un devis, ouvrez le dossier, onglet Finance."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Quotes />
      </Suspense>
    </>
  );
}

async function Quotes() {
  const { rows, agency, canSeeFinance } = await listQuotes();
  if (!canSeeFinance) return <><FinanceTabs /><FinanceRestricted /></>;
  return (
    <>
      <FinanceTabs />
      {rows.length === 0 ? (
        <EmptyState icon={FileSignature} title="Aucun devis" description="Préparez un devis depuis l'onglet Finance d'un dossier." />
      ) : (
        <ul className="space-y-2">
          {rows.map(({ quote, total, travelCase, client }) => (
            <li key={quote.id}>
              <Link href={`/finance/quotes/${quote.id}`} className="block rounded-xl transition hover:ring-2 hover:ring-navy-200">
                <Card className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0">
                    <span className="block font-mono text-xs text-slate-500">{quote.reference}</span>
                    <span className="block truncate font-medium text-slate-900">
                      {client ? `${client.firstName} ${client.lastName}` : "—"} · {travelCase?.reference}
                    </span>
                    <span className="block text-xs text-slate-500">
                      Préparé le {formatDate(quote.createdAt, agency.timezone)}
                      {quote.validUntil && ` · valable jusqu'au ${formatDate(quote.validUntil, agency.timezone)}`}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="font-semibold tabular-nums text-slate-900">{formatMoney(total, quote.currency)}</span>
                    <StatusBadge spec={QUOTE_STATUS[quote.status]} />
                  </span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
