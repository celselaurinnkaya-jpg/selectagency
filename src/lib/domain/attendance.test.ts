import { describe, expect, it } from "vitest";
import { localDateTimeToIso } from "@/lib/period";
import { addDays, effectiveStatus, formatDuration, isoWeekday, periodDays, summarizeDay, summarizePeriod } from "./attendance";
import type { AttendanceEntry, AttendanceSettings } from "./types";

const TZ = "Africa/Douala";
const settings: AttendanceSettings = { expectedStart: "08:00", expectedEnd: "17:00", workDays: [1, 2, 3, 4, 5, 6], graceMinutes: 10 };
const at = (day: string, time: string) => localDateTimeToIso(day, time, TZ);
let n = 0;
const entry = (day: string, arrive: string, leave?: string, status?: AttendanceEntry["status"]): AttendanceEntry => ({
  id: `e${++n}`,
  memberId: "m1",
  workDay: day,
  arrivedAt: at(day, arrive),
  leftAt: leave ? at(day, leave) : undefined,
  arrivalSource: "clock",
  departureSource: leave ? "clock" : undefined,
  status: status ?? (leave ? "closed" : "open"),
});

// Vendredi 6 novembre 2026, 11 h à Douala.
const TODAY = "2026-11-06";
const NOW = new Date(at(TODAY, "11:00"));

describe("présences (src/lib/domain/attendance.ts)", () => {
  it("connaît les jours de la semaine et les durées", () => {
    expect(isoWeekday("2026-11-06")).toBe(5);
    expect(isoWeekday("2026-11-08")).toBe(7);
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(formatDuration(485)).toBe("8 h 05");
    expect(formatDuration(45)).toBe("45 min");
  });

  it("calcule le retard au-delà de la tolérance, la présence en cours et le départ anticipé", () => {
    const onTime = summarizeDay([entry(TODAY, "08:09")], TODAY, settings, NOW, TZ, TODAY);
    expect(onTime).toMatchObject({ lateMinutes: 9, late: false, present: true, minutes: 171, absent: false });
    const late = summarizeDay([entry(TODAY, "08:25")], TODAY, settings, NOW, TZ, TODAY);
    expect(late).toMatchObject({ lateMinutes: 25, late: true });
    // Pause de midi : deux présences, total cumulé, départ à 16 h 30 (30 min avant l'heure).
    const yesterday = "2026-11-05";
    const split = summarizeDay([entry(yesterday, "08:00", "12:00"), entry(yesterday, "13:30", "16:30")], yesterday, settings, NOW, TZ, TODAY);
    expect(split).toMatchObject({ minutes: 420, lastDeparture: at(yesterday, "16:30"), earlyLeaveMinutes: 30, late: false });
  });

  it("distingue absent, pas encore arrivé, jour non travaillé et départ non pointé", () => {
    expect(summarizeDay([], TODAY, settings, new Date(at(TODAY, "08:05")), TZ, TODAY)).toMatchObject({ notYet: true, absent: false });
    expect(summarizeDay([], TODAY, settings, NOW, TZ, TODAY)).toMatchObject({ notYet: false, absent: true });
    expect(summarizeDay([], "2026-11-01", settings, NOW, TZ, TODAY)).toMatchObject({ workday: false, absent: false });
    const forgotten = entry("2026-11-04", "08:00");
    expect(effectiveStatus(forgotten, TODAY)).toBe("missing_departure");
    expect(summarizeDay([forgotten], "2026-11-04", settings, NOW, TZ, TODAY)).toMatchObject({ missingDeparture: true, minutes: 0, present: false });
  });

  it("fait les totaux d'une période", () => {
    const week = periodDays("semaine", TODAY);
    expect(week).toMatchObject({ from: "2026-11-02", to: TODAY });
    const summary = summarizePeriod(
      [entry("2026-11-02", "08:00", "17:00"), entry("2026-11-03", "08:30", "17:00"), entry("2026-11-04", "08:00"), entry(TODAY, "08:05")],
      week.days,
      settings,
      NOW,
      TZ,
      TODAY,
    );
    // Lundi 9 h, mardi 8 h 30 (en retard), mercredi départ non pointé, jeudi absent, vendredi 2 h 55 en cours.
    expect(summary).toEqual({ minutes: 540 + 510 + 175, daysPresent: 4, lateDays: 1, absences: 1, missingDepartures: 1, earlyLeaves: 0 });
    expect(periodDays("mois-precedent", TODAY)).toMatchObject({ from: "2026-10-01", to: "2026-10-31" });
    expect(periodDays("mois", TODAY).days.length).toBe(6);
  });
});
