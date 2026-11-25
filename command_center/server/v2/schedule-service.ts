import type { Prisma, PrismaClient } from "@prisma/client";
import { placeItem, extendBlock, remainingAfterInterruption, type BusyBlock, type DaySettings, type PlaceResult, type Slot } from "@/lib/v2/scheduler";
import { addZonedDays, DEFAULT_TIME_ZONE, startOfZonedDay } from "@/lib/v2/zoned-time";
import { blockingEvents, optionalEventsBlock, respectsWorkHours, workWindows } from "@/lib/v2/availability";

// Server-side scheduling for persistent actions. Every booking re-checks the
// slot inside a transaction holding a per-user lock, so double taps, two
// devices or concurrent requests can't double-book or overlap.

// optional: shown on the calendar but doesn't block time (see lib/v2/availability.ts).
export type CalendarBusy = { start: Date; end: Date; title: string; optional?: boolean };
export type CalendarLoader = (from: Date, to: Date) => Promise<CalendarBusy[]>;

const PROTECTED_SLUGS = new Set(["family", "kids", "health"]);
const MINUTES_BY_BUCKET: Record<string, number> = { UNDER_30_MIN: 30, THIRTY_TO_SIXTY_MIN: 60, ONE_TO_TWO_HOURS: 90, TWO_HOURS_PLUS: 120 };

type Tx = Prisma.TransactionClient;

export async function loadDaySettings(userId: string, db: PrismaClient | Tx): Promise<DaySettings> {
  const settings = await db.userSettings.findUnique({ where: { userId } });
  return {
    timeZone: settings?.timeZone || process.env.DAILY_BRIEF_TIMEZONE || DEFAULT_TIME_ZONE,
    workdayStartMin: settings?.workdayStartMin ?? 480,
    workdayEndMin: settings?.workdayEndMin ?? 1050,
    dayEndMin: settings?.dayEndMin ?? 1260,
    bufferMinutes: settings?.bufferMinutes ?? 30
  };
}

export function taskMinutes(task: { remainingMinutes: number | null; estimatedDuration: string | null }) {
  return task.remainingMinutes && task.remainingMinutes > 0 ? task.remainingMinutes : MINUTES_BY_BUCKET[task.estimatedDuration ?? ""] ?? 30;
}

export async function lockUser(tx: Tx, userId: string) {
  if ((process.env.DATABASE_URL ?? "").startsWith("postgres")) {
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `ryanos-schedule:${userId}`);
  }
  // SQLite serializes write transactions itself.
}

// Everything that takes time between from and to (shared availability rules, lib/v2/availability.ts):
// blocking calendar events (optional ones don't block), RyanOS blocks, and, when `work` settings are given
// (the task isn't Work-area), CCHCS work hours as protected time.
export async function busyBlocks(tx: Tx | PrismaClient, userId: string, from: Date, to: Date, excludeTaskId: string | null, calendar: CalendarBusy[], work: DaySettings | null = null): Promise<BusyBlock[]> {
  const tasks = await tx.executionTask.findMany({
    where: {
      userId,
      id: excludeTaskId ? { not: excludeTaskId } : undefined,
      status: { notIn: ["DONE", "DROPPED"] },
      scheduledStart: { lt: to },
      scheduledEnd: { gt: from }
    },
    select: { id: true, title: true, scheduledStart: true, scheduledEnd: true, dueDate: true, expiresAt: true, domain: { select: { slug: true } } }
  });
  return [
    ...blockingEvents(calendar, optionalEventsBlock()).map((event, index): BusyBlock => ({ id: `cal:${index}`, title: event.title, start: event.start, end: event.end, kind: "MEETING", movable: false })),
    ...(work ? workWindows(from, to, work) : []).map((window, index): BusyBlock => ({ id: `work:${index}`, title: "Work hours (CCHCS)", start: new Date(window.start), end: new Date(window.end), kind: "PROTECTED", movable: false })),
    ...tasks.map((task): BusyBlock => {
      const isProtected = PROTECTED_SLUGS.has(task.domain.slug);
      const hardLimit = [task.dueDate, task.expiresAt].some((limit) => limit && task.scheduledEnd && limit.getTime() - task.scheduledEnd.getTime() < 24 * 60 * 60_000);
      return {
        id: task.id,
        title: task.title,
        start: task.scheduledStart as Date,
        end: task.scheduledEnd as Date,
        kind: isProtected ? "PROTECTED" : "COMMITTED",
        movable: !isProtected && !hardLimit
      };
    })
  ];
}

export type ScheduleOutcome =
  | { type: "BOOKED"; slot: Slot; usesBuffer: boolean; displacedIds: string[]; calendarKnown?: boolean }
  | Exclude<PlaceResult, { type: "SLOT" }>
  | { type: "STALE"; message: string }
  | { type: "NOT_FOUND" };

// Find a slot and book it. With `displaceIds`, books the conflict option only
// if exactly those (movable) blocks still overlap; they go back to today's
// queue with their remaining effort intact.
export async function scheduleAction(
  userId: string,
  taskId: string,
  db: PrismaClient,
  calendarLoader: CalendarLoader,
  options: { now?: Date; displaceIds?: string[]; startNow?: boolean } = {}
): Promise<ScheduleOutcome> {
  const now = options.now ?? new Date();
  const settings = await loadDaySettings(userId, db);
  const from = startOfZonedDay(now, settings.timeZone);
  const to = addZonedDays(from, 8, settings.timeZone);
  let calendarKnown = true;
  const calendar = await calendarLoader(from, to).catch(() => { calendarKnown = false; return [] as CalendarBusy[]; });

  return db.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const task = await tx.executionTask.findFirst({
      where: { id: taskId, userId, status: { notIn: ["DONE", "DROPPED"] } },
      select: { id: true, remainingMinutes: true, estimatedDuration: true, workContext: true, dueDate: true, expiresAt: true, postponeCount: true, scheduledStart: true, domain: { select: { slug: true } } }
    });
    if (!task) return { type: "NOT_FOUND" } as const;
    const busy = await busyBlocks(tx, userId, from, to, task.id, calendar, respectsWorkHours(task.domain.slug, task.workContext) ? settings : null);
    // An overdue task still gets the next free time; its past due date can't limit where it goes.
    const result = placeItem({ minutes: taskMinutes(task), workContext: task.workContext, dueAt: task.dueDate && task.dueDate > now ? task.dueDate : null, expiresAt: task.expiresAt, earliest: now, startNow: options.startNow }, busy, settings);

    if (result.type === "SLOT" && !options.displaceIds) {
      await tx.executionTask.update({ where: { id: task.id }, data: { scheduledStart: result.slot.start, scheduledEnd: result.slot.end, whenBucket: "TODAY" } });
      await tx.executionTaskEvent.create({ data: { userId, taskId: task.id, type: "SCHEDULED", detail: result.slot.start.toISOString() } });
      return { type: "BOOKED", slot: result.slot, usesBuffer: result.usesBuffer, displacedIds: [], calendarKnown } as const;
    }
    if (result.type === "CONFLICT" && options.displaceIds && result.displace) {
      const current = result.displace.displaced.map((block) => block.id).sort();
      const confirmed = [...options.displaceIds].sort();
      if (JSON.stringify(current) !== JSON.stringify(confirmed)) {
        return { type: "STALE", message: "The day changed since you looked. Review the new trade-off." } as const;
      }
      for (const block of result.displace.displaced) {
        const minutes = Math.round((block.end.getTime() - block.start.getTime()) / 60_000);
        await tx.executionTask.update({
          where: { id: block.id },
          data: { scheduledStart: null, scheduledEnd: null, whenBucket: "TODAY", remainingMinutes: { set: minutes } }
        });
        await tx.executionTaskEvent.create({ data: { userId, taskId: block.id, type: "DISPLACED", detail: `Moved for ${task.id}` } });
      }
      await tx.executionTask.update({ where: { id: task.id }, data: { scheduledStart: result.displace.slot.start, scheduledEnd: result.displace.slot.end, whenBucket: "TODAY" } });
      await tx.executionTaskEvent.create({ data: { userId, taskId: task.id, type: "SCHEDULED", detail: result.displace.slot.start.toISOString() } });
      return { type: "BOOKED", slot: result.displace.slot, usesBuffer: false, displacedIds: current, calendarKnown } as const;
    }
    if (result.type === "SLOT") return { type: "STALE", message: "A free slot exists now; nothing needs to move." } as const;
    return result;
  });
}

export type ExtendOutcome = { type: "EXTENDED"; newEnd: Date } | { type: "CONFLICT"; message: string; clashIds: string[] } | { type: "NOT_FOUND" };

export async function extendAction(userId: string, taskId: string, minutes: number, db: PrismaClient, calendarLoader: CalendarLoader, now = new Date()): Promise<ExtendOutcome> {
  const settings = await loadDaySettings(userId, db);
  const from = startOfZonedDay(now, settings.timeZone);
  const to = addZonedDays(from, 1, settings.timeZone);
  const calendar = await calendarLoader(from, to).catch(() => [] as CalendarBusy[]);
  return db.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const task = await tx.executionTask.findFirst({ where: { id: taskId, userId }, select: { id: true, scheduledStart: true, scheduledEnd: true } });
    if (!task?.scheduledStart || !task.scheduledEnd) return { type: "NOT_FOUND" } as const;
    const base = { start: task.scheduledStart, end: new Date(Math.max(task.scheduledEnd.getTime(), now.getTime())) };
    const busy = await busyBlocks(tx, userId, from, to, task.id, calendar);
    const check = extendBlock(base, minutes, busy, task.id);
    if (!check.ok) return { type: "CONFLICT", message: check.message, clashIds: check.clashes.map((clash) => clash.id) } as const;
    await tx.executionTask.update({ where: { id: task.id }, data: { scheduledEnd: check.newEnd } });
    await tx.executionTaskEvent.create({ data: { userId, taskId: task.id, type: "EXTENDED", detail: `+${minutes} min` } });
    return { type: "EXTENDED", newEnd: check.newEnd } as const;
  });
}

// Interrupted / needs more time: keep the full remaining effort, free the slot,
// and leave the item in today's queue for a new plan. Never truncates work.
export async function interruptAction(userId: string, taskId: string, db: PrismaClient, ownerEstimate: number | null, now = new Date()) {
  return db.$transaction(async (tx) => {
    const task = await tx.executionTask.findFirst({ where: { id: taskId, userId }, select: { id: true, scheduledStart: true, scheduledEnd: true, remainingMinutes: true, estimatedDuration: true } });
    if (!task) return { ok: false as const, remainingMinutes: null };
    const planned = taskMinutes(task);
    const remaining = task.scheduledStart ? remainingAfterInterruption(planned, task.scheduledStart, now, ownerEstimate) : ownerEstimate ?? planned;
    await tx.executionTask.update({
      where: { id: task.id },
      data: { scheduledStart: null, scheduledEnd: null, remainingMinutes: remaining, whenBucket: "TODAY", status: "IN_PROGRESS" }
    });
    await tx.executionTaskEvent.create({ data: { userId, taskId: task.id, type: "INTERRUPTED", detail: `${remaining} min left` } });
    return { ok: true as const, remainingMinutes: remaining };
  });
}

// Postponing with an explicit destination; the 3rd postponement asks whether
// it is still worth doing (the UI shows the question; nothing auto-rolls).
export async function postponeAction(
  userId: string,
  taskId: string,
  choice: "TOMORROW" | "THIS_WEEK" | "REVIEW" | "PARK" | "DROP",
  db: PrismaClient,
  options: { now?: Date; reviewAt?: Date | null } = {}
) {
  const now = options.now ?? new Date();
  const settings = await loadDaySettings(userId, db);
  return db.$transaction(async (tx) => {
    const task = await tx.executionTask.findFirst({ where: { id: taskId, userId }, select: { id: true, postponeCount: true, expiresAt: true } });
    if (!task) return { ok: false as const, postponeCount: 0, stillWorthIt: false };
    const morning = (days: number) => {
      const day = startOfZonedDay(addZonedDays(now, days, settings.timeZone), settings.timeZone);
      return new Date(day.getTime() + settings.workdayStartMin * 60_000);
    };
    const base = { scheduledStart: null, scheduledEnd: null } as const;
    let data: Prisma.ExecutionTaskUpdateInput;
    if (choice === "DROP") data = { ...base, status: "DROPPED" };
    else if (choice === "PARK") data = { ...base, whenBucket: "PARKING_LOT", followUpDate: options.reviewAt ?? morning(30), postponeCount: { increment: 1 } };
    else if (choice === "REVIEW") data = { ...base, whenBucket: "LATER", followUpDate: options.reviewAt ?? morning(7), postponeCount: { increment: 1 } };
    else if (choice === "TOMORROW") data = { ...base, whenBucket: "THIS_WEEK", followUpDate: morning(1), postponeCount: { increment: 1 } };
    else data = { ...base, whenBucket: "THIS_WEEK", postponeCount: { increment: 1 } };
    const updated = await tx.executionTask.update({ where: { id: task.id }, data, select: { postponeCount: true } });
    await tx.executionTaskEvent.create({ data: { userId, taskId: task.id, type: choice === "DROP" ? "DROPPED" : "POSTPONED", detail: choice } });
    return { ok: true as const, postponeCount: updated.postponeCount, stillWorthIt: updated.postponeCount >= 3 && choice !== "DROP" };
  });
}

export type SlotOutcome =
  | { type: "BOOKED"; slot: Slot; calendarKnown: boolean }
  | { type: "TAKEN"; message: string }
  | { type: "NOT_FOUND" };

// Book one exact slot that was suggested earlier (one-click "Book 7:15 PM", a previewed plan line).
// Re-checks it under the booking lock with the same availability rules as the preview, so a stale
// suggestion can't double-book: a clash with a meeting, protected time or another block is refused.
export async function bookSlot(userId: string, taskId: string, start: Date, end: Date, db: PrismaClient, calendarLoader: CalendarLoader, now = new Date()): Promise<SlotOutcome> {
  if (!(start < end) || end <= now) return { type: "TAKEN", message: "That time has passed." };
  const settings = await loadDaySettings(userId, db);
  let calendarKnown = true;
  const calendar = await calendarLoader(new Date(start.getTime() - 86_400_000), new Date(end.getTime() + 86_400_000)).catch(() => { calendarKnown = false; return [] as CalendarBusy[]; });
  return db.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const task = await tx.executionTask.findFirst({ where: { id: taskId, userId, status: { notIn: ["DONE", "DROPPED"] } }, select: { id: true, workContext: true, domain: { select: { slug: true } } } });
    if (!task) return { type: "NOT_FOUND" } as const;
    const busy = await busyBlocks(tx, userId, start, end, task.id, calendar, respectsWorkHours(task.domain.slug, task.workContext) ? settings : null);
    const clash = busy.find((block) => block.start < end && block.end > start);
    if (clash) return { type: "TAKEN", message: `That time is no longer free (${clash.kind === "MEETING" ? clash.title : clash.kind === "PROTECTED" ? `${clash.title}, protected` : clash.title}).` } as const;
    await tx.executionTask.update({ where: { id: task.id }, data: { scheduledStart: start, scheduledEnd: end, whenBucket: "TODAY" } });
    await tx.executionTaskEvent.create({ data: { userId, taskId: task.id, type: "SCHEDULED", detail: start.toISOString() } });
    return { type: "BOOKED", slot: { start, end }, calendarKnown } as const;
  });
}
