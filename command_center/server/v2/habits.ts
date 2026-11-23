import type { PrismaClient } from "@prisma/client";
import { detectPhi } from "@/lib/execution-validation";
import { addZonedDays, localDateKey, startOfZonedDay, zonedParts } from "@/lib/v2/zoned-time";
import { materializeRoutines, parseWeekdays, ROUTINE_AREAS, type RoutineArea } from "@/server/v2/routines";
import { loadDaySettings } from "@/server/v2/schedule-service";

// Daily habits = the standard-week routines (walk, workout, ...). Each day RyanOS makes one task per routine
// (key ROUTINE:<routineId>:<YYYY-MM-DD>, see routines.ts). The Plan screen shows today's as quick check-offs
// with a streak, instead of mixing them into the project lists.

export type Habit = {
  routineId: string;
  title: string;
  minutes: number;
  areaSlug: string;
  weekdays: number[];
  todayTaskId: string | null;
  done: boolean;
  streak: number;
};

const STREAK_LOOKBACK_DAYS = 120;

// Consecutive scheduled days done, counting back from today. Today counts once it is done; an unfinished today
// doesn't break the streak yet. Days the routine isn't scheduled are skipped; the count stops at the first
// scheduled day that wasn't done, or when the routine didn't exist yet.
export function streakFor(weekdays: number[], doneDays: Set<string>, days: { key: string; weekday: number }[], since: string) {
  let streak = 0;
  for (const [index, day] of days.entries()) {
    if (day.key < since) break;
    if (!weekdays.includes(day.weekday)) continue;
    if (doneDays.has(day.key)) streak++;
    else if (index === 0) continue; // today, not done yet
    else break;
  }
  return streak;
}

export async function loadHabits(userId: string, db: PrismaClient, now = new Date()): Promise<Habit[]> {
  const settings = await loadDaySettings(userId, db);
  const tz = settings.timeZone;
  const today = startOfZonedDay(now, tz);
  const days = Array.from({ length: STREAK_LOOKBACK_DAYS }, (_, index) => {
    const day = addZonedDays(today, -index, tz);
    return { key: localDateKey(day, tz), weekday: zonedParts(day, tz).weekday };
  });
  const todayKey = days[0].key;
  const [routines, instances] = await Promise.all([
    db.protectedRoutine.findMany({ where: { userId, active: true }, orderBy: { createdAt: "asc" } }),
    db.executionTask.findMany({
      where: { userId, sourceSystem: "ROUTINE", createdAt: { gte: addZonedDays(today, -STREAK_LOOKBACK_DAYS - 1, tz) } },
      select: { id: true, integrationSourceKey: true, status: true }
    })
  ]);
  const byRoutine = new Map<string, { id: string; day: string; status: string }[]>();
  for (const task of instances) {
    const [, routineId, day] = (task.integrationSourceKey ?? "").split(":");
    if (!routineId || !day) continue;
    byRoutine.set(routineId, [...(byRoutine.get(routineId) ?? []), { id: task.id, day, status: task.status }]);
  }
  return routines
    .map((routine) => {
      const weekdays = parseWeekdays(routine.weekdays);
      const rows = byRoutine.get(routine.id) ?? [];
      const todayRow = rows.find((row) => row.day === todayKey && row.status !== "DROPPED") ?? null;
      const doneDays = new Set(rows.filter((row) => row.status === "DONE").map((row) => row.day));
      return {
        routineId: routine.id,
        title: routine.title,
        minutes: routine.durationMin,
        areaSlug: routine.domainSlug,
        weekdays,
        todayTaskId: todayRow?.id ?? null,
        done: todayRow?.status === "DONE",
        streak: streakFor(weekdays, doneDays, days, localDateKey(routine.createdAt, tz))
      };
    })
    .filter((habit) => habit.weekdays.includes(days[0].weekday));
}

export async function setHabitDone(userId: string, taskId: string, done: boolean, db: PrismaClient, now = new Date()) {
  const task = await db.executionTask.findFirst({ where: { id: taskId, userId, sourceSystem: "ROUTINE" }, select: { id: true, status: true } });
  if (!task) return { ok: false as const, error: "That habit isn't on today's list." };
  if ((task.status === "DONE") === done) return { ok: true as const };
  await db.executionTask.update({
    where: { id: taskId },
    data: done ? { status: "DONE", completedAt: now, localConfirmedAt: now } : { status: "NOT_STARTED", completedAt: null, localConfirmedAt: null }
  });
  await db.executionTaskEvent.create({ data: { userId, taskId, type: done ? "COMPLETED" : "REOPENED", detail: "Daily habit" } });
  return { ok: true as const };
}

export async function createHabit(
  userId: string,
  input: { title: string; weekdays: number[]; minutes: number; area: string },
  db: PrismaClient,
  now = new Date()
) {
  const title = input.title.trim().slice(0, 120);
  if (!title) return { ok: false as const, error: "Name the habit." };
  if (detectPhi(title).length > 0) return { ok: false as const, error: "Not saved: that looks like patient information (NO PHI)." };
  // parseWeekdays("") would read as Sunday, so an empty pick is refused first.
  const weekdays = input.weekdays.length ? parseWeekdays(input.weekdays.join(",")) : [];
  if (weekdays.length === 0) return { ok: false as const, error: "Pick at least one day." };
  if (!(input.area in ROUTINE_AREAS)) return { ok: false as const, error: "Pick an area." };
  const duplicate = await db.protectedRoutine.findFirst({ where: { userId, active: true, title }, select: { id: true } });
  if (duplicate) return { ok: false as const, error: `You already have "${title}".` };
  await db.protectedRoutine.create({
    data: { userId, title, domainSlug: ROUTINE_AREAS[input.area as RoutineArea], weekdays: weekdays.join(","), startMin: null, durationMin: Math.max(5, Math.min(480, Math.round(input.minutes) || 30)) }
  });
  await materializeRoutines(userId, db, now);
  return { ok: true as const };
}
