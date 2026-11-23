import type { PrismaClient } from "@prisma/client";
import { placeItem, type BusyBlock, type Slot } from "@/lib/v2/scheduler";
import { addZonedDays, atLocalMinutes, localDateKey, startOfZonedDay, startOfZonedWeek } from "@/lib/v2/zoned-time";
import { loadRoutineProgress, timeOfDayWindow } from "@/server/v2/routines";
import { dayTaskSelect, PROTECTED_SLUGS, toDayTask, type DayTask } from "@/server/v2/day";
import { loadDaySettings, type CalendarLoader } from "@/server/v2/schedule-service";

// Plan a day: propose a feasible day so the normal interaction is
// "review a few exceptions, accept". Proposal only; nothing is booked until
// accepted, and acceptance re-checks every slot under the booking lock.
//
// Order: fixed items stay put; then to-dos (protected, picked must-dos, due soon,
// committed for the day, selected projects); then routines fill the gaps that are
// left: ones with a preferred time of day first, then the rest, each furthest
// behind its weekly target first. The interruption buffer is never used, so some time stays free.

export type ProposedItem = { task: DayTask; slot: Slot; reason: string; routine?: boolean };
export type PlanOptions = { day?: Date; mustDo?: string[] };
export type Unplaced = { task: DayTask; reason: string };
export type DayProposal = { items: ProposedItem[]; unplaced: Unplaced[]; bufferMinutes: number };

function rank(task: DayTask, from: Date, dayEnd: Date, selectedProjects: Set<string>, mustDo: Set<string>) {
  const deadline = [task.dueDate, task.expiresAt].filter((value): value is Date => value instanceof Date).sort((a, b) => a.getTime() - b.getTime())[0];
  if (task.isProtected) return { tier: 0, key: task.createdAt.getTime(), reason: "Protected time goes first" };
  if (mustDo.has(task.id)) return { tier: 1, key: task.createdAt.getTime(), reason: "You picked it as a must-do" };
  if (deadline && deadline.getTime() - from.getTime() < 2 * 86_400_000) return { tier: 2, key: deadline.getTime(), reason: task.expiresAt ? "Expires soon" : "Due soon" };
  if (task.whenBucket === "TODAY") return { tier: 3, key: task.createdAt.getTime(), reason: "Committed for today" };
  if (task.followUpDate && task.followUpDate < dayEnd) return { tier: 3, key: task.followUpDate.getTime(), reason: "Moved to this day" };
  if (task.projectId && selectedProjects.has(task.projectId)) return { tier: 4, key: task.createdAt.getTime(), reason: "Selected project this week" };
  return null;
}

export async function proposeDay(userId: string, db: PrismaClient, calendarLoader: CalendarLoader, now = new Date(), options: PlanOptions = {}): Promise<DayProposal> {
  const settings = await loadDaySettings(userId, db);
  const tz = settings.timeZone;
  const dayStart = startOfZonedDay(options.day ?? now, tz);
  const dayEnd = addZonedDays(dayStart, 1, tz);
  if (dayEnd <= now) return { items: [], unplaced: [], bufferMinutes: settings.bufferMinutes };
  const from = dayStart > now ? dayStart : now; // planning a later day starts at its beginning
  const dateKey = localDateKey(dayStart, tz);
  const mustDo = new Set(options.mustDo ?? []);
  const weekOf = startOfZonedWeek(dayStart, tz);
  const [open, meetings, attention, progress, copies, routineRows] = await Promise.all([
    db.executionTask.findMany({ where: { userId, status: { notIn: ["DONE", "DROPPED", "WAITING"] }, isBlocked: false, needsJudgment: false }, select: dayTaskSelect, take: 1000 }),
    calendarLoader(dayStart, dayEnd).catch(() => []),
    db.projectAttention.findMany({ where: { userId, weekOf, plannedMinutes: { gt: 0 } }, select: { projectId: true } }),
    loadRoutineProgress(userId, db, dayStart),
    db.executionTask.findMany({
      where: { userId, sourceSystem: "ROUTINE", status: { notIn: ["DONE", "DROPPED"] }, scheduledStart: null, integrationSourceKey: { endsWith: `:${dateKey}` } },
      select: { ...dayTaskSelect, integrationSourceKey: true }
    }),
    db.protectedRoutine.findMany({ where: { userId, active: true }, select: { id: true, timeOfDay: true } })
  ]);
  const selected = new Set(attention.map((row) => row.projectId));
  const tasks = open.map(toDayTask);

  const busy: BusyBlock[] = [
    ...meetings.map((meeting, index): BusyBlock => ({ id: `cal:${index}`, title: meeting.title, start: meeting.start, end: meeting.end, kind: "MEETING", movable: false })),
    ...tasks
      .filter((task) => task.scheduledStart && task.scheduledEnd && task.scheduledEnd > from && task.scheduledStart < dayEnd)
      .map((task): BusyBlock => ({ id: task.id, title: task.title, start: task.scheduledStart as Date, end: task.scheduledEnd as Date, kind: PROTECTED_SLUGS.has(task.domainSlug) ? "PROTECTED" : "COMMITTED", movable: false }))
  ];

  // Routine day copies are planned in the second pass, never as to-dos.
  const candidates = tasks
    .filter((task) => task.sourceSystem !== "ROUTINE" && !task.scheduledStart && !(task.expiresAt && task.expiresAt <= from))
    .map((task) => ({ task, rank: rank(task, from, dayEnd, selected, mustDo) }))
    .filter((entry): entry is { task: DayTask; rank: NonNullable<ReturnType<typeof rank>> } => entry.rank !== null)
    .sort((a, b) => a.rank.tier - b.rank.tier || a.rank.key - b.rank.key);

  // Only one next action per selected project; the rest wait their turn.
  const seenProjects = new Set<string>();
  const items: ProposedItem[] = [];
  const unplaced: Unplaced[] = [];
  for (const { task, rank: why } of candidates.slice(0, 40)) {
    if (why.tier === 4 && task.projectId) {
      if (seenProjects.has(task.projectId)) continue;
      seenProjects.add(task.projectId);
    }
    const result = placeItem(
      { minutes: task.minutes, workContext: task.workContext, dueAt: task.dueDate, expiresAt: task.expiresAt, earliest: from, horizonDays: 1 },
      busy,
      settings
    );
    if (result.type === "SLOT" && !result.usesBuffer && result.slot.start < dayEnd) {
      items.push({ task, slot: result.slot, reason: why.reason });
      busy.push({ id: task.id, title: task.title, start: result.slot.start, end: result.slot.end, kind: task.isProtected ? "PROTECTED" : "COMMITTED", movable: false });
    } else {
      unplaced.push({
        task,
        reason: result.type === "EXPIRED" ? "Expired" : why.tier <= 2 ? "Doesn't fit. Needs a decision." : "No room without using the buffer"
      });
    }
  }

  // Second pass: routines fill what's left, furthest behind this week first.
  const routineOf = new Map(routineRows.map((row) => [row.id, row]));
  const routineId = (key: string | null) => (key ?? "").split(":")[1] ?? "";
  const share = (key: string | null) => {
    const week = progress.get(routineId(key));
    return week && week.target > 0 ? week.done / week.target : 0;
  };
  // Routines tied to a time of day go first (they have fewer places to fit), then any-time ones.
  const windowed = (key: string | null) => (routineOf.get(routineId(key))?.timeOfDay ? 0 : 1);
  const ordered = [...copies].sort((a, b) => windowed(a.integrationSourceKey) - windowed(b.integrationSourceKey) || share(a.integrationSourceKey) - share(b.integrationSourceKey));
  for (const row of ordered) {
    const task = toDayTask(row);
    const id = routineId(row.integrationSourceKey);
    if (!routineOf.has(id)) continue; // paused or removed routine
    const window = timeOfDayWindow(routineOf.get(id)?.timeOfDay, settings);
    const windowStart = atLocalMinutes(dayStart, window.startMin, tz);
    const windowEnd = atLocalMinutes(dayStart, window.endMin, tz);
    const week = progress.get(id);
    const label = week ? `${week.done} of ${week.target} this week` : "routine";
    if (windowEnd <= from) {
      unplaced.push({ task, reason: "Its time of day has passed" });
      continue;
    }
    const result = placeItem(
      { minutes: task.minutes, workContext: null, dueAt: windowEnd, expiresAt: null, earliest: windowStart > from ? windowStart : from, horizonDays: 1 },
      busy,
      settings
    );
    if (result.type === "SLOT" && !result.usesBuffer && result.slot.start < dayEnd && result.slot.end <= windowEnd) {
      items.push({ task, slot: result.slot, reason: `Routine · ${label}`, routine: true });
      busy.push({ id: task.id, title: task.title, start: result.slot.start, end: result.slot.end, kind: "COMMITTED", movable: false });
    } else {
      unplaced.push({ task, reason: `No free gap for it (${label})` });
    }
  }
  return { items: items.sort((a, b) => a.slot.start.getTime() - b.slot.start.getTime()), unplaced, bufferMinutes: settings.bufferMinutes };
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
