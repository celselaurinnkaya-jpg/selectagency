import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { Receipt } from "lucide-react";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, EmptyState, Notice, PageHeader, Section, StatusBadge } from "@/components/shared/ui";
import type { ExpenseApprovalStatus, ExpenseType } from "@/lib/domain/types";
import type { LabelSpec } from "@/lib/domain/labels";
import { dayKey, formatDate, formatMoney } from "@/lib/format";
import { listExpenses } from "@/features/finance/queries";
import { ExpenseForm, ExpenseReviewForm, ExpenseSettingsForm } from "@/features/finance/FinanceForms";
import { amountInputValue } from "@/features/finance/payments";
import { FinanceRestricted } from "@/features/finance/FinanceRestricted";
import { FinanceTabs } from "@/features/finance/FinanceTabs";

export const metadata: Metadata = { title: "Dépenses" };

const TYPE: Record<ExpenseType, LabelSpec> = {
  operating: { label: "Dépense de l'agence", tone: "navy" },
  client_disbursement: { label: "Reversement pour un client", tone: "external" },
};

// Validation par le propriétaire : seules les dépenses validées comptent dans les chiffres.
const APPROVAL: Record<ExpenseApprovalStatus, LabelSpec | undefined> = {
  pending: { label: "À valider", tone: "warning" },
  approved: undefined,
  rejected: { label: "Refusée", tone: "danger" },
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
  const { rows, agency, canSeeFinance, canWrite, cases, now, organizationId, isOwner, canManageSettings, receiptRequiredAboveMinor, pendingCount } = await listExpenses();
  const tz = agency.timezone;
  if (!canSeeFinance) return <><FinanceTabs /><FinanceRestricted /></>;
  return (
    <>
      <FinanceTabs />
      {pendingCount > 0 && (
        <div className="mb-4">
          <Notice tone="warning" title={`${pendingCount} dépense(s) à valider`}>
            {isOwner
              ? "Vérifiez chaque dépense et son justificatif, puis validez-la ou refusez-la : elle ne compte dans les chiffres qu'une fois validée."
              : "Ces dépenses attendent la validation du propriétaire : elles ne comptent pas encore dans les chiffres."}
          </Notice>
        </div>
      )}
      {canWrite && (
        <Section id="nouvelle-depense" title="Enregistrer une dépense" className="mb-6">
          <Card>
            <ExpenseForm
              currency={agency.currency}
              defaultDate={dayKey(now, tz)}
              cases={cases}
              organizationId={organizationId}
              receiptRequiredAbove={receiptRequiredAboveMinor === undefined ? undefined : formatMoney(receiptRequiredAboveMinor, agency.currency)}
              needsValidation={!isOwner}
            />
          </Card>
        </Section>
      )}
      {rows.length === 0 && <EmptyState icon={Receipt} title="Aucune dépense enregistrée" description="Loyer, connexion, frais reversés pour un client : tout ce qui sort de la caisse de l'agence." />}
      <ul className="space-y-2">
        {rows.map(({ expense: e, caseRef, recordedBy }) => (
          <li key={e.id}>
            <Card className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="min-w-0">
                <span className="block font-medium text-slate-900">{e.label}</span>
                <span className="mt-1 flex flex-wrap items-center gap-2">
                  <StatusBadge spec={TYPE[e.expenseType]} />
                  {e.approvalStatus && APPROVAL[e.approvalStatus] && <StatusBadge spec={APPROVAL[e.approvalStatus]!} />}
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
                {e.receiptPath ? (
                  <a href={`/finance/expenses/${e.id}/justificatif`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-10 items-center text-sm font-medium text-navy-700 hover:underline">
                    Voir le justificatif
                  </a>
                ) : (
                  <span className="mt-1 block text-xs text-slate-500">Sans justificatif</span>
                )}
                {e.approvalStatus === "rejected" && e.reviewNote && <span className="mt-1 block text-sm text-red-800">Motif du refus : {e.reviewNote}</span>}
              </span>
              <span className="font-semibold tabular-nums text-slate-900">{formatMoney(e.amountMinor, e.currency)}</span>
              </div>
              {isOwner && e.approvalStatus === "pending" && <ExpenseReviewForm expenseId={e.id} />}
            </Card>
          </li>
        ))}
      </ul>
      {canManageSettings && (
        <Section title="Règle des justificatifs" className="mt-6">
          <Card>
            <ExpenseSettingsForm
              currency={agency.currency}
              threshold={receiptRequiredAboveMinor === undefined ? undefined : receiptRequiredAboveMinor === 0 ? "0" : amountInputValue(receiptRequiredAboveMinor, agency.currency)}
            />
          </Card>
        </Section>
      )}
    </>
  );
}
