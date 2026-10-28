import { Suspense } from "react";
import type { Metadata } from "next";
import { BarList, MonthlyColumns } from "@/components/shared/charts";
import { Pills } from "@/components/shared/navigation";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, Notice, PageHeader, PlannedAction, Section } from "@/components/shared/ui";
import { countryName } from "@/lib/countries";
import { CATEGORY_LABELS, ROLE, STEP_KIND } from "@/lib/domain/labels";
import type { CaseCategory, StepKind } from "@/lib/domain/types";
import { formatMoney } from "@/lib/format";
import { PERIOD_OPTIONS } from "@/lib/period";
import { getReports } from "@/features/finance/queries";
import { FinanceRestricted } from "@/features/finance/FinanceRestricted";
import { Download } from "lucide-react";

export const metadata: Metadata = { title: "Rapports" };

export default function ReportsPage({ searchParams }: PageProps<"/reports">) {
  return (
    <>
      <PageHeader
        title="Rapports"
        description="Volume d'activité, répartition des dossiers, finances par devise et charge de travail de l'équipe."
        actions={<PlannedAction icon={Download} label="Exporter en CSV" reason="Export prévu avec la base de données (Phase 5)." />}
      />
      <Suspense fallback={<PageSkeleton />}>
        <Reports searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Reports({ searchParams }: Pick<PageProps<"/reports">, "searchParams">) {
  const { periode } = await searchParams;
  const r = await getReports(typeof periode === "string" ? periode : "annee");

  return (
    <div className="space-y-6">
      {!r.canSeeFinance && <FinanceRestricted />}
      <Pills label="Période" active={r.period.key} items={PERIOD_OPTIONS.map((p) => ({ key: p.key, label: p.label, href: `/reports?periode=${p.key}` }))} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Dossiers ouverts par type">
          <p className="mb-3 text-sm text-slate-600">
            {r.openedCount} dossier(s) ouvert(s) et {r.closedCount} clôturé(s) · {r.period.label.toLowerCase()}
          </p>
          <BarList emptyLabel="Aucun dossier ouvert sur la période." items={r.byCategory.map((x) => ({ label: CATEGORY_LABELS[x.key as CaseCategory], value: x.count }))} />
        </Section>
        <Section title="Dossiers ouverts par destination">
          <BarList emptyLabel="Aucun dossier ouvert sur la période." items={r.byDestination.map((x) => ({ label: countryName(x.key), value: x.count }))} />
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Évolution mensuelle" className="lg:col-span-2">
          <MonthlyColumns
            months={r.monthly}
            series={[
              { name: "Dossiers ouverts", className: "bg-navy-700", values: r.monthly.map((m) => m.opened) },
              { name: "Dossiers clôturés", className: "bg-citron-500", values: r.monthly.map((m) => m.closed) },
            ]}
          />
        </Section>
        <Section title="Dossiers actifs : qui doit agir">
          <BarList emptyLabel="Aucun dossier actif." items={r.waiting.map((x) => ({ label: STEP_KIND[x.key as StepKind].waitingLabel, value: x.count }))} />
        </Section>
      </div>

      <Section title={`Encaissements mensuels (${r.agency.currency})`}>
        <BarList emptyLabel="Aucun encaissement." items={r.monthly.map((m) => ({ label: m.label, value: m.receivedMinor, display: formatMoney(m.receivedMinor, r.agency.currency) }))} />
      </Section>

      {r.finance.map((f) => (
        <Section key={f.currency} title={`Finances de la période (${f.currency})`}>
          <Card>
            <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["Encaissé", f.receivedMinor],
                ["Frais de l'agence (revenus propres)", f.agencyRevenueMinor],
                ["Fonds reçus pour des tiers", f.thirdPartyReceivedMinor],
                ["Dépenses de l'agence", f.operatingExpensesMinor],
                ["Reversé pour des clients", f.disbursementsMinor],
                ["Marge estimée", f.estimatedMarginMinor],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">{formatMoney(value as number, f.currency)}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </Section>
      ))}

      <Section title="Charge de travail de l'équipe">
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="bg-surface text-xs font-semibold text-slate-600">
              <tr>
                <th scope="col" className="px-4 py-3">Membre</th>
                <th scope="col" className="px-4 py-3">Dossiers actifs</th>
                <th scope="col" className="px-4 py-3">Tâches ouvertes</th>
                <th scope="col" className="px-4 py-3">Tâches en retard</th>
                <th scope="col" className="px-4 py-3">Tâches terminées</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {r.workload.map((w) => (
                <tr key={w.member.id}>
                  <td className="px-4 py-3">
                    <span className="font-medium text-slate-900">{w.member.fullName}</span>
                    <span className="block text-xs text-slate-500">{ROLE[w.member.role].label}</span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{w.activeCases}</td>
                  <td className="px-4 py-3 tabular-nums">{w.openTasks}</td>
                  <td className={`px-4 py-3 tabular-nums ${w.overdueTasks ? "font-semibold text-red-700" : ""}`}>{w.overdueTasks}</td>
                  <td className="px-4 py-3 tabular-nums">{w.doneInPeriod}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-slate-600">
          La charge de travail ne mesure que ce qui dépend de l&apos;équipe. Le nombre de visas accordés n&apos;est jamais utilisé comme
          mesure de la performance d&apos;un agent : ces décisions appartiennent aux autorités.
        </p>
      </Section>

      <Notice>Les rapports sont calculés à partir des données de démonstration de cette session.</Notice>
    </div>
  );
}
