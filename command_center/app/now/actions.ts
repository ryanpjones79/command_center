"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { markExecutionTaskStatusAction } from "@/app/execution-actions";
import { OWNER_ACTION_AREAS } from "@/lib/owner-actions";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { ensureExecutionSetup } from "@/server/execution-service";
import { getCalendarDayRange, getCalendarEventsForDate } from "@/server/google-calendar-service";
import {
  appendSkipNote,
  AREA_DOMAIN_SLUG,
  findOpenSlot,
  latestEndForDay,
  SKIP_CHOICES,
  type Interval
} from "@/server/now/planning";

type ActionResult = { ok: boolean; message: string };

function revalidateNowSurfaces() {
  revalidatePath("/now");
  revalidatePath("/time-blocks");
  revalidatePath("/tasks");
}

async function busyToday(userId: string, now: Date, excludeTaskId?: string): Promise<{ busy: Interval[]; latestEnd: Date }> {
  const day = getCalendarDayRange(now);
  const [tasks, events] = await Promise.all([
    prisma.executionTask.findMany({
      where: {
        userId,
        id: excludeTaskId ? { not: excludeTaskId } : undefined,
        status: { notIn: ["DONE", "DROPPED"] },
        scheduledStart: { lt: day.end },
        scheduledEnd: { gt: day.start }
      },
      select: { scheduledStart: true, scheduledEnd: true }
    }),
    getCalendarEventsForDate(now).catch(() => [])
  ]);
  const busy: Interval[] = [
    ...tasks.flatMap((task) => (task.scheduledStart && task.scheduledEnd ? [{ start: task.scheduledStart, end: task.scheduledEnd }] : [])),
    ...events.filter((event) => !event.isAllDay).map((event) => ({ start: event.start, end: event.end }))
  ];
  return { busy, latestEnd: latestEndForDay(day.end) };
}

function clock(value: Date) {
  return value.toLocaleTimeString("en-US", {
    timeZone: process.env.DAILY_BRIEF_TIMEZONE || "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit"
  });
}

function durationBucket(minutes: number) {
  if (minutes <= 30) return "UNDER_30_MIN" as const;
  if (minutes <= 60) return "THIRTY_TO_SIXTY_MIN" as const;
  if (minutes <= 120) return "ONE_TO_TWO_HOURS" as const;
  return "TWO_HOURS_PLUS" as const;
}

const cardSchema = z.object({
  cardId: z.string().min(1).max(300),
  area: z.enum(OWNER_ACTION_AREAS),
  title: z.string().min(1).max(200),
  whyNow: z.string().max(400),
  minutes: z.number().int().min(5).max(240).nullable(),
  href: z.string().max(1000),
  taskId: z.string().max(100).optional()
});

// "Schedule it": put a Needs-you card on today's grid in the next open slot.
// Existing RyanOS tasks move; other cards become one task each (deduped by
// card id), linked back to where the decision is made.
export async function scheduleOwnerCardAction(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = cardSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "That card could not be scheduled." };
  const card = parsed.data;
  const minutes = Math.max(15, card.minutes ?? 15);
  const now = new Date();

  let taskId = card.taskId ?? null;
  if (taskId) {
    const owned = await prisma.executionTask.findFirst({ where: { id: taskId, userId: user.id }, select: { id: true } });
    if (!owned) return { ok: false, message: "Task not found." };
  } else {
    const source = `card:${card.cardId}`;
    const existing = await prisma.executionTask.findFirst({
      where: { userId: user.id, source, status: { notIn: ["DONE", "DROPPED"] } },
      select: { id: true }
    });
    taskId = existing?.id ?? null;
    if (!taskId) {
      await ensureExecutionSetup(user.id);
      const domain = await prisma.executionDomain.findFirst({
        where: { userId: user.id, slug: AREA_DOMAIN_SLUG[card.area] },
        select: { id: true }
      });
      if (!domain) return { ok: false, message: "That area's domain is missing in Tasks." };
      const created = await prisma.executionTask.create({
        data: {
          userId: user.id,
          domainId: domain.id,
          title: card.title,
          type: "ACTION",
          estimatedDuration: durationBucket(minutes),
          status: "NOT_STARTED",
          priority: "HIGH",
          whenBucket: "TODAY",
          note: [card.whyNow, card.href ? `Open: ${card.href}` : ""].filter(Boolean).join("\n"),
          source
        },
        select: { id: true }
      });
      taskId = created.id;
    }
  }

  const { busy, latestEnd } = await busyToday(user.id, now, taskId);
  const slot = findOpenSlot({ from: now, minutes, busy, latestEnd });
  if (!slot) {
    await prisma.executionTask.update({ where: { id: taskId }, data: { whenBucket: "TODAY" } });
    revalidateNowSurfaces();
    return { ok: true, message: "No open slot left today. Added to today's queue." };
  }
  await prisma.executionTask.update({
    where: { id: taskId },
    data: { scheduledStart: slot.start, scheduledEnd: slot.end, whenBucket: "TODAY" }
  });
  revalidateNowSurfaces();
  return { ok: true, message: `Scheduled at ${clock(slot.start)}.` };
}

export async function nowDoneAction(taskId: string): Promise<ActionResult> {
  await markExecutionTaskStatusAction(taskId, "DONE");
  revalidateNowSurfaces();
  return { ok: true, message: "Done." };
}

export async function nowExtendAction(taskId: string): Promise<ActionResult> {
  const user = await requireUser();
  const task = await prisma.executionTask.findFirst({ where: { id: taskId, userId: user.id }, select: { id: true, scheduledEnd: true } });
  if (!task?.scheduledEnd) return { ok: false, message: "Task not found." };
  const base = Math.max(task.scheduledEnd.getTime(), Date.now());
  await prisma.executionTask.update({ where: { id: task.id }, data: { scheduledEnd: new Date(base + 15 * 60_000) } });
  revalidateNowSurfaces();
  return { ok: true, message: "15 more minutes." };
}

// Skipping never silently rolls over: every skip picks where the task goes
// and is recorded on the task, so repeated skips surface on the Now screen.
export async function nowSkipAction(taskId: string, choice: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!(SKIP_CHOICES as readonly string[]).includes(choice)) return { ok: false, message: "Pick where it goes." };
  const task = await prisma.executionTask.findFirst({ where: { id: taskId, userId: user.id }, select: { id: true, note: true } });
  if (!task) return { ok: false, message: "Task not found." };
  const day = getCalendarDayRange(new Date());
  const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: day.timeZone }).format(new Date());
  const note = appendSkipNote(task.note, dateKey, choice as (typeof SKIP_CHOICES)[number]);
  const base = { scheduledStart: null, scheduledEnd: null, note };
  const data =
    choice === "TOMORROW"
      ? { ...base, whenBucket: "THIS_WEEK" as const, dueDate: new Date(day.end.getTime() + 12 * 60 * 60_000) }
      : choice === "THIS_WEEK"
        ? { ...base, whenBucket: "THIS_WEEK" as const }
        : choice === "PARK"
          ? { ...base, whenBucket: "PARKING_LOT" as const }
          : { ...base, status: "DROPPED" as const };
  await prisma.executionTask.update({ where: { id: task.id }, data });
  revalidateNowSurfaces();
  return { ok: true, message: choice === "DROP" ? "Dropped." : choice === "PARK" ? "Parked." : choice === "TOMORROW" ? "Moved to tomorrow." : "Moved to this week." };
}
