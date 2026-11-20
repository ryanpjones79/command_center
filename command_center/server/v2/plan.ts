import type { PrismaClient } from "@prisma/client";
import { placeItem, type BusyBlock, type Slot } from "@/lib/v2/scheduler";
import { addZonedDays, startOfZonedDay, startOfZonedWeek } from "@/lib/v2/zoned-time";
import { dayTaskSelect, PROTECTED_SLUGS, toDayTask, type DayTask } from "@/server/v2/day";
import { loadDaySettings, type CalendarLoader } from "@/server/v2/schedule-service";

// Morning launch: propose a feasible day so the normal interaction is
// "review a few exceptions, accept". Proposal only; nothing is booked until
// accepted, and acceptance re-checks every slot under the booking lock.

export type ProposedItem = { task: DayTask; slot: Slot; reason: string };
export type Unplaced = { task: DayTask; reason: string };
export type DayProposal = { items: ProposedItem[]; unplaced: Unplaced[]; bufferMinutes: number };

function rank(task: DayTask, now: Date, selectedProjects: Set<string>) {
  const deadline = [task.dueDate, task.expiresAt].filter((value): value is Date => value instanceof Date).sort((a, b) => a.getTime() - b.getTime())[0];
  if (task.isProtected) return { tier: 0, key: task.createdAt.getTime(), reason: "Protected time goes first" };
  if (deadline && deadline.getTime() - now.getTime() < 2 * 86_400_000) return { tier: 1, key: deadline.getTime(), reason: task.expiresAt ? "Expires soon" : "Due soon" };
  if (task.whenBucket === "TODAY") return { tier: 2, key: task.createdAt.getTime(), reason: "Committed for today" };
  if (task.projectId && selectedProjects.has(task.projectId)) return { tier: 3, key: task.createdAt.getTime(), reason: "Selected project this week" };
  return null;
}

export async function proposeDay(userId: string, db: PrismaClient, calendarLoader: CalendarLoader, now = new Date()): Promise<DayProposal> {
  const settings = await loadDaySettings(userId, db);
  const dayStart = startOfZonedDay(now, settings.timeZone);
  const dayEnd = addZonedDays(dayStart, 1, settings.timeZone);
  const weekOf = startOfZonedWeek(now, settings.timeZone);
  const [open, meetings, attention] = await Promise.all([
    db.executionTask.findMany({ where: { userId, status: { notIn: ["DONE", "DROPPED", "WAITING"] }, isBlocked: false, needsJudgment: false }, select: dayTaskSelect, take: 1000 }),
    calendarLoader(dayStart, dayEnd).catch(() => []),
    db.projectAttention.findMany({ where: { userId, weekOf, plannedMinutes: { gt: 0 } }, select: { projectId: true } })
  ]);
  const selected = new Set(attention.map((row) => row.projectId));
  const tasks = open.map(toDayTask);

  const busy: BusyBlock[] = [
    ...meetings.map((meeting, index): BusyBlock => ({ id: `cal:${index}`, title: meeting.title, start: meeting.start, end: meeting.end, kind: "MEETING", movable: false })),
    ...tasks
      .filter((task) => task.scheduledStart && task.scheduledEnd && task.scheduledEnd > now && task.scheduledStart < dayEnd)
      .map((task): BusyBlock => ({ id: task.id, title: task.title, start: task.scheduledStart as Date, end: task.scheduledEnd as Date, kind: PROTECTED_SLUGS.has(task.domainSlug) ? "PROTECTED" : "COMMITTED", movable: false }))
  ];

  const candidates = tasks
    .filter((task) => !task.scheduledStart && !(task.expiresAt && task.expiresAt <= now))
    .map((task) => ({ task, rank: rank(task, now, selected) }))
    .filter((entry): entry is { task: DayTask; rank: NonNullable<ReturnType<typeof rank>> } => entry.rank !== null)
    .sort((a, b) => a.rank.tier - b.rank.tier || a.rank.key - b.rank.key);

  // Only one next action per selected project; the rest wait their turn.
  const seenProjects = new Set<string>();
  const items: ProposedItem[] = [];
  const unplaced: Unplaced[] = [];
  for (const { task, rank: why } of candidates.slice(0, 40)) {
    if (why.tier === 3 && task.projectId) {
      if (seenProjects.has(task.projectId)) continue;
      seenProjects.add(task.projectId);
    }
    const result = placeItem(
      { minutes: task.minutes, workContext: task.workContext, dueAt: task.dueDate, expiresAt: task.expiresAt, earliest: now, horizonDays: 1 },
      busy,
      settings
    );
    if (result.type === "SLOT" && !result.usesBuffer && result.slot.start < dayEnd) {
      items.push({ task, slot: result.slot, reason: why.reason });
      busy.push({ id: task.id, title: task.title, start: result.slot.start, end: result.slot.end, kind: task.isProtected ? "PROTECTED" : "COMMITTED", movable: false });
    } else {
      unplaced.push({
        task,
        reason: result.type === "EXPIRED" ? "Expired" : why.tier <= 1 ? "Doesn't fit today. Needs a decision." : "No room today without using the buffer"
      });
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
