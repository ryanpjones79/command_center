import type { PrismaClient } from "@prisma/client";
import { addZonedDays, startOfZonedWeek, zonedParts } from "@/lib/v2/zoned-time";
import { loadDaySettings } from "@/server/v2/schedule-service";

// Weekly attention: allocate available focus time among the projects Ryan
// actually intends to advance. Unequal is fine; a selected project left with
// no reserved time this week is made visible.

export type WeeklyAllocation = {
  weekOf: Date;
  capacityMinutes: number; // remaining workday minutes this week, before meetings
  scheduledMinutes: number; // already booked this week
  allocations: { projectId: string; plannedMinutes: number; reservedMinutes: number }[];
};

export async function loadWeekly(userId: string, db: PrismaClient, now = new Date()): Promise<WeeklyAllocation> {
  const settings = await loadDaySettings(userId, db);
  const weekOf = startOfZonedWeek(now, settings.timeZone);
  const weekEnd = addZonedDays(weekOf, 7, settings.timeZone);
  const daily = Math.max(0, settings.workdayEndMin - settings.workdayStartMin - settings.bufferMinutes);
  let capacity = 0;
  for (let offset = 0; offset < 7; offset++) {
    const day = addZonedDays(weekOf, offset, settings.timeZone);
    const weekday = zonedParts(day, settings.timeZone).weekday;
    if (weekday === 0 || weekday === 6) continue;
    const dayEnd = addZonedDays(day, 1, settings.timeZone);
    if (dayEnd <= now) continue;
    capacity += daily;
  }
  const [rows, booked] = await Promise.all([
    db.projectAttention.findMany({ where: { userId, weekOf }, select: { projectId: true, plannedMinutes: true } }),
    db.executionTask.findMany({
      where: { userId, status: { notIn: ["DROPPED"] }, scheduledStart: { gte: weekOf, lt: weekEnd } },
      select: { projectId: true, scheduledStart: true, scheduledEnd: true }
    })
  ]);
  const minutesOf = (task: { scheduledStart: Date | null; scheduledEnd: Date | null }) =>
    task.scheduledStart && task.scheduledEnd ? Math.round((task.scheduledEnd.getTime() - task.scheduledStart.getTime()) / 60_000) : 0;
  const reservedBy = new Map<string, number>();
  for (const task of booked) if (task.projectId) reservedBy.set(task.projectId, (reservedBy.get(task.projectId) ?? 0) + minutesOf(task));
  return {
    weekOf,
    capacityMinutes: capacity,
    scheduledMinutes: booked.reduce((sum, task) => sum + minutesOf(task), 0),
    allocations: rows.map((row) => ({ projectId: row.projectId, plannedMinutes: row.plannedMinutes, reservedMinutes: reservedBy.get(row.projectId) ?? 0 }))
  };
}

export async function setAttention(userId: string, projectId: string, plannedMinutes: number, db: PrismaClient, now = new Date()) {
  const settings = await loadDaySettings(userId, db);
  const weekOf = startOfZonedWeek(now, settings.timeZone);
  const project = await db.executionProject.findFirst({ where: { id: projectId, userId }, select: { id: true } });
  if (!project) return { ok: false as const };
  const minutes = Math.max(0, Math.min(40 * 60, Math.round(plannedMinutes)));
  await db.projectAttention.upsert({
    where: { projectId_weekOf: { projectId, weekOf } },
    update: { plannedMinutes: minutes },
    create: { userId, projectId, weekOf, plannedMinutes: minutes }
  });
  return { ok: true as const };
}
