import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, FileText, Hourglass, Wallet } from "lucide-react";
import { Pills } from "@/components/shared/navigation";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, Notice, PageHeader, Section, StatCard } from "@/components/shared/ui";
import { formatDate, formatMoney, formatRelativeDay } from "@/lib/format";
import { PERIOD_OPTIONS } from "@/lib/period";
import { getFinanceOverview } from "@/features/finance/queries";
import { FinanceRestricted } from "@/features/finance/FinanceRestricted";
import { FinanceTabs } from "@/features/finance/FinanceTabs";

export const metadata: Metadata = { title: "Finance" };

export default function FinancePage({ searchParams }: PageProps<"/finance">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Overview searchParams={searchParams} />
    </Suspense>
  );
}

async function Overview({ searchParams }: Pick<PageProps<"/finance">, "searchParams">) {
  const { periode } = await searchParams;
  const d = await getFinanceOverview(typeof periode === "string" ? periode : undefined);
  const tz = d.agency.timezone;

  return (
    <>
      <PageHeader
        title="Finance"
        description="Chaque devise est présentée séparément : aucune conversion n'est faite entre devises. Les sommes reçues pour des tiers ne sont pas des revenus de l'agence."
      />
      <FinanceTabs />
      {!d.canSeeFinance && <FinanceRestricted />}
      <Pills label="Période" active={d.period.key} items={PERIOD_OPTIONS.map((p) => ({ key: p.key, label: p.label, href: p.key === "mois" ? "/finance" : `/finance?periode=${p.key}` }))} />

      {d.canSeeFinance && (d.pendingPayments.count > 0 || d.unpaidInvoices.count > 0) && (
        <Section title="À surveiller">
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
            {d.pendingPayments.count > 0 && (
              <StatCard
                label={`${d.pendingPayments.count} paiement(s) à vérifier`}
                value={d.pendingPayments.totals.map((s) => formatMoney(s.amountMinor, s.currency)).join(" · ")}
                hint="Annoncés, pas encore vus sur le compte : sans reçu tant qu'ils ne sont pas confirmés"
                icon={Hourglass}
                href="/finance/payments?vue=a-verifier"
                tone="warning"
              />
            )}
            {d.unpaidInvoices.count > 0 && (
              <StatCard
                label={`${d.unpaidInvoices.count} facture(s) à encaisser`}
                value={d.unpaidInvoices.totals.map((s) => formatMoney(s.amountMinor, s.currency)).join(" · ")}
                hint="Factures émises, pas encore payées"
                icon={FileText}
                href="/finance/invoices?etat=issued"
              />
            )}
            {d.unpaidInvoices.overdueCount > 0 && (
              <StatCard
                label={`${d.unpaidInvoices.overdueCount} facture(s) en retard`}
                value={d.unpaidInvoices.overdue.length ? `Depuis le ${formatDate(`${d.unpaidInvoices.overdue[0]!.invoice.dueDate}T12:00:00Z`, tz)}` : "—"}
                hint="Échéance dépassée"
                icon={AlertTriangle}
                href="/finance/invoices?etat=overdue"
                tone="danger"
              />
            )}
          </div>
          {d.unpaidInvoices.overdue.length > 0 && (
            <ul className="mt-3 space-y-2">
              {d.unpaidInvoices.overdue.map(({ invoice, client }) => (
                <li key={invoice.id}>
                  <Link href={`/finance/invoices/${invoice.id}`} className="block rounded-xl transition hover:ring-2 hover:ring-navy-200">
                    <Card className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="min-w-0">
                        <span className="block font-mono text-xs text-slate-500">{invoice.number}</span>
                        <span className="block truncate font-medium text-slate-900">{client ? `${client.firstName} ${client.lastName}` : "—"}</span>
                      </span>
                      <span className="text-left sm:text-right">
                        <span className="block font-semibold tabular-nums text-red-800">{formatMoney(invoice.totalMinor, invoice.currency)}</span>
                        <span className="block text-xs text-slate-500">Échéance : {formatDate(`${invoice.dueDate}T12:00:00Z`, tz)}</span>
                      </span>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-slate-500">
            Une facture est un document remis au client : l&apos;argent reçu s&apos;enregistre dans le dossier (onglet Finance), qui délivre le reçu.
          </p>
        </Section>
      )}

      {d.totals.length === 0 ? (
        <p className="text-sm text-slate-600">
          Aucun encaissement, aucune dépense et aucun reste à recevoir. Ajoutez les prestations convenues dans un dossier (onglet Finance), puis
          enregistrez les paiements : ils apparaîtront ici.
        </p>
      ) : (
        d.totals.map((t) => (
          <div key={t.currency} className="space-y-6">
            {!t.hasMovements ? (
              <p className="text-sm text-slate-600">Aucun encaissement ni dépense confirmé en {t.currency} pour le moment.</p>
            ) : (
              <>
              <Section title={`Encaissements en ${t.currency}`}>
                <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
                  <StatCard label="Encaissé" value={formatMoney(t.receivedMinor, t.currency)} hint={d.period.label} icon={Wallet} />
                  <StatCard label="Dont frais de l'agence" value={formatMoney(t.agencyRevenueMinor, t.currency)} hint="Revenus propres" icon={Wallet} />
                  <StatCard label="Dont fonds pour des tiers" value={formatMoney(t.thirdPartyReceivedMinor, t.currency)} hint="À reverser aux organismes" icon={Wallet} />
                </div>
              </Section>
              <Section title={`Dépenses et marge en ${t.currency}`}>
                <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
                  <StatCard label="Dépenses de l'agence" value={formatMoney(t.operatingExpensesMinor, t.currency)} hint={d.period.label} icon={Wallet} />
                  <StatCard label="Reversé pour des clients" value={formatMoney(t.disbursementsMinor, t.currency)} hint={d.period.label} icon={Wallet} />
                  <StatCard label="Fonds de tiers encore détenus" value={formatMoney(t.thirdPartyHeldMinor, t.currency)} hint="Reçus mais pas encore reversés" icon={Wallet} tone={t.thirdPartyHeldMinor ? "warning" : "navy"} />
                  <StatCard label="Marge estimée" value={formatMoney(t.estimatedMarginMinor, t.currency)} hint="Frais de l'agence − dépenses de l'agence" icon={Wallet} tone="success" />
                </div>
              </Section>
              </>
            )}
            <Section title={`Reste à recevoir : ${formatMoney(t.balanceDueMinor, t.currency)}`}>
              <ul className="space-y-2">
                {d.balances
                  .filter((b) => b.finance.currency === t.currency)
                  .map((b) => (
                    <li key={b.travelCase.id}>
                      <Card className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <span className="min-w-0">
                          <Link href={`/cases/${b.travelCase.id}?tab=finance`} className="font-medium text-navy-800 hover:underline">
                            {b.travelCase.reference} · {b.client.firstName} {b.client.lastName}
                          </Link>
                          <span className="block truncate text-sm text-slate-600">{b.travelCase.title}</span>
                        </span>
                        <span className="text-left sm:text-right">
                          <span className="block font-semibold tabular-nums text-orange-800">{formatMoney(b.finance.balanceMinor, b.finance.currency)}</span>
                          {b.travelCase.plannedDepartureDate && (
                            <span className="block text-xs text-slate-500">Départ envisagé : {formatRelativeDay(`${b.travelCase.plannedDepartureDate}T12:00:00Z`, d.now, tz, false)}</span>
                          )}
                        </span>
                      </Card>
                    </li>
                  ))}
              </ul>
            </Section>
          </div>
        ))
      )}

      <div className="mt-6">
        <Notice title="Reçus internes">
          SELECT Agency émet des reçus de paiement internes. Ce ne sont pas des factures fiscales : selon le pays, une facturation
          certifiée peut être exigée. La marge est une estimation à partir des encaissements, pas un résultat comptable.
        </Notice>
      </div>
    </>
  );
}
