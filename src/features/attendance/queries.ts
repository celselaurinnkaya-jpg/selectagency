import "server-only";
import { getAgencyContext, type AgencyContext } from "@/lib/auth/context";
import { allowed, can } from "@/lib/auth/permissions";
import { fetchRows } from "@/lib/data/agency";
import { ATTENDANCE_ENTRY, ATTENDANCE_SETTINGS, MEMBER, toAttendanceEntry, toAttendanceSettings, toMember } from "@/lib/data/rows";
import {
  addDays,
  effectiveStatus,
  entryMinutes,
  formatDuration,
  periodDays,
  summarizeDay,
  summarizePeriod,
  type AttendancePeriod,
  type DaySummary,
  type PeriodSummary,
} from "@/lib/domain/attendance";
import { activeMembers } from "@/lib/domain/members";
import type { AttendanceEntry, AttendanceSettings, Member } from "@/lib/domain/types";
import { dayKey, formatDate, timeKey } from "@/lib/format";

// Présences : l'écran ne fait qu'afficher. Les heures sont écrites par la base (heure du serveur), et la règle
// d'accès ne donne à chacun que ses présences, sauf au propriétaire et aux administrateurs.

/** Une déclaration d'oubli est possible pendant 7 jours (même règle que la base). */
const DECLARE_DAYS = 7;

export async function loadAttendanceSettings(ctx: AgencyContext): Promise<AttendanceSettings> {
  const { data, error } = await ctx.supabase.from("attendance_settings").select(ATTENDANCE_SETTINGS.list).eq("organization_id", ctx.organizationId).maybeSingle();
  if (error) throw new Error(`Lecture des horaires impossible : ${error.message}`);
  return toAttendanceSettings(data);
}

/**
 * Membres dispensés de pointage (rapport de re-test du 22/11 : le propriétaire était compté absent).
 * Avant la migration 20261122140000, la colonne n'existe pas : personne n'est dispensé.
 */
export async function loadAttendanceExemptions(ctx: AgencyContext): Promise<string[]> {
  const { data, error } = await ctx.supabase.from("attendance_settings").select("exempt_member_ids").eq("organization_id", ctx.organizationId).maybeSingle();
  if (error || !data) return [];
  return ((data.exempt_member_ids as string[] | null) ?? []).map(String);
}

async function loadEntries(ctx: AgencyContext, since: string, memberId?: string): Promise<AttendanceEntry[]> {
  const rows = await fetchRows(
    ctx,
    "attendance_entries",
    ATTENDANCE_ENTRY.list,
    (q) => (memberId ? q.gte("work_day", since).eq("member_id", memberId) : q.gte("work_day", since)),
    ["arrived_at", "id"],
  );
  return rows.map(toAttendanceEntry);
}

/** Libellé d'un jour : « vendredi 6 novembre ». */
export const dayLabel = (day: string) => formatDate(`${day}T12:00:00Z`, "UTC", "weekday");

export interface MissingDeparture {
  id: string;
  day: string;
  label: string;
  arrival: string;
}

/** État du bouton de pointage du membre connecté (tableau de bord et page Présences). */
export interface ClockState {
  /** « out » : rien aujourd'hui ; « in » : présent ; « back » : parti, peut pointer un retour. */
  status: "out" | "in" | "back";
  headline: string;
  detail?: string;
  late?: string;
  missing: MissingDeparture[];
  writable: boolean;
  /** Dispensé de pointage par l'agence : pas de bouton, jamais compté absent. */
  exempt?: boolean;
}

function clockState(entries: AttendanceEntry[], settings: AttendanceSettings, now: Date, timeZone: string, today: string, writable: boolean): ClockState {
  const day = summarizeDay(entries, today, settings, now, timeZone, today);
  const todays = entries.filter((e) => e.workDay === today).sort((a, b) => a.arrivedAt.localeCompare(b.arrivedAt));
  const open = todays.find((e) => effectiveStatus(e, today) === "open");
  const missing = entries
    .filter((e) => effectiveStatus(e, today) === "missing_departure" && e.workDay >= addDays(today, -DECLARE_DAYS))
    .map((e) => ({ id: e.id, day: e.workDay, label: dayLabel(e.workDay), arrival: timeKey(e.arrivedAt, timeZone) }));
  const late = day.late ? `Arrivée en retard de ${formatDuration(day.lateMinutes)}` : undefined;
  if (open) {
    return {
      status: "in",
      headline: `Présent depuis ${timeKey(open.arrivedAt, timeZone)}`,
      detail: `${formatDuration(day.minutes)} aujourd'hui`,
      late,
      missing,
      writable,
    };
  }
  if (todays.length) {
    const last = todays.at(-1)!;
    return {
      status: "back",
      headline: `Départ pointé à ${last.leftAt ? timeKey(last.leftAt, timeZone) : "—"}`,
      detail: `${formatDuration(day.minutes)} aujourd'hui`,
      late,
      missing,
      writable,
    };
  }
  return {
    status: "out",
    headline: "Arrivée pas encore pointée",
    detail: day.workday ? `Arrivée attendue à ${settings.expectedStart}` : "Jour non travaillé à l'agence",
    missing,
    writable,
  };
}

/** Bouton de pointage du membre connecté. */
export async function getMyClock(): Promise<ClockState> {
  const ctx = await getAgencyContext();
  const now = new Date();
  const tz = ctx.agency.timezone;
  const today = dayKey(now, tz);
  const [settings, entries, exempt] = await Promise.all([
    loadAttendanceSettings(ctx),
    loadEntries(ctx, addDays(today, -DECLARE_DAYS), ctx.member.id),
    loadAttendanceExemptions(ctx),
  ]);
  return { ...clockState(entries, settings, now, tz, today, ctx.writable), exempt: exempt.includes(ctx.member.id) };
}

export const ATTENDANCE_PERIODS: { key: AttendancePeriod; label: string }[] = [
  { key: "semaine", label: "Cette semaine" },
  { key: "mois", label: "Ce mois-ci" },
  { key: "mois-precedent", label: "Le mois dernier" },
];

export interface TeamToday {
  member: Member;
  summary: DaySummary;
}

export interface EntryRow {
  entry: AttendanceEntry;
  member?: Member;
  dayLabel: string;
  arrival: string;
  departure?: string;
  status: ReturnType<typeof effectiveStatus>;
  minutes: number;
  correctedBy?: string;
}

/** Page « Présences » : mon pointage, l'équipe aujourd'hui (responsables), les totaux et le détail. */
export async function getAttendancePage(periodParam: string | undefined, memberParam: string | undefined) {
  const ctx = await getAgencyContext();
  const now = new Date();
  const tz = ctx.agency.timezone;
  const today = dayKey(now, tz);
  const canManage = can(ctx.member.role, "attendance.manage");
  const period = ATTENDANCE_PERIODS.find((p) => p.key === periodParam)?.key ?? "semaine";
  const range = periodDays(period, today);
  const since = [range.from, addDays(today, -DECLARE_DAYS)].sort()[0]!;

  const [settings, entries, memberRows, exemptIds] = await Promise.all([
    loadAttendanceSettings(ctx),
    loadEntries(ctx, since, canManage ? undefined : ctx.member.id),
    fetchRows(ctx, "members", MEMBER.list),
    loadAttendanceExemptions(ctx),
  ]);
  const allMembers = memberRows.map(toMember);
  // Les membres dispensés de pointage ne sont ni attendus ni comptés absents.
  const pointingTeam = activeMembers(allMembers).filter((m) => m.hasAccount !== false);
  const team = (canManage ? pointingTeam : allMembers.filter((m) => m.id === ctx.member.id)).filter((m) => !exemptIds.includes(m.id));
  const byMember = (id: string) => entries.filter((e) => e.memberId === id);

  const teamToday: TeamToday[] = canManage ? team.map((member) => ({ member, summary: summarizeDay(byMember(member.id), today, settings, now, tz, today) })) : [];
  const totals: { member: Member; summary: PeriodSummary }[] = team.map((member) => ({
    member,
    summary: summarizePeriod(byMember(member.id), range.days, settings, now, tz, today),
  }));

  const filterMember = canManage && team.some((m) => m.id === memberParam) ? memberParam : undefined;
  const rows: EntryRow[] = entries
    .filter((e) => e.workDay >= range.from && e.workDay <= range.to && (!filterMember || e.memberId === filterMember))
    .sort((a, b) => b.arrivedAt.localeCompare(a.arrivedAt))
    .map((entry) => ({
      entry,
      member: allMembers.find((m) => m.id === entry.memberId),
      dayLabel: dayLabel(entry.workDay),
      arrival: timeKey(entry.arrivedAt, tz),
      departure: entry.leftAt ? timeKey(entry.leftAt, tz) : undefined,
      status: effectiveStatus(entry, today),
      minutes: entryMinutes(entry, now, today),
      correctedBy: entry.correctedBy ? allMembers.find((m) => m.id === entry.correctedBy)?.fullName : undefined,
    }));

  return {
    agency: ctx.agency,
    me: ctx.member,
    clock: { ...clockState(byMember(ctx.member.id), settings, now, tz, today, ctx.writable), exempt: exemptIds.includes(ctx.member.id) },
    // Pour le choix des membres dispensés (responsables).
    pointingTeam: canManage ? pointingTeam.map((m) => ({ id: m.id, name: m.fullName, exempt: exemptIds.includes(m.id) })) : [],
    canManage,
    canEdit: allowed(ctx, "attendance.manage"),
    settings,
    today,
    minDeclareDay: addDays(today, -DECLARE_DAYS),
    period,
    range,
    team,
    teamToday,
    totals,
    rows,
    filterMember,
  };
}
