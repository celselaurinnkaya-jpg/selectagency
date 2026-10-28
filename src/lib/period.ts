import { dayKey } from "./format";

// Périodes de filtrage, calculées dans le fuseau horaire de l'agence.

export type PeriodKey = "mois" | "trimestre" | "annee" | "tout";

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "mois", label: "Ce mois-ci" },
  { key: "trimestre", label: "3 derniers mois" },
  { key: "annee", label: "Depuis janvier" },
  { key: "tout", label: "Toute la période" },
];

export interface ResolvedPeriod {
  key: PeriodKey;
  label: string;
  from?: Date;
  to?: Date;
}

/** Décalage du fuseau (en minutes) à une date donnée, par exemple +60 pour Africa/Douala. */
function offsetMinutes(date: Date, timeZone: string): number {
  const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName")?.value;
  const match = part?.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

/** Date et heure saisies dans un formulaire (heure locale de l'agence) converties en instant ISO. */
export function localDateTimeToIso(date: string, time: string, timeZone: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  const utc = new Date(Date.UTC(y, m - 1, d, hh, mm));
  return new Date(utc.getTime() - offsetMinutes(utc, timeZone) * 60_000).toISOString();
}

/** Premier jour d'un mois à minuit, heure locale de l'agence. */
export function startOfMonth(year: number, month: number, timeZone: string): Date {
  const utc = new Date(Date.UTC(year, month - 1, 1));
  return new Date(utc.getTime() - offsetMinutes(utc, timeZone) * 60_000);
}

export function monthParts(date: Date, timeZone: string): { year: number; month: number } {
  const [year, month] = dayKey(date, timeZone).split("-").map(Number) as [number, number];
  return { year, month };
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function resolvePeriod(value: string | undefined, now: Date, timeZone: string): ResolvedPeriod {
  const option = PERIOD_OPTIONS.find((p) => p.key === value) ?? PERIOD_OPTIONS[0]!;
  const { year, month } = monthParts(now, timeZone);
  switch (option.key) {
    case "mois":
      return { ...option, from: startOfMonth(year, month, timeZone) };
    case "trimestre": {
      const start = shiftMonth(year, month, -2);
      return { ...option, from: startOfMonth(start.year, start.month, timeZone) };
    }
    case "annee":
      return { ...option, from: startOfMonth(year, 1, timeZone) };
    default:
      return option;
  }
}

/** Les `count` derniers mois (le plus ancien en premier), sous forme de clés AAAA-MM. */
export function lastMonths(now: Date, timeZone: string, count: number): { key: string; label: string }[] {
  const { year, month } = monthParts(now, timeZone);
  return Array.from({ length: count }, (_, i) => {
    const m = shiftMonth(year, month, i - (count - 1));
    const key = `${m.year}-${String(m.month).padStart(2, "0")}`;
    const label = new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(m.year, m.month - 1, 15)));
    return { key, label };
  });
}
