import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { FileText, Plus, Wallet } from "lucide-react";
import { Pills } from "@/components/shared/navigation";
import { FeatureLocked } from "@/components/shared/FeatureLocked";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, EmptyState, Notice, PageHeader, StatCard, StatusBadge } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { INVOICE_OVERDUE, INVOICE_STATUS } from "@/lib/domain/labels";
import { formatMoney } from "@/lib/format";
import { FinanceRestricted } from "@/features/finance/FinanceRestricted";
import { FinanceTabs } from "@/features/finance/FinanceTabs";
import { formatDay } from "@/features/invoices/document";
import { listInvoices, type InvoiceFilter } from "@/features/invoices/queries";
import { getShell } from "@/features/operations/queries";

export const metadata: Metadata = { title: "Factures" };

const FILTERS: { key: InvoiceFilter; label: string }[] = [
  { key: "all", label: "Toutes" },
  { key: "draft", label: "Brouillons" },
  { key: "issued", label: "À payer" },
  { key: "overdue", label: "En retard" },
  { key: "paid", label: "Payées" },
  { key: "cancelled", label: "Annulées" },
];

export default function InvoicesPage({ searchParams }: PageProps<"/finance/invoices">) {
  return (
    <>
      <PageHeader
        title="Factures"
        description="Factures remises aux clients : à imprimer, télécharger en PDF ou envoyer par WhatsApp. Les encaissements restent enregistrés dans Paiements et reçus."
        actions={
          <Button asChild variant="accent">
            <Link href="/finance/invoices/new">
              <Plus aria-hidden />
              Nouvelle facture
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<PageSkeleton />}>
        <Invoices searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Invoices({ searchParams }: Pick<PageProps<"/finance/invoices">, "searchParams">) {
  const params = await searchParams;
  const filter = FILTERS.find((f) => f.key === params.etat)?.key ?? "all";
  const [{ rows, counts, outstanding, canSeeFinance }, { locked }] = await Promise.all([listInvoices(filter), getShell()]);
  if (!canSeeFinance) return <><FinanceTabs /><FinanceRestricted /></>;

  return (
    <>
      <FinanceTabs />
      {locked.includes("invoices") && (
        <div className="mb-4">
          <FeatureLocked feature="invoices">
            Votre formule STARTER garde vos factures consultables et modifiables, mais ne permet plus d&apos;en créer. Les reçus et
            les devis restent inclus.
          </FeatureLocked>
        </div>
      )}
      {params.ok === "facture-supprimee" && (
        <div className="mb-4">
          <Notice tone="success" title="Facture supprimée">
            La suppression est notée dans l&apos;historique du client ; son numéro ne sera pas réutilisé.
          </Notice>
        </div>
      )}

      {outstanding.length > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {outstanding.map((o) => (
            <StatCard
              key={o.currency}
              label={`À encaisser (${o.currency})`}
              value={formatMoney(o.totalMinor, o.currency)}
              hint={o.overdueMinor ? `dont ${formatMoney(o.overdueMinor, o.currency)} en retard` : "Aucune facture en retard"}
              icon={Wallet}
              tone={o.overdueMinor ? "warning" : undefined}
            />
          ))}
        </div>
      )}

      <Pills
        label="État des factures"
        active={filter}
        items={FILTERS.map((f) => ({ key: f.key, label: f.label, count: counts[f.key], href: f.key === "all" ? "/finance/invoices" : `/finance/invoices?etat=${f.key}` }))}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={counts.all === 0 ? "Aucune facture" : "Aucune facture dans cette liste"}
          description={counts.all === 0 ? "Créez une facture pour un client : elle est prête à imprimer, à télécharger ou à envoyer par WhatsApp." : undefined}
          action={
            counts.all === 0 ? (
              <Button asChild variant="accent">
                <Link href="/finance/invoices/new">Nouvelle facture</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-2">
          {rows.map(({ invoice, client, overdue }) => (
            <li key={invoice.id}>
              <Link href={`/finance/invoices/${invoice.id}`} className="block rounded-xl transition hover:ring-2 hover:ring-navy-200">
                <Card className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0">
                    <span className="block font-mono text-xs text-slate-500">{invoice.number}</span>
                    <span className="block truncate font-medium text-slate-900">{client ? `${client.firstName} ${client.lastName}` : "—"}</span>
                    <span className="block text-xs text-slate-500">
                      Émise le {formatDay(invoice.issueDate)} · échéance le {formatDay(invoice.dueDate)}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <span className="font-semibold tabular-nums text-slate-900">{formatMoney(invoice.totalMinor, invoice.currency)}</span>
                    <StatusBadge spec={overdue ? INVOICE_OVERDUE : INVOICE_STATUS[invoice.status]} />
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
