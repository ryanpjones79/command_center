import { addZonedDays, atLocalMinutes, startOfZonedDay, zonedParts } from "@/lib/v2/zoned-time";

// Constraint-based placement for one item. Pure: the server re-runs it inside a
// locked transaction before booking, so concurrent requests can't double-book.
//
// Never silently overlaps, truncates, moves a deadline or pushes protected time.
// When nothing fits, it returns the real trade-off, including exactly which
// movable blocks would be displaced.

export type DaySettings = {
  timeZone: string;
  workdayStartMin: number; // e.g. 480 = 8:00
  workdayEndMin: number; // e.g. 1050 = 17:30
  dayEndMin: number; // latest end for any placement, e.g. 1260 = 21:00
  bufferMinutes: number; // free time kept for interruptions each day
};

export type BusyBlock = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  kind: "MEETING" | "PROTECTED" | "COMMITTED";
  // A committed block is movable unless its own deadline/expiry would be missed.
  movable: boolean;
};

export type PlaceRequest = {
  minutes: number;
  workContext: string | null; // DESK | ADMIN | PHONE | ERRAND | HOME | ANYWHERE
  dueAt: Date | null;
  expiresAt: Date | null;
  earliest: Date; // usually now
  horizonDays?: number; // how far ahead to look (default 7)
};

export type Slot = { start: Date; end: Date };

export type PlaceResult =
  | { type: "SLOT"; slot: Slot; usesBuffer: boolean; alternatives: Slot[] }
  | { type: "EXPIRED"; message: string }
  | {
      type: "CONFLICT";
      message: string;
      // Feasible only by moving these movable blocks (never meetings or protected time).
      displace: { slot: Slot; displaced: BusyBlock[] } | null;
    };

export const ERRAND_TRAVEL_MINUTES = 15;
const STEP_MS = 15 * 60_000;

function roundUp(value: Date) {
  return new Date(Math.ceil(value.getTime() / STEP_MS) * STEP_MS);
}

function overlaps(a: Slot, b: Slot) {
  return a.start < b.end && a.end > b.start;
}

// Allowed window for a kind of work on the local day containing `day`.
export function contextWindow(context: string | null, day: Date, settings: DaySettings): Slot | null {
  const { timeZone } = settings;
  const weekday = zonedParts(day, timeZone).weekday;
  const weekend = weekday === 0 || weekday === 6;
  const at = (minutes: number) => atLocalMinutes(day, minutes, timeZone);
  switch (context) {
    case "DESK":
    case "PHONE":
      return weekend ? null : { start: at(settings.workdayStartMin), end: at(settings.workdayEndMin) };
    case "ERRAND":
      return { start: at(9 * 60), end: at(18 * 60) }; // typical store hours
    case "HOME":
      return weekend ? { start: at(8 * 60), end: at(settings.dayEndMin) } : { start: at(settings.workdayEndMin), end: at(settings.dayEndMin) };
    default:
      return { start: at(Math.min(settings.workdayStartMin, 7 * 60)), end: at(settings.dayEndMin) };
  }
}

function freeMinutes(window: Slot, busy: BusyBlock[], from: Date) {
  const start = new Date(Math.max(window.start.getTime(), from.getTime()));
  if (start >= window.end) return 0;
  let free = (window.end.getTime() - start.getTime()) / 60_000;
  for (const block of busy) {
    const s = Math.max(block.start.getTime(), start.getTime());
    const e = Math.min(block.end.getTime(), window.end.getTime());
    if (e > s) free -= (e - s) / 60_000;
  }
  return Math.max(0, free);
}

function searchDay(
  request: PlaceRequest,
  window: Slot,
  busy: BusyBlock[],
  latestEnd: Date,
  blocking: (block: BusyBlock) => boolean
): Slot[] {
  const travel = request.workContext === "ERRAND" ? ERRAND_TRAVEL_MINUTES * 60_000 : 0;
  const length = request.minutes * 60_000;
  const end = new Date(Math.min(window.end.getTime(), latestEnd.getTime()));
  const found: Slot[] = [];
  let start = roundUp(new Date(Math.max(window.start.getTime(), request.earliest.getTime())));
  while (start.getTime() + length <= end.getTime() && found.length < 4) {
    const slot = { start, end: new Date(start.getTime() + length) };
    const padded = { start: new Date(slot.start.getTime() - travel), end: new Date(slot.end.getTime() + travel) };
    const clash = busy.find((block) => blocking(block) && overlaps(padded, block));
    if (!clash) {
      found.push(slot);
      start = new Date(slot.end.getTime());
      continue;
    }
    start = roundUp(new Date(clash.end.getTime() + travel));
  }
  return found;
}

export function placeItem(request: PlaceRequest, busy: BusyBlock[], settings: DaySettings): PlaceResult {
  const limits = [request.dueAt, request.expiresAt].filter((value): value is Date => value instanceof Date);
  const latestEnd = limits.length ? new Date(Math.min(...limits.map((value) => value.getTime()))) : null;
  if (request.expiresAt && request.expiresAt <= request.earliest) {
    return { type: "EXPIRED", message: "This opportunity has expired. Scheduling it later can't make it valid." };
  }

  const horizon = request.horizonDays ?? 7;
  const slots: { slot: Slot; usesBuffer: boolean }[] = [];
  for (let offset = 0; offset < horizon && slots.length < 4; offset++) {
    const day = offset === 0 ? request.earliest : startOfZonedDay(addZonedDays(request.earliest, offset, settings.timeZone), settings.timeZone);
    const window = contextWindow(request.workContext, day, settings);
    if (!window) continue;
    if (latestEnd && window.start >= latestEnd) break;
    const dayEnd = atLocalMinutes(day, settings.dayEndMin, settings.timeZone);
    const limit = new Date(Math.min(dayEnd.getTime(), (latestEnd ?? dayEnd).getTime()));
    for (const slot of searchDay(request, window, busy, limit, () => true)) {
      const freeAfter = freeMinutes(window, busy, request.earliest) - request.minutes;
      slots.push({ slot, usesBuffer: offset === 0 && freeAfter < settings.bufferMinutes });
      if (slots.length >= 4) break;
    }
  }

  // Prefer a slot that keeps today's interruption buffer intact.
  const preferred = slots.find((entry) => !entry.usesBuffer) ?? slots[0];
  if (preferred) {
    return {
      type: "SLOT",
      slot: preferred.slot,
      usesBuffer: preferred.usesBuffer,
      alternatives: slots.filter((entry) => entry !== preferred).map((entry) => entry.slot).slice(0, 3)
    };
  }

  // Nothing fits: is it feasible by moving movable committed blocks?
  const windowToday = contextWindow(request.workContext, request.earliest, settings);
  let displace: { slot: Slot; displaced: BusyBlock[] } | null = null;
  if (windowToday) {
    const dayEnd = atLocalMinutes(request.earliest, settings.dayEndMin, settings.timeZone);
    const limit = new Date(Math.min(dayEnd.getTime(), (latestEnd ?? dayEnd).getTime()));
    const [slot] = searchDay(request, windowToday, busy, limit, (block) => !block.movable);
    if (slot) displace = { slot, displaced: busy.filter((block) => block.movable && overlaps(slot, block)) };
  }
  return {
    type: "CONFLICT",
    message: latestEnd
      ? "It doesn't fit before its deadline without moving something."
      : "No open time in the next week without moving something.",
    displace
  };
}

// Extending a running block: check the extra time against what follows.
export function extendBlock(block: Slot, extraMinutes: number, busy: BusyBlock[], selfId: string) {
  const wanted = { start: block.end, end: new Date(block.end.getTime() + extraMinutes * 60_000) };
  const clashes = busy.filter((other) => other.id !== selfId && overlaps(wanted, other));
  return clashes.length === 0
    ? { ok: true as const, newEnd: wanted.end }
    : { ok: false as const, clashes, message: `Extending runs into ${clashes.map((clash) => clash.title).join(", ")}.` };
}

// Remaining effort after an interruption: never less than what's actually left.
export function remainingAfterInterruption(plannedMinutes: number, start: Date, interruptedAt: Date, ownerEstimate?: number | null) {
  if (ownerEstimate && ownerEstimate > 0) return Math.round(ownerEstimate);
  const worked = Math.max(0, (interruptedAt.getTime() - start.getTime()) / 60_000);
  return Math.max(15, Math.round(plannedMinutes - worked));
}
