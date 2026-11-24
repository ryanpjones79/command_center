import type { PrismaClient } from "@prisma/client";
import { addZonedDays, atLocalMinutes, localClock, localDateKey, startOfZonedDay, zonedParts } from "@/lib/v2/zoned-time";
import { loadRoutineProgress, timeOfDayWindow } from "@/server/v2/routines";
import { loadDaySettings, type CalendarLoader } from "@/server/v2/schedule-service";

// The Coach: one message for right now, worked out from Ryan's own data (no AI). It is shown as a card on
// Plan with tap replies, and the cron can push the same message to his phone (see server/now/run-alerts.ts).
//
// Order: a block that just ended without an outcome; the block he's in now; morning with nothing planned;
// evening wrap-up; otherwise the free gap until the next fixed thing, with the best things that fit it
// (pinned to-dos, then due to-dos, then the routine furthest behind whose time of day is now open).

export type CoachOption = { taskId: string; title: string; minutes: number; why: string; routine: boolean };
export type CoachMessage =
  | { kind: "ENDED"; key: string; text: string; taskId: string; title: string }
  | { kind: "NOW"; key: string; text: string; taskId: string; title: string; until: string }
  | { kind: "MORNING"; key: string; text: string }
  | { kind: "EVENING"; key: string; text: string }
  | { kind: "GAP"; key: string; text: string; freeMinutes: number; until: string; untilIso: string; options: CoachOption[] }
  | { kind: "FREE"; key: string; text: string; freeMinutes: number; until: string };

const ENDED_LOOKBACK_MIN = 45;
const MIN_GAP = 20;
const EVENING_MIN = 20 * 60;
const MORNING_END_MIN = 11 * 60;

const fmt = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}` : `${minutes} min`);
const isCheckin = (sourceSystem: string | null) => Boolean(sourceSystem && sourceSystem !== "ROUTINE" && sourceSystem !== "CAPTURE");

export async function loadCoach(userId: string, db: PrismaClient, calendarLoader: CalendarLoader, now = new Date()): Promise<CoachMessage | null> {
  const settings = await loadDaySettings(userId, db);
  const tz = settings.timeZone;
  const dayStart = startOfZonedDay(now, tz);
  const dayEnd = atLocalMinutes(now, settings.dayEndMin, tz);
  const tomorrow = addZonedDays(dayStart, 1, tz);
  const todayKey = localDateKey(now, tz);
  const nowMin = zonedParts(now, tz).hour * 60 + zonedParts(now, tz).minute;

  const [meetings, blocks, open, routines, progress] = await Promise.all([
    calendarLoader(dayStart, tomorrow).catch(() => []),
    db.executionTask.findMany({
      where: { userId, status: { notIn: ["DONE", "DROPPED"] }, scheduledStart: { gte: dayStart, lt: tomorrow } },
      select: { id: true, title: true, scheduledStart: true, scheduledEnd: true, status: true },
      orderBy: { scheduledStart: "asc" }
    }),
    db.executionTask.findMany({
      where: { userId, status: { notIn: ["DONE", "DROPPED", "WAITING"] }, needsJudgment: false, isBlocked: false, scheduledStart: null },
      select: { id: true, title: true, sourceSystem: true, integrationSourceKey: true, whenBucket: true, dueDate: true, expiresAt: true, followUpDate: true, remainingMinutes: true },
      take: 1000
    }),
    db.protectedRoutine.findMany({ where: { userId, active: true }, select: { id: true, timeOfDay: true } }),
    loadRoutineProgress(userId, db, now)
  ]);

  // 1. A block that ended in the last 45 minutes and hasn't been closed out.
  const current = blocks.find((block) => (block.scheduledStart as Date) <= now && (block.scheduledEnd as Date) > now) ?? null;
  const ended = blocks
    .filter((block) => block.scheduledEnd && block.scheduledEnd <= now && now.getTime() - block.scheduledEnd.getTime() <= ENDED_LOOKBACK_MIN * 60_000)
    .sort((a, b) => (b.scheduledEnd as Date).getTime() - (a.scheduledEnd as Date).getTime())[0];
  if (ended && !current) {
    return { kind: "ENDED", key: `ended:${ended.id}:${(ended.scheduledEnd as Date).toISOString()}`, taskId: ended.id, title: ended.title, text: `Did you finish ${ended.title}?` };
  }

  // 2. In a block now.
  if (current) {
    const until = localClock(current.scheduledEnd as Date, tz);
    return { kind: "NOW", key: `now:${current.id}`, taskId: current.id, title: current.title, until, text: `On it: ${current.title} until ${until}.` };
  }

  // 3. Morning with nothing planned yet.
  const ownOpen = open.filter((task) => task.sourceSystem !== "ROUTINE" && !isCheckin(task.sourceSystem));
  const visible = (task: (typeof open)[number]) => !(task.followUpDate && task.followUpDate > now) && task.whenBucket !== "PARKING_LOT" && !(task.expiresAt && task.expiresAt <= now);
  const pinned = ownOpen.filter((task) => visible(task) && task.whenBucket === "TODAY");
  const due = ownOpen.filter((task) => visible(task) && task.whenBucket !== "TODAY" && task.dueDate && task.dueDate < tomorrow);
  if (nowMin < MORNING_END_MIN && blocks.length === 0) {
    const parts = [pinned.length ? `${pinned.length} pinned to-do${pinned.length === 1 ? "" : "s"}` : null, due.length ? `${due.length} due` : null].filter(Boolean).join(", ");
    return { kind: "MORNING", key: `morning:${todayKey}`, text: `Morning. ${parts ? `${parts}. ` : ""}Want me to plan your day around your calendar?` };
  }

  // 4. Evening: wrap up and set up tomorrow.
  if (nowMin >= EVENING_MIN) {
    return { kind: "EVENING", key: `evening:${todayKey}`, text: "Evening. Close out today and pick tomorrow's 1-3 must-dos?" };
  }

  // 5. Free gap until the next fixed thing.
  const busy = [
    ...meetings.map((meeting) => ({ start: meeting.start, end: meeting.end })),
    ...blocks.map((block) => ({ start: block.scheduledStart as Date, end: block.scheduledEnd as Date }))
  ].filter((item) => item.end > now);
  if (busy.some((item) => item.start <= now && item.end > now)) return null; // in a meeting
  const next = busy.filter((item) => item.start > now).sort((a, b) => a.start.getTime() - b.start.getTime())[0];
  const gapEnd = next && next.start < dayEnd ? next.start : dayEnd;
  const freeMinutes = Math.floor((gapEnd.getTime() - now.getTime()) / 60_000);
  if (freeMinutes < MIN_GAP) return null;
  const until = localClock(gapEnd, tz);

  const options: CoachOption[] = [];
  const minutesOf = (task: { remainingMinutes: number | null }) => task.remainingMinutes ?? 30;
  for (const task of pinned) options.push({ taskId: task.id, title: task.title, minutes: Math.min(minutesOf(task), freeMinutes), why: "pinned for today", routine: false });
  for (const task of due) options.push({ taskId: task.id, title: task.title, minutes: Math.min(minutesOf(task), freeMinutes), why: "due today", routine: false });
  const windowOf = new Map(routines.map((routine) => [routine.id, routine.timeOfDay]));
  const copies = open
    .filter((task) => task.sourceSystem === "ROUTINE" && (task.integrationSourceKey ?? "").endsWith(`:${todayKey}`))
    .map((task) => ({ task, routineId: (task.integrationSourceKey ?? "").split(":")[1] ?? "" }))
    .filter(({ routineId }) => windowOf.has(routineId))
    .filter(({ routineId }) => {
      const window = timeOfDayWindow(windowOf.get(routineId), settings);
      return nowMin >= window.startMin && nowMin < window.endMin;
    })
    .map(({ task, routineId }) => ({ task, week: progress.get(routineId) }))
    .sort((a, b) => (a.week && a.week.target ? a.week.done / a.week.target : 0) - (b.week && b.week.target ? b.week.done / b.week.target : 0));
  for (const { task, week } of copies) {
    if (minutesOf(task) > freeMinutes + 10) continue;
    options.push({ taskId: task.id, title: task.title, minutes: Math.min(minutesOf(task), freeMinutes), why: week ? `${week.done} of ${week.target} this week` : "routine", routine: true });
  }
  const key = `gap:${todayKey}:${gapEnd.toISOString()}`;
  if (options.length === 0) {
    return { kind: "FREE", key, freeMinutes, until, text: `You're free until ${until} (${fmt(freeMinutes)}) and nothing is waiting. Enjoy it.` };
  }
  const first = options[0];
  return { kind: "GAP", key, freeMinutes, until, untilIso: gapEnd.toISOString(), options: options.slice(0, 5), text: `You're free until ${until}. ${first.title} for ${fmt(first.minutes)}?` };
}

// Which messages are worth a phone notification (the rest only show in the app).
export function coachPushWorthy(message: CoachMessage | null): message is Extract<CoachMessage, { kind: "GAP" | "MORNING" | "EVENING" }> {
  if (!message) return false;
  if (message.kind === "GAP") return message.freeMinutes >= 30;
  return message.kind === "MORNING" || message.kind === "EVENING";
}
