import type { OwnerActionArea } from "@/lib/owner-actions";

// Pure planning helpers shared by the Now screen, "Schedule it" and alerts.

export type Interval = { start: Date; end: Date };

// Where a card's new task lives when it is not already a RyanOS task.
export const AREA_DOMAIN_SLUG: Record<OwnerActionArea, string> = {
  KIDS: "family",
  HEALTH: "health",
  CCHCS: "work",
  RYKAS: "rykas",
  EBAY: "rykas",
  AP_TRADER: "betting-models",
  CASINO_AP: "casino-ap",
  PERSONAL: "admin",
  INBOX: "admin"
};

export const DAY_LAST_END_HOUR = 21; // nothing gets auto-placed past 9 PM

function overlaps(a: Interval, b: Interval) {
  return a.start < b.end && a.end > b.start;
}

// First free slot of `minutes` starting at the next 15-minute mark at or after
// `from`, ending by `latestEnd`. Busy intervals are scheduled tasks and timed
// calendar events. Returns null when today has no room.
export function findOpenSlot(input: {
  from: Date;
  minutes: number;
  busy: Interval[];
  latestEnd: Date;
}): Interval | null {
  const step = 15 * 60_000;
  const length = Math.max(5, input.minutes) * 60_000;
  let start = new Date(Math.ceil(input.from.getTime() / step) * step);
  while (start.getTime() + length <= input.latestEnd.getTime()) {
    const candidate = { start, end: new Date(start.getTime() + length) };
    const clash = input.busy.find((busy) => overlaps(candidate, busy));
    if (!clash) return candidate;
    start = new Date(Math.ceil(clash.end.getTime() / step) * step);
  }
  return null;
}

// Latest end for auto-placement: 9 PM in the day's time zone.
export function latestEndForDay(dayEnd: Date) {
  return new Date(dayEnd.getTime() - (24 - DAY_LAST_END_HOUR) * 60 * 60_000);
}

export type NowTask = {
  id: string;
  title: string;
  domainSlug: string;
  domainName: string;
  note: string | null;
  scheduledStart: Date;
  scheduledEnd: Date;
};

export type NowState = {
  current: NowTask | null;
  next: NowTask | null;
  minutesLeft: number | null;
  minutesUntilNext: number | null;
  overdueBlock: NowTask | null; // ended but not marked done or skipped
};

export function deriveNowState(tasks: NowTask[], now: Date): NowState {
  const sorted = [...tasks].sort((a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime());
  const current = sorted.find((task) => task.scheduledStart <= now && task.scheduledEnd > now) ?? null;
  const next = sorted.find((task) => task.scheduledStart > now) ?? null;
  const ended = sorted.filter((task) => task.scheduledEnd <= now);
  return {
    current,
    next,
    minutesLeft: current ? Math.max(0, Math.ceil((current.scheduledEnd.getTime() - now.getTime()) / 60_000)) : null,
    minutesUntilNext: next ? Math.max(0, Math.ceil((next.scheduledStart.getTime() - now.getTime()) / 60_000)) : null,
    overdueBlock: ended.length ? ended[ended.length - 1] : null
  };
}

export const SKIP_CHOICES = ["TOMORROW", "THIS_WEEK", "PARK", "DROP"] as const;
export type SkipChoice = (typeof SKIP_CHOICES)[number];

const SKIP_LABEL: Record<SkipChoice, string> = {
  TOMORROW: "tomorrow",
  THIS_WEEK: "this week",
  PARK: "parked",
  DROP: "dropped"
};

export function skipCount(note: string | null) {
  return (note ?? "").match(/^Skipped \d{4}-\d{2}-\d{2}/gm)?.length ?? 0;
}

export function appendSkipNote(note: string | null, dateKey: string, choice: SkipChoice) {
  const line = `Skipped ${dateKey} (${SKIP_LABEL[choice]})`;
  return note?.trim() ? `${note.trim()}\n${line}` : line;
}
