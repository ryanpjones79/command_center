// Timezone-correct helpers for RyanOS v2. Every function takes the user's
// timezone explicitly (UserSettings.timeZone, default America/Los_Angeles) so
// days, weeks and review dates stay right across DST changes and midnight.

export const DEFAULT_TIME_ZONE = "America/Los_Angeles";

export type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number };

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function zonedParts(value: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23"
  }).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: WEEKDAYS[map.weekday] ?? 0
  };
}

// Wall-clock time in `timeZone` -> UTC instant. In a spring-forward gap the
// result lands just after the gap; in a fall-back overlap, the first occurrence.
export function zonedToUtc(year: number, month: number, day: number, hour = 0, minute = 0, timeZone: string): Date {
  let candidate = new Date(Date.UTC(year, month - 1, day, hour, minute));
  for (let i = 0; i < 3; i++) {
    const actual = zonedParts(candidate, timeZone);
    const wanted = Date.UTC(year, month - 1, day, hour, minute);
    const got = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute);
    if (wanted === got) break;
    candidate = new Date(candidate.getTime() + wanted - got);
  }
  return candidate;
}

function calendarShift(year: number, month: number, day: number, days: number) {
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
}

export function startOfZonedDay(value: Date, timeZone: string) {
  const p = zonedParts(value, timeZone);
  return zonedToUtc(p.year, p.month, p.day, 0, 0, timeZone);
}

// Same wall-clock time `days` calendar days later (DST-safe; not +24h).
export function addZonedDays(value: Date, days: number, timeZone: string) {
  const p = zonedParts(value, timeZone);
  const d = calendarShift(p.year, p.month, p.day, days);
  return zonedToUtc(d.year, d.month, d.day, p.hour, p.minute, timeZone);
}

export function zonedDayRange(value: Date, timeZone: string) {
  const start = startOfZonedDay(value, timeZone);
  const p = zonedParts(value, timeZone);
  const next = calendarShift(p.year, p.month, p.day, 1);
  return { start, end: zonedToUtc(next.year, next.month, next.day, 0, 0, timeZone) };
}

// `minutes` after local midnight on the local day containing `value`.
export function atLocalMinutes(value: Date, minutes: number, timeZone: string) {
  const p = zonedParts(value, timeZone);
  return zonedToUtc(p.year, p.month, p.day, Math.floor(minutes / 60), minutes % 60, timeZone);
}

// Weeks start Monday 00:00 local.
export function startOfZonedWeek(value: Date, timeZone: string) {
  const p = zonedParts(value, timeZone);
  const back = (p.weekday + 6) % 7;
  const d = calendarShift(p.year, p.month, p.day, -back);
  return zonedToUtc(d.year, d.month, d.day, 0, 0, timeZone);
}

export function startOfZonedMonth(value: Date, timeZone: string) {
  const p = zonedParts(value, timeZone);
  return zonedToUtc(p.year, p.month, 1, 0, 0, timeZone);
}

export function periodRange(period: string, value: Date, timeZone: string): { start: Date; end: Date } | null {
  if (period === "WEEK") {
    const start = startOfZonedWeek(value, timeZone);
    return { start, end: addZonedDays(start, 7, timeZone) };
  }
  if (period === "MONTH") {
    const start = startOfZonedMonth(value, timeZone);
    const p = zonedParts(start, timeZone);
    const nextMonth = p.month === 12 ? { y: p.year + 1, m: 1 } : { y: p.year, m: p.month + 1 };
    return { start, end: zonedToUtc(nextMonth.y, nextMonth.m, 1, 0, 0, timeZone) };
  }
  if (period === "QUARTER") {
    const p = zonedParts(value, timeZone);
    const firstMonth = Math.floor((p.month - 1) / 3) * 3 + 1;
    const start = zonedToUtc(p.year, firstMonth, 1, 0, 0, timeZone);
    const endMonth = firstMonth + 3 > 12 ? { y: p.year + 1, m: firstMonth - 9 } : { y: p.year, m: firstMonth + 3 };
    return { start, end: zonedToUtc(endMonth.y, endMonth.m, 1, 0, 0, timeZone) };
  }
  return null;
}

export function localDateKey(value: Date, timeZone: string) {
  const p = zonedParts(value, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function localClock(value: Date, timeZone: string) {
  return value.toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
}
