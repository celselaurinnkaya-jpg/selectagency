import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { Pills } from "@/components/shared/navigation";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, Notice, PageHeader, Section, StatCard } from "@/components/shared/ui";
import { formatMoney, formatRelativeDay } from "@/lib/format";
import { PERIOD_OPTIONS } from "@/lib/period";
import { getFinanceOverview } from "@/features/finance/queries";
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
      <Pills label="Période" active={d.period.key} items={PERIOD_OPTIONS.map((p) => ({ key: p.key, label: p.label, href: p.key === "mois" ? "/finance" : `/finance?periode=${p.key}` }))} />

      {d.totals.length === 0 ? (
        <p className="text-sm text-slate-600">Aucun mouvement enregistré.</p>
      ) : (
        d.totals.map((t) => (
          <div key={t.currency} className="space-y-6">
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
