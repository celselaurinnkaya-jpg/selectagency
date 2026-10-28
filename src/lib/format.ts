// Mise en forme des montants et des dates. Les montants sont stockés en unités mineures
// (entiers) ; le nombre de décimales dépend de la devise (XAF et XOF n'en ont pas).

const MINOR_UNITS: Record<string, number> = {
  XAF: 0,
  XOF: 0,
  CDF: 2,
  NGN: 2,
  GHS: 2,
  USD: 2,
  EUR: 2,
};

export function minorUnits(currency: string): number {
  return MINOR_UNITS[currency] ?? 2;
}

export function formatMoney(amountMinor: number, currency: string): string {
  const digits = minorUnits(currency);
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amountMinor / 10 ** digits);
}

export const CURRENCY_OPTIONS = [
  { code: "XAF", label: "XAF — Franc CFA (CEMAC)" },
  { code: "XOF", label: "XOF — Franc CFA (UEMOA)" },
  { code: "CDF", label: "CDF — Franc congolais" },
  { code: "NGN", label: "NGN — Naira" },
  { code: "GHS", label: "GHS — Cedi" },
  { code: "USD", label: "USD — Dollar américain" },
  { code: "EUR", label: "EUR — Euro" },
] as const;

export const TIMEZONE_OPTIONS = [
  { value: "Africa/Douala", label: "Douala, Yaoundé (UTC+1)" },
  { value: "Africa/Abidjan", label: "Abidjan (UTC+0)" },
  { value: "Africa/Dakar", label: "Dakar (UTC+0)" },
  { value: "Africa/Porto-Novo", label: "Porto-Novo, Cotonou (UTC+1)" },
  { value: "Africa/Lome", label: "Lomé (UTC+0)" },
  { value: "Africa/Kinshasa", label: "Kinshasa (UTC+1)" },
  { value: "Africa/Lubumbashi", label: "Lubumbashi (UTC+2)" },
  { value: "Africa/Lagos", label: "Lagos (UTC+1)" },
  { value: "Africa/Accra", label: "Accra (UTC+0)" },
] as const;

type DateStyle = "date" | "dateTime" | "time" | "dayMonth" | "monthYear" | "weekday";

const DATE_OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  date: { day: "2-digit", month: "2-digit", year: "numeric" },
  dateTime: { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" },
  time: { hour: "2-digit", minute: "2-digit" },
  dayMonth: { day: "numeric", month: "short" },
  monthYear: { month: "long", year: "numeric" },
  weekday: { weekday: "long", day: "numeric", month: "long" },
};

export function formatDate(iso: string, timeZone: string, style: DateStyle = "date"): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone, ...DATE_OPTIONS[style] }).format(new Date(iso));
}

/** Clé de jour (AAAA-MM-JJ) dans le fuseau de l'agence, pour regrouper et comparer des dates. */
export function dayKey(iso: string | Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof iso === "string" ? new Date(iso) : iso);
  return parts;
}

/** « Aujourd'hui à 15:00 », « Demain à 10:30 », « Hier », sinon la date complète. */
export function formatRelativeDay(iso: string, now: Date, timeZone: string, withTime = true): string {
  const target = dayKey(iso, timeZone);
  const today = dayKey(now, timeZone);
  const oneDay = 24 * 60 * 60 * 1000;
  const tomorrow = dayKey(new Date(now.getTime() + oneDay), timeZone);
  const yesterday = dayKey(new Date(now.getTime() - oneDay), timeZone);
  const time = withTime ? ` à ${formatDate(iso, timeZone, "time")}` : "";
  if (target === today) return `Aujourd'hui${time}`;
  if (target === tomorrow) return `Demain${time}`;
  if (target === yesterday) return `Hier${time}`;
  return withTime ? formatDate(iso, timeZone, "dateTime") : formatDate(iso, timeZone, "date");
}

/** Initiales du prénom et du nom de famille : « Celse Laurin Nkaya » → « CN ». */
export function initials(fullName: string): string {
  const parts = fullName.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}
