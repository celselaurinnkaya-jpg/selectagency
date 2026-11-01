import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { Receipt } from "lucide-react";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, EmptyState, PageHeader, Section, StatusBadge } from "@/components/shared/ui";
import type { ExpenseType } from "@/lib/domain/types";
import type { LabelSpec } from "@/lib/domain/labels";
import { dayKey, formatDate, formatMoney } from "@/lib/format";
import { listExpenses } from "@/features/finance/queries";
import { ExpenseForm } from "@/features/finance/FinanceForms";
import { FinanceRestricted } from "@/features/finance/FinanceRestricted";
import { FinanceTabs } from "@/features/finance/FinanceTabs";

export const metadata: Metadata = { title: "Dépenses" };

const TYPE: Record<ExpenseType, LabelSpec> = {
  operating: { label: "Dépense de l'agence", tone: "navy" },
  client_disbursement: { label: "Reversement pour un client", tone: "external" },
};

export default function ExpensesPage() {
  return (
    <>
      <PageHeader
        title="Dépenses"
        description="Les dépenses de fonctionnement de l'agence sont distinguées des sommes reversées à des tiers pour le compte des clients."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Expenses />
      </Suspense>
    </>
  );
}

async function Expenses() {
  const { rows, agency, canSeeFinance, canWrite, cases, now } = await listExpenses();
  const tz = agency.timezone;
  if (!canSeeFinance) return <><FinanceTabs /><FinanceRestricted /></>;
  return (
    <>
      <FinanceTabs />
      {canWrite && (
        <Section title="Enregistrer une dépense" className="mb-6">
          <Card>
            <ExpenseForm currency={agency.currency} defaultDate={dayKey(now, tz)} cases={cases} />
          </Card>
        </Section>
      )}
      {rows.length === 0 && <EmptyState icon={Receipt} title="Aucune dépense enregistrée" description="Loyer, connexion, frais reversés pour un client : tout ce qui sort de la caisse de l'agence." />}
      <ul className="space-y-2">
        {rows.map(({ expense: e, caseRef, recordedBy }) => (
          <li key={e.id}>
            <Card className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="min-w-0">
                <span className="block font-medium text-slate-900">{e.label}</span>
                <span className="mt-1 flex flex-wrap items-center gap-2">
                  <StatusBadge spec={TYPE[e.expenseType]} />
                  <span className="text-xs text-slate-500">
                    {formatDate(e.paidAt, tz)}
                    {e.supplier && ` · ${e.supplier}`} · saisi par {recordedBy?.fullName}
                  </span>
                </span>
                {caseRef && e.caseId && (
                  <Link href={`/cases/${e.caseId}?tab=finance`} className="mt-1 block font-mono text-xs text-navy-700 hover:underline">
                    {caseRef}
                  </Link>
                )}
              </span>
              <span className="font-semibold tabular-nums text-slate-900">{formatMoney(e.amountMinor, e.currency)}</span>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
