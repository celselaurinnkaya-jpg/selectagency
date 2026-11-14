import { localDateTimeToIso } from "@/lib/period";
import type { AttendanceEntry, AttendanceSettings, AttendanceStatus } from "./types";

// Présences : retards, absences et totaux, d'après les horaires de l'agence. Fonctions pures (testées) ;
// les heures elles-mêmes sont enregistrées par la base, à l'heure du serveur.

const MINUTE = 60_000;

/** Jour de la semaine ISO d'une date AAAA-MM-JJ : 1 = lundi … 7 = dimanche. */
export function isoWeekday(day: string): number {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

/** Ajoute des jours à une date AAAA-MM-JJ. */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Une présence ouverte d'un jour passé n'a pas de départ pointé (la base la marque au pointage suivant). */
export function effectiveStatus(entry: Pick<AttendanceEntry, "status" | "workDay">, today: string): AttendanceStatus {
  return entry.status === "open" && entry.workDay < today ? "missing_departure" : entry.status;
}

/** Minutes de présence : départ connu, ou en cours aujourd'hui ; 0 si le départ n'a pas été pointé. */
export function entryMinutes(entry: AttendanceEntry, now: Date, today: string): number {
  const status = effectiveStatus(entry, today);
  if (status === "missing_departure") return 0;
  const end = entry.leftAt ? new Date(entry.leftAt).getTime() : now.getTime();
  return Math.max(0, Math.round((end - new Date(entry.arrivedAt).getTime()) / MINUTE));
}

/** « 8 h 05 », « 45 min ». */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

export interface DaySummary {
  day: string;
  workday: boolean;
  firstArrival?: string;
  /** Dernier départ, seulement si tous les départs du jour sont connus. */
  lastDeparture?: string;
  minutes: number;
  /** Minutes après l'heure d'arrivée attendue (0 si à l'heure). */
  lateMinutes: number;
  /** Retard au-delà de la tolérance. */
  late: boolean;
  /** Départ avant l'heure attendue (jour travaillé, journée terminée). */
  earlyLeaveMinutes: number;
  missingDeparture: boolean;
  /** Présent en ce moment. */
  present: boolean;
  /** Jour travaillé sans aucune arrivée, une fois l'heure attendue (plus la tolérance) passée. */
  absent: boolean;
  /** Aujourd'hui, avant l'heure attendue plus la tolérance, sans arrivée encore. */
  notYet: boolean;
}

/** Bilan d'un membre pour un jour (ses présences de ce jour-là uniquement). */
export function summarizeDay(entries: AttendanceEntry[], day: string, settings: AttendanceSettings, now: Date, timeZone: string, today: string): DaySummary {
  const own = entries.filter((e) => e.workDay === day).sort((a, b) => a.arrivedAt.localeCompare(b.arrivedAt));
  const workday = settings.workDays.includes(isoWeekday(day));
  const expectedStart = new Date(localDateTimeToIso(day, settings.expectedStart, timeZone)).getTime();
  const expectedEnd = new Date(localDateTimeToIso(day, settings.expectedEnd, timeZone)).getTime();
  const deadline = expectedStart + settings.graceMinutes * MINUTE;
  const statuses = own.map((e) => effectiveStatus(e, today));
  const missingDeparture = statuses.includes("missing_departure");
  const present = statuses.includes("open");
  const firstArrival = own[0]?.arrivedAt;
  const allClosed = own.length > 0 && statuses.every((s) => s === "closed");
  const lastDeparture = allClosed ? own.map((e) => e.leftAt!).sort().at(-1) : undefined;
  const lateMinutes = firstArrival && workday ? Math.max(0, Math.round((new Date(firstArrival).getTime() - expectedStart) / MINUTE)) : 0;
  const earlyLeaveMinutes =
    workday && lastDeparture && (day < today || !present) ? Math.max(0, Math.round((expectedEnd - new Date(lastDeparture).getTime()) / MINUTE)) : 0;
  const noArrival = own.length === 0;
  return {
    day,
    workday,
    firstArrival,
    lastDeparture,
    minutes: own.reduce((sum, e) => sum + entryMinutes(e, now, today), 0),
    lateMinutes,
    late: lateMinutes > settings.graceMinutes,
    earlyLeaveMinutes,
    missingDeparture,
    present,
    absent: workday && noArrival && (day < today || now.getTime() >= deadline),
    notYet: workday && noArrival && day === today && now.getTime() < deadline,
  };
}

export interface PeriodSummary {
  minutes: number;
  daysPresent: number;
  lateDays: number;
  absences: number;
  missingDepartures: number;
  earlyLeaves: number;
}

/** Totaux d'un membre sur une liste de jours (jusqu'à aujourd'hui compris). */
export function summarizePeriod(entries: AttendanceEntry[], days: string[], settings: AttendanceSettings, now: Date, timeZone: string, today: string): PeriodSummary {
  const total: PeriodSummary = { minutes: 0, daysPresent: 0, lateDays: 0, absences: 0, missingDepartures: 0, earlyLeaves: 0 };
  for (const day of days) {
    if (day > today) continue;
    const s = summarizeDay(entries, day, settings, now, timeZone, today);
    total.minutes += s.minutes;
    if (s.firstArrival) total.daysPresent += 1;
    if (s.late) total.lateDays += 1;
    if (s.absent) total.absences += 1;
    if (s.missingDeparture) total.missingDepartures += 1;
    if (s.earlyLeaveMinutes > settings.graceMinutes) total.earlyLeaves += 1;
  }
  return total;
}

export type AttendancePeriod = "semaine" | "mois" | "mois-precedent";

/** Jours d'une période, du premier jour jusqu'à aujourd'hui (ou la fin du mois précédent). */
export function periodDays(period: AttendancePeriod, today: string): { from: string; to: string; days: string[]; label: string } {
  let from: string;
  let to = today;
  let label: string;
  if (period === "semaine") {
    from = addDays(today, 1 - isoWeekday(today));
    label = "Cette semaine";
  } else if (period === "mois") {
    from = `${today.slice(0, 8)}01`;
    label = "Ce mois-ci";
  } else {
    const firstOfMonth = `${today.slice(0, 8)}01`;
    to = addDays(firstOfMonth, -1);
    from = `${to.slice(0, 8)}01`;
    label = "Le mois dernier";
  }
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return { from, to, days, label };
}
