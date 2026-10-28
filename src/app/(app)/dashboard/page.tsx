import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileSearch,
  FileWarning,
  FolderKanban,
  FolderPlus,
  Hourglass,
  ListChecks,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { BarList, MonthlyColumns } from "@/components/shared/charts";
import { Pills } from "@/components/shared/navigation";
import { Card, EmptyState, Notice, Section, StatCard, StatusBadge, Tile } from "@/components/shared/ui";
import { countryName } from "@/lib/countries";
import { APPOINTMENT_KIND, APPOINTMENT_STATUS, STEP_KIND } from "@/lib/domain/labels";
import { formatDate, formatMoney, formatRelativeDay } from "@/lib/format";
import { PERIOD_OPTIONS } from "@/lib/period";
import { getDashboard } from "@/features/dashboard/queries";

export const metadata: Metadata = { title: "Tableau de bord" };

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}

async function Dashboard({ searchParams }: Pick<PageProps<"/dashboard">, "searchParams">) {
  const { periode } = await searchParams;
  const d = await getDashboard(typeof periode === "string" ? periode : undefined);
  const tz = d.agency.timezone;

  if (d.isEmpty) {
    return (
      <EmptyState
        icon={FolderPlus}
        title="Bienvenue dans votre espace"
        description="Votre agence ne contient encore aucun client. Commencez par enregistrer un client, puis ouvrez son premier dossier."
        action={
          <Button asChild variant="accent">
            <Link href="/clients/new">Enregistrer un client</Link>
          </Button>
        }
      />
    );
  }

  const documentsToReview = d.toHandle.filter((i) => i.kind === "document").length;

  return (
    <div className="space-y-6">
      {/* Bannière de bienvenue (référence UNIP) */}
      <div className="rounded-2xl bg-linear-to-r from-navy-900 via-navy-800 to-navy-600 px-5 py-5 text-white shadow-sm sm:px-7 sm:py-6">
        <h1 className="text-xl font-semibold sm:text-2xl">
          Bienvenue à nouveau, <span className="text-citron-400 uppercase">{d.member.fullName}</span>
        </h1>
        <p className="mt-1 text-sm text-navy-100 sm:text-base">
          {d.agency.name} · <span className="inline-block first-letter:uppercase">{formatDate(d.now.toISOString(), tz, "weekday")}</span>
        </p>
      </div>

      <Section title="Accès rapide">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <Tile href="/cases/new" label="Nouveau dossier" icon={FolderPlus} highlight />
          <Tile href="/clients/new" label="Nouveau client" icon={UserPlus} />
          <Tile href="/documents" label="Documents à examiner" icon={FileSearch} badge={documentsToReview ? String(documentsToReview) : undefined} />
          <Tile href="/appointments" label="Rendez-vous" icon={CalendarDays} />
          <Tile href="/tasks" label="Tâches" icon={ListChecks} badge={d.kpis.overdueTasks ? `${d.kpis.overdueTasks} en retard` : undefined} />
          <Tile href="/finance" label="Finance" icon={Wallet} />
        </div>
      </Section>

      <Section title="À traiter aujourd'hui" id="a-traiter" action={<Link href="/tasks" className="text-sm font-medium text-navy-700 hover:underline">Toutes les tâches</Link>}>
        {d.toHandle.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="Rien d'urgent pour aujourd'hui" description="Aucune tâche échue, aucun document en attente d'examen, aucune action en retard." />
        ) : (
          <ul className="space-y-2">
            {d.toHandle.map((item) => (
              <li key={item.id}>
                <Link href={item.href} className="flex items-start gap-3 rounded-xl bg-white p-3 shadow-[0_1px_2px_rgba(2,55,100,0.08)] hover:ring-2 hover:ring-navy-200">
                  <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${item.overdue ? "bg-red-50 text-red-700" : "bg-navy-50 text-navy-700"}`}>
                    {item.kind === "document" ? <FileSearch className="size-4" /> : item.overdue ? <AlertTriangle className="size-4" /> : <Clock className="size-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-900">{item.title}</span>
                    <span className="block truncate text-sm text-slate-600">{item.context}</span>
                  </span>
                  {item.dueAt && (
                    <span className={`shrink-0 text-right text-xs ${item.overdue ? "font-semibold text-red-700" : "text-slate-500"}`}>
                      {item.overdue ? "En retard · " : item.kind === "document" ? "Reçu " : ""}
                      {formatRelativeDay(item.dueAt, d.now, tz)}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Activité de l'agence">
        <Pills
          label="Période"
          active={d.period.key}
          items={PERIOD_OPTIONS.map((p) => ({ key: p.key, label: p.label, href: p.key === "mois" ? "/dashboard" : `/dashboard?periode=${p.key}` }))}
        />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Clients" value={d.kpis.clients} hint="Fiches actives" icon={Users} href="/clients" />
          <StatCard label="Dossiers actifs" value={d.kpis.activeCases} hint="En cours de traitement" icon={FolderKanban} href="/cases" />
          <StatCard label="En attente du client" value={d.kpis.waitingClient} hint="Pièces ou décision du client" icon={Hourglass} href="/cases?attente=client_action" tone="warning" />
          <StatCard label="En attente d'un tiers" value={d.kpis.waitingThirdParty} hint="Établissement, consulat, administration" icon={Hourglass} href="/cases?attente=external_event" />
          <StatCard label="Dossiers incomplets" value={d.kpis.incomplete} hint={`${d.kpis.missingDocuments} pièce(s) obligatoire(s) manquante(s)`} icon={FileWarning} href="/documents?vue=manquants" tone={d.kpis.incomplete ? "danger" : "navy"} />
          <StatCard label="Rendez-vous" value={d.kpis.upcomingAppointments} hint="Dans les 7 prochains jours" icon={CalendarDays} href="/appointments" />
          <StatCard label="Tâches en retard" value={d.kpis.overdueTasks} hint="Échéance dépassée" icon={AlertTriangle} href="/tasks?vue=en-retard" tone={d.kpis.overdueTasks ? "danger" : "navy"} />
          <StatCard label="Dossiers clôturés" value={d.kpis.closedInPeriod} hint={d.period.label} icon={CheckCircle2} href="/cases?statut=closed" tone="success" />
        </div>
      </Section>

      <Section title="Finances" action={<Link href="/finance" className="text-sm font-medium text-navy-700 hover:underline">Détail financier</Link>}>
        {d.finance.length === 0 ? (
          <p className="text-sm text-slate-600">Aucun paiement ni dépense enregistré.</p>
        ) : (
          d.finance.map((f) => (
            <div key={f.currency} className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
              <StatCard label="Encaissé" value={formatMoney(f.receivedMinor, f.currency)} hint={d.period.label} icon={Wallet} />
              <StatCard label="Dont frais de l'agence" value={formatMoney(f.agencyRevenueMinor, f.currency)} hint="Revenus propres" icon={Wallet} />
              <StatCard label="Dont fonds pour des tiers" value={formatMoney(f.thirdPartyReceivedMinor, f.currency)} hint="Frais officiels, établissements" icon={Wallet} />
              <StatCard label="Reste à recevoir" value={formatMoney(f.balanceDueMinor, f.currency)} hint="Dossiers actifs" icon={Wallet} tone={f.balanceDueMinor ? "warning" : "navy"} />
              <StatCard label="Dépenses de l'agence" value={formatMoney(f.operatingExpensesMinor, f.currency)} hint={d.period.label} icon={Wallet} />
              <StatCard label="Marge estimée" value={formatMoney(f.estimatedMarginMinor, f.currency)} hint="Sur les encaissements, hors comptabilité" icon={Wallet} tone="success" />
            </div>
          ))
        )}
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Prochains rendez-vous" action={<Link href="/appointments" className="text-sm font-medium text-navy-700 hover:underline">Calendrier</Link>}>
          {d.upcoming.length === 0 ? (
            <p className="text-sm text-slate-600">Aucun rendez-vous dans les 7 prochains jours.</p>
          ) : (
            <ul className="space-y-2">
              {d.upcoming.map(({ appointment: a, clientName, caseRef }) => (
                <li key={a.id}>
                  <Card className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-navy-800">{formatRelativeDay(a.startsAt, d.now, tz, !a.allDay)}</p>
                      <p className="text-sm text-slate-900">{a.title}</p>
                      <p className="truncate text-sm text-slate-600">
                        {[APPOINTMENT_KIND[a.kind], clientName, caseRef].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <StatusBadge spec={APPOINTMENT_STATUS[a.status]} />
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Dossiers à suivre" action={<Link href="/cases" className="text-sm font-medium text-navy-700 hover:underline">Tous les dossiers</Link>}>
          <ul className="space-y-2">
            {d.recentCases.map((s) => (
              <li key={s.travelCase.id}>
                <Link href={`/cases/${s.travelCase.id}`} className="block rounded-xl bg-white p-3 shadow-[0_1px_2px_rgba(2,55,100,0.08)] hover:ring-2 hover:ring-navy-200">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-slate-500">{s.travelCase.reference}</span>
                    {s.waitingOn && <StatusBadge spec={{ label: STEP_KIND[s.waitingOn].waitingLabel, tone: STEP_KIND[s.waitingOn].tone }} />}
                  </div>
                  <p className="mt-1 text-sm font-medium text-slate-900">
                    {s.client.firstName} {s.client.lastName} · {countryName(s.travelCase.destinationCountry)}
                  </p>
                  {s.travelCase.nextAction && (
                    <p className={`text-sm ${s.isOverdue ? "text-red-700" : "text-slate-600"}`}>
                      {s.travelCase.nextAction}
                      {s.travelCase.nextActionDueAt && ` · ${formatRelativeDay(s.travelCase.nextActionDueAt, d.now, tz, false)}`}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Section title="Dossiers ouverts et clôturés" className="xl:col-span-2">
          <MonthlyColumns
            months={d.series}
            series={[
              { name: "Dossiers ouverts", className: "bg-navy-700", values: d.series.map((s) => s.opened) },
              { name: "Dossiers clôturés", className: "bg-citron-500", values: d.series.map((s) => s.closed) },
            ]}
          />
        </Section>
        <Section title="Destinations en cours">
          <BarList emptyLabel="Aucun dossier actif." items={d.destinations.map((x) => ({ label: countryName(x.code), value: x.count }))} />
        </Section>
      </div>

      <Section title="Dernières activités">
        <ol className="space-y-3">
          {d.activity.map(({ event, actor }) => (
            <li key={event.id} className="flex gap-3 text-sm">
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-navy-700" aria-hidden />
              <span>
                <span className="text-slate-900">{event.text}</span>
                <span className="block text-xs text-slate-500">
                  {formatRelativeDay(event.at, d.now, tz)} · {actor?.fullName}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </Section>

      <Notice>
        Les étapes indiquent l&apos;avancement du travail de l&apos;agence. Les décisions de visa et d&apos;admission
        relèvent exclusivement des autorités et des établissements concernés.
      </Notice>
    </div>
  );
}
