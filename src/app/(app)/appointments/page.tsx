import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "cn";
import { Pills } from "@/components/shared/navigation";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, Notice, PageHeader, PlannedAction, Section, StatusBadge } from "@/components/shared/ui";
import { APPOINTMENT_KIND, APPOINTMENT_STATUS } from "@/lib/domain/labels";
import { formatDate, formatRelativeDay } from "@/lib/format";
import { listAppointments } from "@/features/operations/queries";

export const metadata: Metadata = { title: "Rendez-vous" };

const WEEKDAYS = ["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."];

export default function AppointmentsPage({ searchParams }: PageProps<"/appointments">) {
  return (
    <>
      <PageHeader
        title="Rendez-vous et échéances"
        description="Entretiens, consultations, dépôts administratifs et dates limites. Un rendez-vous auprès d'un organisme n'est « confirmé » qu'avec une preuve."
        actions={<PlannedAction icon={CalendarPlus} label="Programmer un rendez-vous" reason="Formulaire prévu à la prochaine étape (Phase 4)." />}
      />
      <Suspense fallback={<PageSkeleton />}>
        <Agenda searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const monthParam = (m: { year: number; month: number }) => `${m.year}-${String(m.month).padStart(2, "0")}`;

async function Agenda({ searchParams }: Pick<PageProps<"/appointments">, "searchParams">) {
  const { vue, mois } = await searchParams;
  const view = vue === "mois" ? "mois" : "liste";
  const data = await listAppointments(typeof mois === "string" ? mois : undefined);
  const tz = data.agency.timezone;

  return (
    <>
      <Pills
        label="Affichage"
        active={view}
        items={[
          { key: "liste", label: "À venir", href: "/appointments" },
          { key: "mois", label: "Vue du mois", href: "/appointments?vue=mois" },
        ]}
      />

      {view === "liste" ? (
        <div className="space-y-6">
          <Section title="À venir">
            {data.upcoming.length === 0 ? (
              <p className="text-sm text-slate-600">Aucun rendez-vous à venir.</p>
            ) : (
              <ul className="space-y-2">
                {data.upcoming.map(({ appointment: a, clientName, caseRef, assignee }) => (
                  <li key={a.id}>
                    <Card className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-navy-800">{formatRelativeDay(a.startsAt, data.now, tz, !a.allDay)}</p>
                        <p className="text-slate-900">{a.title}</p>
                        <p className="text-sm text-slate-600">
                          {[APPOINTMENT_KIND[a.kind], clientName, caseRef, a.location, assignee?.fullName].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <StatusBadge spec={APPOINTMENT_STATUS[a.status]} />
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          {data.past.length > 0 && (
            <Section title="Passés">
              <ul className="space-y-2">
                {data.past.map(({ appointment: a, clientName }) => (
                  <li key={a.id} className="text-sm text-slate-600">
                    {formatDate(a.startsAt, tz, a.allDay ? "date" : "dateTime")} · {a.title}
                    {clientName && ` · ${clientName}`}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      ) : (
        <MonthGrid data={data} />
      )}

      <div className="mt-6">
        <Notice>
          SELECT Agency ne réserve aucun rendez-vous auprès des consulats ou des centres de dépôt : un rendez-vous administratif reste
          « en attente de confirmation » tant que la preuve de réservation n&apos;est pas au dossier.
        </Notice>
      </div>
    </>
  );
}

function MonthGrid({ data }: { data: Awaited<ReturnType<typeof listAppointments>> }) {
  const { year, month } = data.month;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7; // lundi = 0
  const cells = [...Array.from({ length: firstWeekday }, () => null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const title = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 15)));

  return (
    <Section>
      <div className="mb-4 flex items-center justify-between">
        <Link href={`/appointments?vue=mois&mois=${monthParam(data.month.previous)}`} className="inline-flex size-10 items-center justify-center rounded-lg bg-white text-navy-800 shadow-sm" aria-label="Mois précédent">
          <ChevronLeft className="size-5" />
        </Link>
        <h2 className="text-lg font-semibold text-navy-800 first-letter:uppercase">{title}</h2>
        <Link href={`/appointments?vue=mois&mois=${monthParam(data.month.next)}`} className="inline-flex size-10 items-center justify-center rounded-lg bg-white text-navy-800 shadow-sm" aria-label="Mois suivant">
          <ChevronRight className="size-5" />
        </Link>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-600" aria-hidden>
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <ol className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((day, index) => {
          if (!day) return <li key={`vide-${index}`} aria-hidden />;
          const key = `${data.month.key}-${String(day).padStart(2, "0")}`;
          const items = data.inMonth.filter((i) => i.day === key);
          return (
            <li key={key} className={cn("min-h-16 rounded-lg bg-white p-1 text-left sm:min-h-24 sm:p-1.5", key === data.today && "ring-2 ring-navy-700")}>
              <span className={cn("text-xs font-semibold", key === data.today ? "text-navy-800" : "text-slate-500")}>{day}</span>
              <ul className="mt-0.5 space-y-0.5">
                {items.map(({ appointment: a }) => (
                  <li key={a.id} className="truncate rounded bg-navy-50 px-1 text-[0.7rem] leading-5 text-navy-800 sm:text-xs" title={a.title}>
                    <span className="hidden sm:inline">{a.allDay ? "" : `${formatDate(a.startsAt, data.agency.timezone, "time")} `}</span>
                    {a.title}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
      {data.inMonth.length === 0 && <p className="mt-3 text-sm text-slate-600">Aucun rendez-vous ce mois-ci.</p>}
    </Section>
  );
}
