import type { Metadata } from "next";
import Link from "next/link";
import { WrapUp, type WrapTask } from "@/components/plan/wrap-up";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { addZonedDays, localClock, localDateKey, startOfZonedDay } from "@/lib/v2/zoned-time";
import { googleCalendarLoader } from "@/server/v2/day";
import { loadRoutineProgress } from "@/server/v2/routines";
import { loadDaySettings } from "@/server/v2/schedule-service";

export const metadata: Metadata = { title: "Evening wrap-up" };
export const dynamic = "force-dynamic";

const notRoutine = { OR: [{ sourceSystem: null }, { sourceSystem: { not: "ROUTINE" } }] };
const taskSelect = {
  id: true, title: true, dueDate: true, priority: true, scheduledStart: true, scheduledEnd: true, remainingMinutes: true,
  domain: { select: { slug: true, name: true } }, project: { select: { name: true } }
} as const;

// Evening wrap-up: close out today, pick tomorrow's must-dos, and let RyanOS draft tomorrow.
export default async function WrapUpPage() {
  const user = await requireUser();
  const now = new Date();
  const settings = await loadDaySettings(user.id, prisma);
  const tz = settings.timeZone;
  const today = startOfZonedDay(now, tz);
  const tomorrow = addZonedDays(today, 1, tz);
  const dayAfter = addZonedDays(today, 2, tz);
  const open = { userId: user.id, status: { notIn: ["DONE", "DROPPED", "WAITING"] as ("DONE" | "DROPPED" | "WAITING")[] }, needsJudgment: false };

  const [unfinished, doneToday, candidates, booked, routines, progress, meetings] = await Promise.all([
    prisma.executionTask.findMany({
      where: {
        ...open,
        AND: [notRoutine, { OR: [{ scheduledStart: { gte: today, lt: tomorrow } }, { scheduledStart: null, OR: [{ whenBucket: "TODAY" }, { dueDate: { lt: tomorrow } }] }] }]
      },
      select: taskSelect,
      orderBy: [{ scheduledStart: "asc" }, { dueDate: "asc" }],
      take: 40
    }),
    prisma.executionTask.count({ where: { userId: user.id, status: "DONE", completedAt: { gte: today } } }),
    prisma.executionTask.findMany({
      where: { ...open, scheduledStart: null, AND: [notRoutine] },
      select: taskSelect,
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { priority: "desc" }, { createdAt: "asc" }],
      take: 40
    }),
    prisma.executionTask.findMany({
      where: { userId: user.id, status: { notIn: ["DONE", "DROPPED"] }, scheduledStart: { gte: tomorrow, lt: dayAfter } },
      select: { id: true, title: true, scheduledStart: true, scheduledEnd: true, sourceSystem: true },
      orderBy: { scheduledStart: "asc" }
    }),
    prisma.protectedRoutine.findMany({ where: { userId: user.id, active: true }, select: { id: true, title: true, domainSlug: true }, orderBy: { createdAt: "asc" } }),
    loadRoutineProgress(user.id, prisma, now),
    googleCalendarLoader()(tomorrow, dayAfter).then((rows) => ({ known: true, rows })).catch(() => ({ known: false, rows: [] }))
  ]);

  const view = (task: (typeof candidates)[number]): WrapTask => ({
    id: task.id,
    title: task.title,
    areaSlug: task.domain.slug,
    label: task.project?.name ?? task.domain.name,
    due: task.dueDate ? task.dueDate.toLocaleDateString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }) : null,
    overdue: Boolean(task.dueDate && task.dueDate < now),
    time: task.scheduledStart ? localClock(task.scheduledStart, tz) : null,
    minutes: task.remainingMinutes ?? 30,
    high: task.priority === "HIGH" || task.priority === "CRITICAL"
  });
  const unfinishedIds = new Set(unfinished.map((task) => task.id));
  const tomorrowLabel = tomorrow.toLocaleDateString("en-US", { timeZone: tz, weekday: "long", month: "short", day: "numeric" });
  const fixed = [
    ...meetings.rows.map((row) => ({ start: row.start, label: row.title, kind: "meeting" as const })),
    ...booked.map((row) => ({ start: row.scheduledStart as Date, label: row.title, kind: row.sourceSystem === "ROUTINE" ? ("routine" as const) : ("task" as const) }))
  ]
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .map((row) => ({ time: localClock(row.start, tz), label: row.label, kind: row.kind }));

  return (
    <div className="space-y-6">
      <header>
        <Link className="text-sm text-muted-foreground underline-offset-4 hover:underline" href="/plan">← Plan</Link>
        <p className="eyebrow mt-2">Evening wrap-up · 5 minutes</p>
        <h1 className="font-display mt-1 text-3xl font-medium tracking-tight sm:text-4xl">Close today, set up tomorrow</h1>
      </header>
      <WrapUp
        calendarKnown={meetings.known}
        candidates={candidates.filter((task) => !unfinishedIds.has(task.id)).map(view)}
        doneToday={doneToday}
        planHref={`/plan?date=${localDateKey(tomorrow, tz)}`}
        routines={routines.map((routine) => ({ title: routine.title, areaSlug: routine.domainSlug, done: progress.get(routine.id)?.done ?? 0, target: progress.get(routine.id)?.target ?? 0 }))}
        tomorrowFixed={fixed}
        tomorrowLabel={tomorrowLabel}
        unfinished={unfinished.map(view)}
      />
    </div>
  );
}
