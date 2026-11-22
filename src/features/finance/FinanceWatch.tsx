import Link from "next/link";
import { AlertTriangle, FileText, Hourglass, Receipt } from "lucide-react";
import { Card, StatCard } from "@/components/shared/ui";
import { formatDate, formatMoney } from "@/lib/format";
import type { FinanceWatch } from "./queries";

// « À surveiller » : ce que la propriétaire veut voir en premier, sur la Synthèse Finance et le tableau de bord.
// Rien ne s'affiche quand il n'y a rien à surveiller.

export function hasFinanceWatch(watch: FinanceWatch): boolean {
  return watch.pendingPayments.count > 0 || watch.unpaidInvoices.count > 0 || watch.pendingExpenses.count > 0;
}

export function FinanceWatchCards({ watch, timeZone, withOverdueList = false }: { watch: FinanceWatch; timeZone: string; withOverdueList?: boolean }) {
  const { pendingPayments, unpaidInvoices, pendingExpenses } = watch;
  if (!hasFinanceWatch(watch)) return null;
  return (
    <>
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
        {pendingPayments.count > 0 && (
          <StatCard
            label={`${pendingPayments.count} paiement(s) à vérifier`}
            value={pendingPayments.totals.map((s) => formatMoney(s.amountMinor, s.currency)).join(" · ")}
            hint="Annoncés, pas encore vus sur le compte : sans reçu tant qu'ils ne sont pas confirmés"
            icon={Hourglass}
            href="/finance/payments?vue=a-verifier"
            tone="warning"
          />
        )}
        {unpaidInvoices.count > 0 && (
          <StatCard
            label={`${unpaidInvoices.count} facture(s) à encaisser`}
            value={unpaidInvoices.totals.map((s) => formatMoney(s.amountMinor, s.currency)).join(" · ")}
            hint="Factures émises, pas encore payées"
            icon={FileText}
            href="/finance/invoices?etat=issued"
          />
        )}
        {pendingExpenses.count > 0 && (
          <StatCard
            label={`${pendingExpenses.count} dépense(s) à valider`}
            value={pendingExpenses.totals.map((s) => formatMoney(s.amountMinor, s.currency)).join(" · ")}
            hint="Saisies par l'équipe : elles comptent une fois validées par le propriétaire"
            icon={Receipt}
            href="/finance/expenses"
            tone="warning"
          />
        )}
        {unpaidInvoices.overdueCount > 0 && (
          <StatCard
            label={`${unpaidInvoices.overdueCount} facture(s) en retard`}
            value={unpaidInvoices.overdue.length ? `Depuis le ${formatDate(`${unpaidInvoices.overdue[0]!.invoice.dueDate}T12:00:00Z`, timeZone)}` : "—"}
            hint="Échéance dépassée"
            icon={AlertTriangle}
            href="/finance/invoices?etat=overdue"
            tone="danger"
          />
        )}
      </div>
      {withOverdueList && unpaidInvoices.overdue.length > 0 && (
        <ul className="mt-3 space-y-2">
          {unpaidInvoices.overdue.map(({ invoice, client }) => (
            <li key={invoice.id}>
              <Link href={`/finance/invoices/${invoice.id}`} className="block rounded-xl transition hover:ring-2 hover:ring-navy-200">
                <Card className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0">
                    <span className="block font-mono text-xs text-slate-500">{invoice.number}</span>
                    <span className="block truncate font-medium text-slate-900">{client ? `${client.firstName} ${client.lastName}` : "—"}</span>
                  </span>
                  <span className="text-left sm:text-right">
                    <span className="block font-semibold tabular-nums text-red-800">{formatMoney(invoice.totalMinor, invoice.currency)}</span>
                    <span className="block text-xs text-slate-500">Échéance : {formatDate(`${invoice.dueDate}T12:00:00Z`, timeZone)}</span>
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
