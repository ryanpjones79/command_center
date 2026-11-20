import { Prisma, type PrismaClient } from "@prisma/client";
import { atLocalMinutes, localDateKey, zonedParts } from "@/lib/v2/zoned-time";
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

export type RoutineView = { id: string; title: string; domainSlug: string; weekdays: string; startMin: number | null; durationMin: number; active: boolean };

export function routinesForDay(routines: RoutineView[], day: Date, timeZone: string) {
  const weekday = zonedParts(day, timeZone).weekday;
  return routines.filter((routine) => routine.active && parseWeekdays(routine.weekdays).includes(weekday));
}

export async function materializeRoutines(userId: string, db: PrismaClient, now = new Date()) {
  const settings = await loadDaySettings(userId, db);
  const routines = await db.protectedRoutine.findMany({ where: { userId, active: true } });
  const today = routinesForDay(routines, now, settings.timeZone);
  const dateKey = localDateKey(now, settings.timeZone);
  let created = 0;
  for (const routine of today) {
    const key = `ROUTINE:${routine.id}:${dateKey}`;
    const exists = await db.executionTask.findUnique({ where: { userId_integrationSourceKey: { userId, integrationSourceKey: key } }, select: { id: true } });
    if (exists) continue;
    const domain =
      (await db.executionDomain.findFirst({ where: { userId, slug: routine.domainSlug }, select: { id: true } })) ??
      (await db.executionDomain.findFirst({ where: { userId }, orderBy: { createdAt: "asc" }, select: { id: true } }));
    if (!domain) continue;
    const start = routine.startMin === null ? null : atLocalMinutes(now, routine.startMin, settings.timeZone);
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
            whenBucket: "TODAY",
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
