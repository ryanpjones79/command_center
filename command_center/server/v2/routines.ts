import { Prisma, type PrismaClient } from "@prisma/client";
import type { DaySettings } from "@/lib/v2/scheduler";
import { atLocalMinutes, localDateKey, startOfZonedWeek, zonedParts } from "@/lib/v2/zoned-time";
import { loadDaySettings } from "@/server/v2/schedule-service";

// Standard week: protected commitments (kids, health) placed automatically.
// Each routine becomes one task per day, keyed ROUTINE:<routineId>:<date>, so
// it is created once; if Ryan moves or drops that day's instance it is not
// recreated. A fixed-time routine takes its slot and moves any non-protected
// work there back to today's queue (remaining time kept). An "any time"
// routine goes to the front of the morning plan.

export const ROUTINE_AREAS = { KIDS: "family", HEALTH: "health", PERSONAL: "admin" } as const;
export type RoutineArea = keyof typeof ROUTINE_AREAS;
const PROTECTED = new Set(["family", "kids", "health"]);

export function parseWeekdays(value: string) {
  return [...new Set(value.split(",").map((day) => Number(day.trim())).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort();
}

export type RoutineView = { id: string; title: string; domainSlug: string; weekdays: string; startMin: number | null; durationMin: number; active: boolean; timesPerWeek?: number | null; timeOfDay?: string | null };

// Fill-in routines (no fixed time) can prefer part of the day. Windows are local minutes after midnight.
export const TIMES_OF_DAY = ["MORNING", "AFTERNOON", "EVENING"] as const;
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];
export const TIME_OF_DAY_LABEL: Record<TimeOfDay, string> = { MORNING: "Mornings", AFTERNOON: "Afternoons", EVENING: "Evenings" };
export function isTimeOfDay(value: unknown): value is TimeOfDay {
  return typeof value === "string" && (TIMES_OF_DAY as readonly string[]).includes(value);
}
export function timeOfDayWindow(value: string | null | undefined, settings: Pick<DaySettings, "workdayStartMin" | "dayEndMin">) {
  const dayStart = Math.min(settings.workdayStartMin, 7 * 60);
  if (value === "MORNING") return { startMin: dayStart, endMin: 12 * 60 };
  if (value === "AFTERNOON") return { startMin: 12 * 60, endMin: 17 * 60 };
  if (value === "EVENING") return { startMin: 17 * 60, endMin: Math.max(settings.dayEndMin, 18 * 60) };
  return { startMin: dayStart, endMin: settings.dayEndMin };
}

// How many times a week the routine should happen: its weekly target, or every day it's listed for.
export function weeklyTarget(routine: Pick<RoutineView, "weekdays" | "timesPerWeek">) {
  const days = parseWeekdays(routine.weekdays).length;
  return routine.timesPerWeek && routine.timesPerWeek > 0 ? Math.min(routine.timesPerWeek, days || 7) : days;
}

// An area can be given as a legacy key (KIDS, HEALTH, PERSONAL) or as any of the user's area slugs.
export async function resolveRoutineArea(userId: string, area: string, db: PrismaClient) {
  const slug = area in ROUTINE_AREAS ? ROUTINE_AREAS[area as RoutineArea] : area;
  const domain = await db.executionDomain.findFirst({ where: { userId, slug }, select: { slug: true } });
  return domain?.slug ?? null;
}

export type RoutineProgress = { done: number; target: number; doneMinutes: number; targetMinutes: number; doneToday: boolean };

// This week's progress per routine, from its day copies (keys ROUTINE:<id>:<YYYY-MM-DD>).
export async function loadRoutineProgress(userId: string, db: PrismaClient, now = new Date()) {
  const settings = await loadDaySettings(userId, db);
  const tz = settings.timeZone;
  const weekKey = localDateKey(startOfZonedWeek(now, tz), tz);
  const todayKey = localDateKey(now, tz);
  const [routines, done] = await Promise.all([
    db.protectedRoutine.findMany({ where: { userId } }),
    db.executionTask.findMany({
      where: { userId, sourceSystem: "ROUTINE", status: "DONE", createdAt: { gte: new Date(startOfZonedWeek(now, tz).getTime() - 2 * 86_400_000) } },
      select: { integrationSourceKey: true }
    })
  ]);
  const days = new Map<string, Set<string>>();
  for (const row of done) {
    const [, routineId, day] = (row.integrationSourceKey ?? "").split(":");
    if (!routineId || !day || day < weekKey) continue;
    days.set(routineId, (days.get(routineId) ?? new Set()).add(day));
  }
  const progress = new Map<string, RoutineProgress>();
  for (const routine of routines) {
    const count = days.get(routine.id)?.size ?? 0;
    const target = weeklyTarget(routine);
    progress.set(routine.id, { done: count, target, doneMinutes: count * routine.durationMin, targetMinutes: target * routine.durationMin, doneToday: days.get(routine.id)?.has(todayKey) ?? false });
  }
  return progress;
}

export function routinesForDay(routines: RoutineView[], day: Date, timeZone: string) {
  const weekday = zonedParts(day, timeZone).weekday;
  return routines.filter((routine) => routine.active && parseWeekdays(routine.weekdays).includes(weekday));
}

// Make the day's copies. `day` defaults to today; the evening wrap-up passes tomorrow so it can be planned.
// A routine with a weekly target (timesPerWeek) gets no copy once it has been done that many times this week.
export async function materializeRoutines(userId: string, db: PrismaClient, now = new Date(), options: { day?: Date } = {}) {
  const settings = await loadDaySettings(userId, db);
  const day = options.day ?? now;
  const routines = await db.protectedRoutine.findMany({ where: { userId, active: true } });
  const today = routinesForDay(routines, day, settings.timeZone);
  const dateKey = localDateKey(day, settings.timeZone);
  const isToday = dateKey === localDateKey(now, settings.timeZone);
  const weekKey = localDateKey(startOfZonedWeek(day, settings.timeZone), settings.timeZone);
  const capped = today.filter((routine) => routine.timesPerWeek && routine.timesPerWeek > 0);
  const doneThisWeek = new Map<string, number>();
  if (capped.length) {
    const rows = await db.executionTask.findMany({
      where: { userId, sourceSystem: "ROUTINE", status: "DONE", OR: capped.map((routine) => ({ integrationSourceKey: { startsWith: `ROUTINE:${routine.id}:` } })) },
      select: { integrationSourceKey: true }
    });
    for (const row of rows) {
      const [, routineId, key] = (row.integrationSourceKey ?? "").split(":");
      if (key >= weekKey && key < dateKey) doneThisWeek.set(routineId, (doneThisWeek.get(routineId) ?? 0) + 1);
    }
  }
  let created = 0;
  for (const routine of today) {
    if (routine.timesPerWeek && (doneThisWeek.get(routine.id) ?? 0) >= routine.timesPerWeek) continue;
    const key = `ROUTINE:${routine.id}:${dateKey}`;
    const exists = await db.executionTask.findUnique({ where: { userId_integrationSourceKey: { userId, integrationSourceKey: key } }, select: { id: true } });
    if (exists) continue;
    const domain =
      (await db.executionDomain.findFirst({ where: { userId, slug: routine.domainSlug }, select: { id: true } })) ??
      (await db.executionDomain.findFirst({ where: { userId }, orderBy: { createdAt: "asc" }, select: { id: true } }));
    if (!domain) continue;
    const start = routine.startMin === null ? null : atLocalMinutes(day, routine.startMin, settings.timeZone);
    const end = start ? new Date(start.getTime() + routine.durationMin * 60_000) : null;
    try {
      await db.$transaction(async (tx) => {
        const task = await tx.executionTask.create({
          data: {
            userId,
            domainId: domain.id,
            title: routine.title,
            type: "ACTION",
            status: "NOT_STARTED",
            priority: "HIGH",
            whenBucket: isToday ? "TODAY" : "THIS_WEEK",
            remainingMinutes: routine.durationMin,
            scheduledStart: start,
            scheduledEnd: end,
            sourceSystem: "ROUTINE",
            integrationSourceKey: key,
            source: "Standard week"
          },
          select: { id: true }
        });
        await tx.executionTaskEvent.create({ data: { userId, taskId: task.id, type: "ARRIVED", detail: "Standard week" } });
        if (start && end && PROTECTED.has(routine.domainSlug)) {
          const overlapping = await tx.executionTask.findMany({
            where: {
              userId,
              id: { not: task.id },
              status: { notIn: ["DONE", "DROPPED"] },
              scheduledStart: { lt: end },
              scheduledEnd: { gt: start },
              domain: { slug: { notIn: [...PROTECTED] } }
            },
            select: { id: true, scheduledStart: true, scheduledEnd: true, remainingMinutes: true }
          });
          for (const other of overlapping) {
            const minutes = other.remainingMinutes ?? Math.round(((other.scheduledEnd as Date).getTime() - (other.scheduledStart as Date).getTime()) / 60_000);
            await tx.executionTask.update({ where: { id: other.id }, data: { scheduledStart: null, scheduledEnd: null, whenBucket: "TODAY", remainingMinutes: minutes } });
            await tx.executionTaskEvent.create({ data: { userId, taskId: other.id, type: "DISPLACED", detail: `Protected: ${routine.title}` } });
          }
        }
      });
      created++;
    } catch (error) {
      // A concurrent run created the same day's instance first: fine.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }
  }
  return { created };
}
