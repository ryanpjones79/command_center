import type { PrismaClient } from "@prisma/client";
import { addZonedDays, atLocalMinutes, localDateKey, startOfZonedDay } from "@/lib/v2/zoned-time";
import type { DayModel, DayTask } from "@/server/v2/day";
import { loadDaySettings } from "@/server/v2/schedule-service";

// Proportionate shutdown: resolve today's commitments, surface what can't wait
// and what would make tomorrow unreliable. New captures are NOT triaged one by
// one; they go to a dated review batch (all kept, return time shown).

export type ShutdownModel = {
  unfinished: DayTask[]; // must each get an outcome or a dated plan
  cantWait: DayTask[]; // due/expiring within 24h and not scheduled
  unreliable: string[]; // reasons tomorrow's plan may be wrong
  newCaptures: DayTask[]; // captured today, still needing judgment
  canClose: boolean;
};

export function buildShutdown(model: DayModel): ShutdownModel {
  const { now, day } = model;
  const tomorrowEnd = new Date(day.end.getTime() + 24 * 60 * 60_000);
  const unfinished = [
    ...model.blocks.filter((task) => task.status !== "WAITING"),
    ...model.queue.filter((task) => task.whenBucket === "TODAY")
  ].filter((task, index, all) => all.findIndex((other) => other.id === task.id) === index);
  const cantWait = model.queue
    .concat(model.dueForReview)
    .filter((task) => !task.scheduledStart && [task.dueDate, task.expiresAt].some((limit) => limit && limit > now && limit < tomorrowEnd))
    .filter((task, index, all) => all.findIndex((other) => other.id === task.id) === index && !unfinished.some((u) => u.id === task.id));
  const unreliable = [
    ...model.sourceProblems.map((problem) => `${problem.sourceSystem.replace("_", " ").toLowerCase()} hasn't reported since ${problem.lastSuccessAt ? problem.lastSuccessAt.toLocaleString("en-US", { timeZone: model.settings.timeZone, weekday: "short", hour: "numeric", minute: "2-digit" }) : "it was connected"}`),
    ...(model.calendarKnown ? [] : ["The calendar couldn't be read, so tomorrow's free time is uncertain"]),
    ...(model.expired.length ? [`${model.expired.length} expired offer${model.expired.length === 1 ? "" : "s"} still open (mark passed or drop)`] : [])
  ];
  const newCaptures = model.judgment.filter((task) => task.createdAt >= day.start);
  return { unfinished, cantWait, unreliable, newCaptures, canClose: unfinished.length === 0 };
}

// Put today's unsorted captures into one review batch on a chosen date.
export async function batchCapturesForReview(userId: string, db: PrismaClient, reviewDate: string | null, now = new Date()) {
  const settings = await loadDaySettings(userId, db);
  const base = reviewDate && /^\d{4}-\d{2}-\d{2}$/.test(reviewDate) ? new Date(`${reviewDate}T12:00:00Z`) : addZonedDays(now, 1, settings.timeZone);
  const reviewAt = atLocalMinutes(base, settings.workdayStartMin, settings.timeZone);
  if (reviewAt <= now) return { ok: false as const, count: 0, reviewAt: null, error: "Pick a future date." };
  const dayStart = startOfZonedDay(now, settings.timeZone);
  const result = await db.executionTask.updateMany({
    where: { userId, needsJudgment: true, status: { notIn: ["DONE", "DROPPED"] }, createdAt: { gte: dayStart } },
    data: { followUpDate: reviewAt }
  });
  return { ok: true as const, count: result.count, reviewAt, error: null };
}

// Record that the day was closed (only when nothing unfinished remains).
export async function closeDay(userId: string, db: PrismaClient, model: ShutdownModel, now = new Date()) {
  if (!model.canClose) return { ok: false as const, error: "Give each unfinished commitment an outcome or a new date first." };
  const settings = await loadDaySettings(userId, db);
  const date = startOfZonedDay(now, settings.timeZone);
  await db.dailyPlan.upsert({
    where: { userId_date: { userId, date } },
    update: { shutdownNote: `Closed ${localDateKey(now, settings.timeZone)}` },
    create: { userId, date, shutdownNote: `Closed ${localDateKey(now, settings.timeZone)}` }
  });
  return { ok: true as const, error: null };
}
