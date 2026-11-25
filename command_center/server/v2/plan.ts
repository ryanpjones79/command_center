import type { PrismaClient } from "@prisma/client";
import { placeItem, type BusyBlock, type Slot } from "@/lib/v2/scheduler";
import { addZonedDays, atLocalMinutes, localDateKey, startOfZonedDay, startOfZonedWeek } from "@/lib/v2/zoned-time";
import { blockingEvents, optionalEventsBlock, respectsWorkHours, workWindows } from "@/lib/v2/availability";
import { loadRoutineProgress, timeOfDayWindow } from "@/server/v2/routines";
import { dayTaskSelect, PROTECTED_SLUGS, toDayTask, type DayTask } from "@/server/v2/day";
import { loadDaySettings, type CalendarBusy, type CalendarLoader } from "@/server/v2/schedule-service";
import { HANDOFF_SYSTEMS } from "@/lib/v2/source-events";

// Plan a day Ryan would actually follow. Proposal only; nothing is booked until accepted, and acceptance
// re-checks every slot under the booking lock.
//
// - Up to MAX_COMMITMENTS commitments, checked by default, in this order: protected-area to-dos, what he
//   pinned (or picked as a must-do), real deadlines (due or expiring within two days), work moved to this
//   day, then the next action of a project he chose to advance this week (the one furthest behind its
//   weekly time first, at most one per project). If fewer than three, a routine behind its weekly pace
//   fills the rest.
// - Everything else that fits goes under "If there's time" (unchecked), at most MAX_EXTRAS.
// - The interruption buffer is never used, and availability follows lib/v2/availability.ts: optional
//   events don't block, CCHCS work hours are protected for non-work tasks.
// - Anything that doesn't fit is listed with the reason.

export const MAX_COMMITMENTS = 3;
export const MAX_EXTRAS = 4;

export type ProposedItem = { task: DayTask; slot: Slot; reason: string; routine?: boolean; group: "COMMIT" | "EXTRA" };
export type PlanOptions = { day?: Date; mustDo?: string[] };
export type Unplaced = { task: DayTask; reason: string };
export type DayProposal = { items: ProposedItem[]; unplaced: Unplaced[]; bufferMinutes: number; calendarKnown: boolean };

type Rank = { tier: number; key: number; reason: string; weeklyProject?: string };

function deadlineText(deadline: Date, expires: boolean, from: Date, tz: string) {
  const days = Math.round((startOfZonedDay(deadline, tz).getTime() - startOfZonedDay(from, tz).getTime()) / 86_400_000);
  const word = expires ? "Expires" : "Due";
  if (deadline < from) return expires ? "Expired" : "Overdue";
  return days <= 0 ? `${word} today` : days === 1 ? `${word} tomorrow` : `${word} ${deadline.toLocaleDateString("en-US", { timeZone: tz, weekday: "short" })}`;
}

function rank(task: DayTask, from: Date, dayEnd: Date, weekly: Map<string, number>, mustDo: Set<string>, tz: string): Rank | null {
  const deadline = [task.dueDate, task.expiresAt].filter((value): value is Date => value instanceof Date).sort((a, b) => a.getTime() - b.getTime())[0];
  if (task.isProtected) return { tier: 0, key: task.createdAt.getTime(), reason: "Protected (family/health)" };
  if (mustDo.has(task.id)) return { tier: 1, key: task.createdAt.getTime(), reason: "You picked it as a must-do" };
  // Check-ins (items from Ryan's apps) are cleared, not planned, unless he committed to one for today.
  const checkin = Boolean(task.sourceSystem && task.sourceSystem !== "ROUTINE" && task.sourceSystem !== "CAPTURE" && !HANDOFF_SYSTEMS.has(task.sourceSystem));
  if (checkin && task.whenBucket !== "TODAY") return null;
  if (task.whenBucket === "TODAY") return { tier: 1, key: task.createdAt.getTime(), reason: "You pinned it for today" };
  if (deadline && deadline.getTime() - from.getTime() < 2 * 86_400_000) return { tier: 2, key: deadline.getTime(), reason: deadlineText(deadline, deadline === task.expiresAt, from, tz) };
  if (task.followUpDate && task.followUpDate < dayEnd) return { tier: 3, key: task.followUpDate.getTime(), reason: "You moved it to today" };
  if (task.projectId && weekly.has(task.projectId)) {
    return { tier: 4, key: -(weekly.get(task.projectId) as number), reason: `Weekly priority: ${task.projectName ?? "project"}`, weeklyProject: task.projectId };
  }
  return null;
}

export async function proposeDay(userId: string, db: PrismaClient, calendarLoader: CalendarLoader, now = new Date(), options: PlanOptions = {}): Promise<DayProposal> {
  const settings = await loadDaySettings(userId, db);
  const tz = settings.timeZone;
  const dayStart = startOfZonedDay(options.day ?? now, tz);
  const dayEnd = addZonedDays(dayStart, 1, tz);
  if (dayEnd <= now) return { items: [], unplaced: [], bufferMinutes: settings.bufferMinutes, calendarKnown: true };
  const from = dayStart > now ? dayStart : now; // planning a later day starts at its beginning
  const dateKey = localDateKey(dayStart, tz);
  const mustDo = new Set(options.mustDo ?? []);
  const weekOf = startOfZonedWeek(dayStart, tz);
  const weekEnd = addZonedDays(weekOf, 7, tz);
  let calendarKnown = true;
  const [open, meetings, attention, progress, copies, routineRows] = await Promise.all([
    db.executionTask.findMany({ where: { userId, status: { notIn: ["DONE", "DROPPED", "WAITING"] }, isBlocked: false, needsJudgment: false }, select: dayTaskSelect, take: 1000 }),
    calendarLoader(dayStart, dayEnd).catch(() => { calendarKnown = false; return [] as CalendarBusy[]; }),
    db.projectAttention.findMany({ where: { userId, weekOf, plannedMinutes: { gt: 0 } }, select: { projectId: true, plannedMinutes: true } }),
    loadRoutineProgress(userId, db, dayStart),
    db.executionTask.findMany({
      where: { userId, sourceSystem: "ROUTINE", status: { notIn: ["DONE", "DROPPED"] }, scheduledStart: null, integrationSourceKey: { endsWith: `:${dateKey}` } },
      select: { ...dayTaskSelect, integrationSourceKey: true }
    }),
    db.protectedRoutine.findMany({ where: { userId, active: true }, select: { id: true, timeOfDay: true } })
  ]);
  // Weekly priorities: minutes still owed this week = planned minus time already booked for the project.
  const booked = attention.length
    ? await db.executionTask.findMany({ where: { userId, projectId: { in: attention.map((row) => row.projectId) }, scheduledStart: { gte: weekOf, lt: weekEnd }, status: { not: "DROPPED" } }, select: { projectId: true, scheduledStart: true, scheduledEnd: true } })
    : [];
  const weekly = new Map(attention.map((row) => {
    const used = booked.filter((task) => task.projectId === row.projectId).reduce((sum, task) => sum + ((task.scheduledEnd?.getTime() ?? 0) - (task.scheduledStart?.getTime() ?? 0)) / 60_000, 0);
    return [row.projectId, row.plannedMinutes - used] as const;
  }));
  for (const [projectId, owed] of weekly) if (owed <= 0) weekly.delete(projectId); // that project has had its time this week
  const tasks = open.map(toDayTask);

  const busy: BusyBlock[] = [
    ...blockingEvents(meetings, optionalEventsBlock()).map((meeting, index): BusyBlock => ({ id: `cal:${index}`, title: meeting.title, start: meeting.start, end: meeting.end, kind: "MEETING", movable: false })),
    ...tasks
      .filter((task) => task.scheduledStart && task.scheduledEnd && task.scheduledEnd > from && task.scheduledStart < dayEnd)
      .map((task): BusyBlock => ({ id: task.id, title: task.title, start: task.scheduledStart as Date, end: task.scheduledEnd as Date, kind: PROTECTED_SLUGS.has(task.domainSlug) ? "PROTECTED" : "COMMITTED", movable: false }))
  ];
  const work: BusyBlock[] = workWindows(dayStart, dayEnd, settings).map((window, index) => ({ id: `work:${index}`, title: "Work hours (CCHCS)", start: new Date(window.start), end: new Date(window.end), kind: "PROTECTED", movable: false }));
  const busyFor = (task: DayTask) => (respectsWorkHours(task.domainSlug, task.workContext) ? [...busy, ...work] : busy);

  const items: ProposedItem[] = [];
  const unplaced: Unplaced[] = [];
  const counts = { COMMIT: 0, EXTRA: 0 };
  const place = (task: DayTask, earliest: Date, dueAt: Date | null, latest: Date | null) => {
    const result = placeItem({ minutes: task.minutes, workContext: dueAt === null ? task.workContext : null, dueAt: dueAt ?? (task.dueDate && task.dueDate > earliest ? task.dueDate : null), expiresAt: dueAt === null ? task.expiresAt : null, earliest, horizonDays: 1 }, busyFor(task), settings);
    if (result.type !== "SLOT" || result.usesBuffer || result.slot.start >= dayEnd || (latest && result.slot.end > latest)) return { ok: false as const, result };
    return { ok: true as const, slot: result.slot };
  };
  const take = (task: DayTask, slot: Slot, reason: string, group: "COMMIT" | "EXTRA", routine = false) => {
    items.push({ task, slot, reason, group, ...(routine ? { routine } : {}) });
    counts[group] += 1;
    busy.push({ id: task.id, title: task.title, start: slot.start, end: slot.end, kind: task.isProtected ? "PROTECTED" : "COMMITTED", movable: false });
  };
  const groupFor = () => (counts.COMMIT < MAX_COMMITMENTS ? "COMMIT" : counts.EXTRA < MAX_EXTRAS ? "EXTRA" : null);

  // To-dos. Only one next action per weekly project; the rest wait their turn.
  const candidates = tasks
    .filter((task) => task.sourceSystem !== "ROUTINE" && !task.scheduledStart && !(task.expiresAt && task.expiresAt <= from))
    .map((task) => ({ task, rank: rank(task, from, dayEnd, weekly, mustDo, tz) }))
    .filter((entry): entry is { task: DayTask; rank: Rank } => entry.rank !== null)
    .sort((a, b) => a.rank.tier - b.rank.tier || a.rank.key - b.rank.key);
  const seenProjects = new Set<string>();
  for (const { task, rank: why } of candidates.slice(0, 40)) {
    if (why.weeklyProject) {
      if (seenProjects.has(why.weeklyProject)) continue;
      seenProjects.add(why.weeklyProject);
    }
    const group = groupFor();
    if (!group) {
      unplaced.push({ task, reason: "Left for another day: today already has a full plan" });
      continue;
    }
    const placed = place(task, from, null, null);
    if (placed.ok) take(task, placed.slot, why.reason, group);
    else unplaced.push({ task, reason: placed.result.type === "EXPIRED" ? "Expired" : why.tier <= 2 ? `${why.reason}, but no free time fits ${task.minutes} min outside protected time` : `No ${task.minutes}-min gap left outside protected time and the buffer` });
  }

  // Routines: furthest behind their weekly target first, inside their time of day. A behind-pace routine
  // can fill an empty commitment; otherwise routines are "If there's time".
  const routineOf = new Map(routineRows.map((row) => [row.id, row]));
  const routineId = (key: string | null) => (key ?? "").split(":")[1] ?? "";
  const share = (key: string | null) => {
    const week = progress.get(routineId(key));
    return week && week.target > 0 ? week.done / week.target : 1;
  };
  const windowed = (key: string | null) => (routineOf.get(routineId(key))?.timeOfDay ? 0 : 1);
  const ordered = [...copies].sort((a, b) => share(a.integrationSourceKey) - share(b.integrationSourceKey) || windowed(a.integrationSourceKey) - windowed(b.integrationSourceKey));
  for (const row of ordered) {
    const task = toDayTask(row);
    const id = routineId(row.integrationSourceKey);
    if (!routineOf.has(id)) continue; // paused or removed routine
    const week = progress.get(id);
    const label = week ? `${week.done} of ${week.target} this week` : "routine";
    const window = timeOfDayWindow(routineOf.get(id)?.timeOfDay, settings);
    const windowStart = atLocalMinutes(dayStart, window.startMin, tz);
    const windowEnd = atLocalMinutes(dayStart, window.endMin, tz);
    if (windowEnd <= from) {
      unplaced.push({ task, reason: "Its time of day has passed" });
      continue;
    }
    const behind = week ? week.done < week.target : false;
    const group = counts.COMMIT < MAX_COMMITMENTS && behind ? "COMMIT" : counts.EXTRA < MAX_EXTRAS ? "EXTRA" : null;
    if (!group) {
      unplaced.push({ task, reason: `Left for another day (${label})` });
      continue;
    }
    const placed = place(task, windowStart > from ? windowStart : from, windowEnd, windowEnd);
    if (placed.ok) take(task, placed.slot, group === "COMMIT" ? `Behind this week · ${label}` : `Routine · ${label}`, group, true);
    else unplaced.push({ task, reason: `No free gap in its time of day (${label})` });
  }
  return { items: items.sort((a, b) => a.slot.start.getTime() - b.slot.start.getTime()), unplaced, bufferMinutes: settings.bufferMinutes, calendarKnown };
}

// Book accepted items; each slot is re-checked under the lock and skipped if
// something changed. Returns what was booked and what needs another look.
export async function acceptPlan(userId: string, db: PrismaClient, accepted: { taskId: string; start: string; end: string }[]) {
  const booked: string[] = [];
  const skipped: string[] = [];
  for (const item of accepted.slice(0, 40)) {
    const start = new Date(item.start);
    const end = new Date(item.end);
    if (!(start < end)) {
      skipped.push(item.taskId);
      continue;
    }
    const ok = await db.$transaction(async (tx) => {
      if ((process.env.DATABASE_URL ?? "").startsWith("postgres")) {
        await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `ryanos-schedule:${userId}`);
      }
      const task = await tx.executionTask.findFirst({ where: { id: item.taskId, userId, status: { notIn: ["DONE", "DROPPED"] }, scheduledStart: null }, select: { id: true } });
      if (!task) return false;
      const clash = await tx.executionTask.findFirst({
        where: { userId, id: { not: task.id }, status: { notIn: ["DONE", "DROPPED"] }, scheduledStart: { lt: end }, scheduledEnd: { gt: start } },
        select: { id: true }
      });
      if (clash) return false;
      await tx.executionTask.update({ where: { id: task.id }, data: { scheduledStart: start, scheduledEnd: end, whenBucket: "TODAY" } });
      await tx.executionTaskEvent.create({ data: { userId, taskId: task.id, type: "SCHEDULED", detail: "Morning plan" } });
      return true;
    });
    (ok ? booked : skipped).push(item.taskId);
  }
  return { booked, skipped };
}
