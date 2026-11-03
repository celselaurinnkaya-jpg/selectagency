import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { AlarmClock, CalendarClock, CheckCircle2, Target, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pills } from "@/components/shared/navigation";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, EmptyState, PageHeader, StatCard, StatusBadge } from "@/components/shared/ui";
import { CLIENT_SOURCE, SERVICE_MOTIVES } from "@/lib/domain/labels";
import { formatDate, formatRelativeDay, initials } from "@/lib/format";
import { isProspectFilter, listProspects, type ProspectFilter } from "@/features/prospects/queries";

export const metadata: Metadata = { title: "Prospects" };

const FILTERS: { key: ProspectFilter; label: string }[] = [
  { key: "tous", label: "En cours" },
  { key: "a-relancer", label: "À relancer" },
  { key: "sans-relance", label: "Sans relance prévue" },
  { key: "devenus-clients", label: "Devenus clients" },
];

export default function ProspectsPage({ searchParams }: PageProps<"/prospects">) {
  return (
    <>
      <PageHeader
        title="Prospects"
        description="Les personnes qui ont pris contact sans être encore clientes : d'où elles viennent et quand les relancer. La même fiche devient client, à la main ou dès qu'un dossier lui est ouvert ou qu'elle est ajoutée à un service."
        actions={
          <Button asChild variant="accent">
            <Link href="/prospects/new">
              <UserPlus aria-hidden />
              Nouveau prospect
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<PageSkeleton />}>
        <Prospects searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Prospects({ searchParams }: Pick<PageProps<"/prospects">, "searchParams">) {
  const { vue } = await searchParams;
  const filter: ProspectFilter = isProspectFilter(vue) ? vue : "tous";
  const { rows, counts, convertedThisMonth, newThisMonth, agency, now } = await listProspects(filter);
  const tz = agency.timezone;
  const href = (key: ProspectFilter) => (key === "tous" ? "/prospects" : `/prospects?vue=${key}`);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Prospects en cours" value={counts.tous} hint={`${newThisMonth} nouveau(x) ce mois-ci`} icon={Target} href={href("tous")} />
        <StatCard label="À relancer" value={counts["a-relancer"]} hint="Aujourd'hui ou en retard" icon={AlarmClock} href={href("a-relancer")} tone={counts["a-relancer"] ? "warning" : "navy"} />
        <StatCard label="Sans relance prévue" value={counts["sans-relance"]} hint="Ni relance ni rendez-vous" icon={CalendarClock} href={href("sans-relance")} tone={counts["sans-relance"] ? "danger" : "navy"} />
        <StatCard label="Devenus clients" value={convertedThisMonth} hint="Ce mois-ci" icon={CheckCircle2} href={href("devenus-clients")} tone="success" />
      </div>

      <div>
        <Pills label="Filtrer les prospects" active={filter} items={FILTERS.map((f) => ({ key: f.key, label: f.label, href: href(f.key), count: counts[f.key] }))} />
        {rows.length === 0 ? (
          <EmptyState
            icon={Target}
            title={filter === "tous" ? "Aucun prospect pour le moment" : filter === "devenus-clients" ? "Aucun prospect devenu client ces trois derniers mois" : "Rien à afficher ici"}
            description={
              filter === "tous"
                ? "Enregistrez chaque personne qui vous contacte (Facebook, Instagram, WhatsApp, recommandation…) et planifiez sa relance."
                : filter === "a-relancer"
                  ? "Aucune relance prévue aujourd'hui ni en retard."
                  : filter === "sans-relance"
                    ? "Chaque prospect a une relance ou un rendez-vous de prévu."
                    : undefined
            }
            action={
              filter === "tous" ? (
                <Button asChild variant="accent">
                  <Link href="/prospects/new">Enregistrer un prospect</Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {rows.map(({ client: c, advisor, nextFollowUp, nextAppointment, dueToday }) => (
              <li key={c.id}>
                <Card className="h-full space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-navy-800 font-semibold text-citron-400">
                      {initials(`${c.firstName} ${c.lastName}`)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <Link href={`/clients/${c.id}`} className="block truncate font-semibold text-navy-800 hover:underline">
                        {c.firstName} {c.lastName}
                      </Link>
                      <span className="block truncate text-sm text-slate-600">
                        <a href={`tel:${c.phoneE164}`} className="tabular-nums hover:underline">
                          {c.phoneE164}
                        </a>
                        {c.serviceMotive && ` · ${SERVICE_MOTIVES[c.serviceMotive] ?? c.serviceMotive}`}
                      </span>
                    </span>
                    {c.source && <StatusBadge spec={{ label: CLIENT_SOURCE[c.source], tone: "navy" }} />}
                  </div>
                  {c.sourceDetail && <p className="text-sm text-slate-600">{c.source === "referral" ? "Recommandé par" : "Origine"} : {c.sourceDetail}</p>}
                  <dl className="grid gap-1 border-t border-slate-100 pt-3 text-sm">
                    {filter === "devenus-clients" ? (
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-500">Devenu client</dt>
                        <dd className="font-medium text-emerald-800">{c.convertedAt && formatDate(c.convertedAt, tz)}</dd>
                      </div>
                    ) : (
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-500">Prochaine relance</dt>
                        <dd className={nextFollowUp ? (dueToday ? "font-semibold text-red-700" : "font-medium text-slate-900") : "font-medium text-orange-800"}>
                          {nextFollowUp ? formatRelativeDay(nextFollowUp.dueAt, now, tz) : "Aucune"}
                        </dd>
                      </div>
                    )}
                    {nextAppointment && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-500">Rendez-vous</dt>
                        <dd className="font-medium text-slate-900">{formatRelativeDay(nextAppointment.startsAt, now, tz)}</dd>
                      </div>
                    )}
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Conseiller</dt>
                      <dd className="truncate text-slate-900">{advisor ?? "—"}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Premier contact</dt>
                      <dd className="text-slate-900">{formatDate(c.registeredAt, tz)}</dd>
                    </div>
                  </dl>
                  <Button asChild variant="outline">
                    <Link href={`/clients/${c.id}`}>Ouvrir la fiche</Link>
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
