import { Suspense } from "react";
import type { Metadata } from "next";
import { CalendarCheck2 } from "lucide-react";
import { Pills } from "@/components/shared/navigation";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Card, EmptyState, Notice, PageHeader, Section, StatusBadge } from "@/components/shared/ui";
import { formatDuration, type DaySummary } from "@/lib/domain/attendance";
import { ATTENDANCE_SOURCE, type LabelSpec } from "@/lib/domain/labels";
import { timeKey } from "@/lib/format";
import {
  AttendanceSettingsForm,
  ClockPanel,
  CorrectAttendanceForm,
  CorrectEntryButton,
  DeclareArrivalForm,
  MissingDepartureForm,
} from "@/features/attendance/AttendanceForms";
import { ATTENDANCE_PERIODS, getAttendancePage } from "@/features/attendance/queries";
import { TasksSubNav } from "@/features/tasks/TasksSubNav";

export const metadata: Metadata = { title: "Présences" };

export default function PresencesPage({ searchParams }: PageProps<"/tasks/presences">) {
  return (
    <>
      <PageHeader title="Tâches" description="Présences de l'équipe : heures d'arrivée et de départ, enregistrées à l'heure du serveur au moment du pointage." />
      <TasksSubNav active="presences" />
      <Suspense fallback={<PageSkeleton />}>
        <Presences searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const WEEKDAY_NAMES = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

/** Badge de la journée d'un membre (équipe aujourd'hui). */
function todayBadge(s: DaySummary, timeZone: string, expectedStart: string): LabelSpec {
  if (s.present) {
    const since = s.firstArrival ? timeKey(s.firstArrival, timeZone) : "";
    return s.late ? { label: `Arrivé en retard (${formatDuration(s.lateMinutes)}) à ${since}`, tone: "warning" } : { label: `Présent depuis ${since}`, tone: "success" };
  }
  if (s.firstArrival) return { label: s.lastDeparture ? `Parti à ${timeKey(s.lastDeparture, timeZone)}` : "Parti", tone: "neutral" };
  if (!s.workday) return { label: "Jour non travaillé", tone: "neutral" };
  if (s.notYet) return { label: `Attendu à ${expectedStart}`, tone: "info" };
  return { label: `Absent (attendu à ${expectedStart})`, tone: "danger" };
}

async function Presences({ searchParams }: Pick<PageProps<"/tasks/presences">, "searchParams">) {
  const { periode, membre } = await searchParams;
  const p = await getAttendancePage(typeof periode === "string" ? periode : undefined, typeof membre === "string" ? membre : undefined);
  const tz = p.agency.timezone;
  const memberOptions = p.team.map((m) => ({ id: m.id, name: m.fullName }));
  const query = (params: { periode?: string; membre?: string }) => {
    const search = new URLSearchParams();
    const per = params.periode ?? p.period;
    if (per !== "semaine") search.set("periode", per);
    const mem = "membre" in params ? params.membre : p.filterMember;
    if (mem) search.set("membre", mem);
    const text = search.toString();
    return `/tasks/presences${text ? `?${text}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <Notice>
        Vos heures d&apos;arrivée et de départ sont enregistrées à l&apos;heure du serveur, jamais à celle de votre téléphone, et sans votre
        position. Elles sont visibles par vous, par le propriétaire et par les administrateurs de l&apos;agence.
      </Notice>

      <Section title="Ma présence aujourd'hui">
        <Card>
          <ClockPanel clock={p.clock} />
        </Card>
      </Section>

      {p.clock.writable && (
        <Section title="Un oubli ?" id="oublis">
          <div className="space-y-3">
            {p.clock.missing.map((m) => (
              <MissingDepartureForm key={m.id} missing={m} />
            ))}
            <details className="group rounded-xl bg-white p-4 shadow-[0_1px_3px_rgba(2,55,100,0.1)]">
              <summary className="flex min-h-10 cursor-pointer items-center font-medium text-navy-800">J&apos;ai oublié de pointer mon arrivée</summary>
              <p className="mt-1 mb-4 text-sm text-slate-600">
                Possible pendant 7 jours. L&apos;heure déclarée apparaît « déclarée après coup », avec votre raison, pour les responsables.
              </p>
              <DeclareArrivalForm today={p.today} minDay={p.minDeclareDay} />
            </details>
          </div>
        </Section>
      )}

      {p.canManage && (
        <Section title="L'équipe aujourd'hui">
          {p.teamToday.length === 0 ? (
            <p className="text-sm text-slate-600">Aucun membre actif.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {p.teamToday.map(({ member, summary }) => (
                <li key={member.id}>
                  <Card className="flex h-full flex-col gap-2">
                    <p className="font-semibold text-navy-800">{member.fullName}</p>
                    <StatusBadge spec={todayBadge(summary, tz, p.settings.expectedStart)} className="self-start" />
                    {summary.firstArrival && <p className="text-sm text-slate-600 tabular-nums">{formatDuration(summary.minutes)} aujourd&apos;hui</p>}
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      <Section title={p.canManage ? "Récapitulatif de l'équipe" : "Mon récapitulatif"}>
        <Pills label="Période" active={p.period} items={ATTENDANCE_PERIODS.map((x) => ({ key: x.key, label: x.label, href: query({ periode: x.key }) }))} />
        <div className="hidden overflow-hidden rounded-xl border border-slate-200 md:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs font-semibold text-slate-600">
              <tr>
                <th scope="col" className="px-4 py-3">Membre</th>
                <th scope="col" className="px-4 py-3">Heures</th>
                <th scope="col" className="px-4 py-3">Jours présents</th>
                <th scope="col" className="px-4 py-3">Retards</th>
                <th scope="col" className="px-4 py-3">Absences</th>
                <th scope="col" className="px-4 py-3">Départs anticipés</th>
                <th scope="col" className="px-4 py-3">Départs non pointés</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {p.totals.map(({ member, summary: s }) => (
                <tr key={member.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{member.fullName}</td>
                  <td className="px-4 py-3 tabular-nums">{formatDuration(s.minutes)}</td>
                  <td className="px-4 py-3 tabular-nums">{s.daysPresent}</td>
                  <td className={`px-4 py-3 tabular-nums ${s.lateDays ? "font-semibold text-orange-800" : ""}`}>{s.lateDays}</td>
                  <td className={`px-4 py-3 tabular-nums ${s.absences ? "font-semibold text-red-700" : ""}`}>{s.absences}</td>
                  <td className="px-4 py-3 tabular-nums">{s.earlyLeaves}</td>
                  <td className={`px-4 py-3 tabular-nums ${s.missingDepartures ? "font-semibold text-orange-800" : ""}`}>{s.missingDepartures}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="space-y-3 md:hidden">
          {p.totals.map(({ member, summary: s }) => (
            <li key={member.id}>
              <Card className="space-y-1">
                <p className="font-semibold text-navy-800">{member.fullName}</p>
                <p className="text-sm text-slate-700 tabular-nums">
                  {formatDuration(s.minutes)} · {s.daysPresent} jour{s.daysPresent > 1 ? "s" : ""} présent{s.daysPresent > 1 ? "s" : ""}
                </p>
                <p className="text-sm text-slate-600 tabular-nums">
                  {s.lateDays} retard{s.lateDays > 1 ? "s" : ""} · {s.absences} absence{s.absences > 1 ? "s" : ""} · {s.missingDepartures} départ
                  {s.missingDepartures > 1 ? "s" : ""} non pointé{s.missingDepartures > 1 ? "s" : ""}
                </p>
              </Card>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-500">
          {p.range.label}, jusqu&apos;à aujourd&apos;hui. Horaires de l&apos;agence : {p.settings.expectedStart} – {p.settings.expectedEnd}, le{" "}
          {p.settings.workDays.map((d) => WEEKDAY_NAMES[d - 1]).join(", ")}, tolérance de {p.settings.graceMinutes} min.
        </p>
      </Section>

      <Section title="Détail des présences">
        {p.canManage && p.team.length > 1 && (
          <Pills
            label="Membre"
            active={p.filterMember ?? "tous"}
            items={[
              { key: "tous", label: "Toute l'équipe", href: query({ membre: undefined }) },
              ...p.team.map((m) => ({ key: m.id, label: m.fullName, href: query({ membre: m.id }) })),
            ]}
          />
        )}
        {p.rows.length === 0 ? (
          <EmptyState icon={CalendarCheck2} title="Aucune présence sur la période" description="Les arrivées et départs pointés apparaîtront ici." />
        ) : (
          <ul className="space-y-2">
            {p.rows.map((row) => (
              <li key={row.entry.id}>
                <Card className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium text-slate-900">
                      {p.canManage && row.member ? `${row.member.fullName} · ` : ""}
                      <span className="inline-block first-letter:uppercase">{row.dayLabel}</span>
                    </p>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-700 tabular-nums">
                      <span>Arrivée {row.arrival}</span>
                      {row.entry.arrivalSource !== "clock" && <StatusBadge spec={ATTENDANCE_SOURCE[row.entry.arrivalSource]} />}
                      <span aria-hidden>·</span>
                      {row.departure ? (
                        <>
                          <span>Départ {row.departure}</span>
                          {row.entry.departureSource && row.entry.departureSource !== "clock" && <StatusBadge spec={ATTENDANCE_SOURCE[row.entry.departureSource]} />}
                        </>
                      ) : row.status === "open" ? (
                        <StatusBadge spec={{ label: "Présent", tone: "success" }} />
                      ) : (
                        <StatusBadge spec={{ label: "Départ non pointé", tone: "warning" }} />
                      )}
                      {row.minutes > 0 && (
                        <>
                          <span aria-hidden>·</span>
                          <span className="font-medium">{formatDuration(row.minutes)}</span>
                        </>
                      )}
                    </p>
                    {(row.entry.note || row.correctedBy) && (
                      <p className="text-xs text-slate-500">
                        {row.entry.note && `Raison : ${row.entry.note}`}
                        {row.correctedBy && ` · corrigée par ${row.correctedBy}`}
                      </p>
                    )}
                  </div>
                  {p.canEdit && <CorrectEntryButton entry={{ id: row.entry.id, day: row.entry.workDay, arrival: row.arrival, departure: row.departure }} today={p.today} />}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {p.canEdit && memberOptions.length > 0 && (
        <Section title="Ajouter une présence pour un membre">
          <Card>
            <p className="mb-4 text-sm text-slate-600">Par exemple pour un membre sans téléphone ce jour-là. La présence est marquée « corrigée par un responsable ».</p>
            <CorrectAttendanceForm members={memberOptions} today={p.today} />
          </Card>
        </Section>
      )}

      {p.canManage && (
        <Section title="Horaires de l'agence">
          {p.canEdit ? (
            <Card>
              <AttendanceSettingsForm settings={p.settings} />
            </Card>
          ) : (
            <Notice tone="warning">L&apos;agence est en lecture seule : les horaires seront modifiables dès l&apos;activation de l&apos;abonnement.</Notice>
          )}
        </Section>
      )}
    </div>
  );
}
