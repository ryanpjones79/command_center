import { atLocalMinutes, addZonedDays, startOfZonedDay, zonedParts } from "@/lib/v2/zoned-time";

// One set of availability rules for Plan's "Bookable today", the day preview, one-click booking and Now.
//
// - Busy: timed Google Calendar events. All-day events never block.
// - Optional: events marked "Show as free" in Google, or whose title matches RYANOS_OPTIONAL_EVENT_WORDS
//   (default: sports-style " vs " / " @ " titles, e.g. an imported game schedule). They stay visible but
//   don't block time unless RYANOS_OPTIONAL_EVENTS_BLOCK=true.
// - Protected: CCHCS work hours on weekdays (Settings: workday start/end), for everything except Work-area
//   tasks; and RyanOS blocks in Family, Kids and Health, which nothing is planned over.
// - Unknown: if the calendar can't be read, free time is "unconfirmed", never treated as confirmed free.

export type Interval = { start: number; end: number };
export type AvailabilityEvent = { start: string | Date; end: string | Date; title: string; optional?: boolean };

const DEFAULT_OPTIONAL_WORDS = ["vs", "vs.", "@"]; // whole words: "Kings vs Ducks", "Warriors @ Lakers"

export function optionalWords(env: Record<string, string | undefined> = process.env) {
  const raw = env.RYANOS_OPTIONAL_EVENT_WORDS;
  if (raw === undefined) return DEFAULT_OPTIONAL_WORDS;
  return raw.split("|").map((word) => word.trim().toLowerCase()).filter((word) => word.length > 0);
}

export function optionalEventsBlock(env: Record<string, string | undefined> = process.env) {
  return env.RYANOS_OPTIONAL_EVENTS_BLOCK === "true";
}

// Optional = "Show as free" in Google, or a title with one of the optional words (case-insensitive).
export function isOptionalEvent(event: { title: string; showAsFree?: boolean }, words = optionalWords()) {
  if (event.showAsFree) return true;
  const title = ` ${event.title.toLowerCase().replace(/\s+/g, " ")} `;
  return words.some((word) => title.includes(` ${word} `));
}

// Events that take time: everything except optional ones (unless optional events are set to block).
export function blockingEvents<T extends { optional?: boolean }>(events: T[], optionalBlocks = false) {
  return optionalBlocks ? events : events.filter((event) => !event.optional);
}

// Work hours are protected for everything except Work-area tasks and tasks that need business hours
// (calls, errands, desk work set to business hours), which can only happen then.
export function respectsWorkHours(areaSlug: string, workContext: string | null) {
  return areaSlug !== "work" && !["DESK", "PHONE", "ERRAND"].includes(workContext ?? "");
}

// CCHCS work hours on weekdays between `from` and `to`.
export function workWindows(from: Date, to: Date, settings: { timeZone: string; workdayStartMin: number; workdayEndMin: number }): Interval[] {
  const out: Interval[] = [];
  for (let day = startOfZonedDay(from, settings.timeZone); day < to; day = addZonedDays(day, 1, settings.timeZone)) {
    const weekday = zonedParts(day, settings.timeZone).weekday;
    if (weekday === 0 || weekday === 6) continue;
    const start = atLocalMinutes(day, settings.workdayStartMin, settings.timeZone).getTime();
    const end = atLocalMinutes(day, settings.workdayEndMin, settings.timeZone).getTime();
    if (end > from.getTime() && start < to.getTime()) out.push({ start, end });
  }
  return out;
}

// Merge intervals and return the gaps inside [from, to] of at least `minMinutes`.
export function freeGaps(busy: Interval[], from: number, to: number, minMinutes = 15): Interval[] {
  const sorted = busy
    .map((item) => ({ start: Math.max(item.start, from), end: Math.min(item.end, to) }))
    .filter((item) => item.end > item.start)
    .sort((a, b) => a.start - b.start);
  const gaps: Interval[] = [];
  let reach = from;
  for (const item of sorted) {
    if (item.start > reach && item.start - reach >= minMinutes * 60_000) gaps.push({ start: reach, end: item.start });
    reach = Math.max(reach, item.end);
  }
  if (to > reach && to - reach >= minMinutes * 60_000) gaps.push({ start: reach, end: to });
  return gaps;
}

export function overlapsAny(slot: Interval, busy: Interval[]) {
  return busy.some((item) => item.start < slot.end && item.end > slot.start);
}

export type ProtectionLine = { label: string; detail: string };

const clockOf = (minutes: number) => new Date(Date.UTC(2000, 0, 1, 0, minutes)).toLocaleTimeString("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit" });

// Plain-language list of what the bookable-time estimate includes.
export function protectionLines(settings: { workdayStartMin: number; workdayEndMin: number; dayEndMin: number; bufferMinutes: number }, optionalBlocks = optionalEventsBlock()): ProtectionLine[] {
  return [
    { label: "Work hours (CCHCS)", detail: `Mon–Fri ${clockOf(settings.workdayStartMin)}–${clockOf(settings.workdayEndMin)}; only Work tasks and business-hours calls or errands are planned there` },
    { label: "Family, kids and health", detail: "RyanOS blocks in those areas are never planned over" },
    { label: "Optional events", detail: optionalBlocks ? "Counted as busy (RYANOS_OPTIONAL_EVENTS_BLOCK=true)" : "Shown, but don't block time (Google \"Show as free\" or titles like \"A vs B\")" },
    { label: "Day ends", detail: `${clockOf(settings.dayEndMin)}; ${settings.bufferMinutes} min kept free for interruptions` }
  ];
}
