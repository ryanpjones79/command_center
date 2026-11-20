import type { PrismaClient } from "@prisma/client";
import { deriveCoverage, type Coverage } from "@/lib/v2/coverage";
import { addZonedDays, startOfZonedDay, zonedDayRange } from "@/lib/v2/zoned-time";
import { getCalendarEventsForDate } from "@/server/google-calendar-service";
import { loadDaySettings, taskMinutes, type CalendarBusy, type CalendarLoader } from "@/server/v2/schedule-service";
import type { DaySettings } from "@/lib/v2/scheduler";

// One read model for Now, Today, Projects and Inbox, built from the same
// persistent tasks so an item looks the same everywhere.

export const PROTECTED_SLUGS = new Set(["family", "kids", "health"]);

// Read-only calendar access; a failure is "unknown", not "free".
export function googleCalendarLoader(): CalendarLoader {
  return async (from, to) => {
    const busy: CalendarBusy[] = [];
    for (let day = new Date(from); day < to; day = new Date(day.getTime() + 24 * 60 * 60_000)) {
      const events = await getCalendarEventsForDate(day);
      for (const event of events) {
        if (!event.isAllDay) busy.push({ start: event.start, end: event.end, title: event.summary });
      }
    }
    return busy;
  };
}

export type DayTask = {
  id: string;
  title: string;
  status: string;
  domainSlug: string;
  domainName: string;
  projectId: string | null;
  projectName: string | null;
  sourceSystem: string | null;
  sourceKind: string | null;
  sourceUrl: string | null;
  sourceState: string | null;
  sourceCheckedAt: Date | null;
  doneWhen: string | null;
  note: string | null;
  whenBucket: string;
  dueDate: Date | null;
  expiresAt: Date | null;
  followUpDate: Date | null;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  minutes: number;
  workContext: string | null;
  postponeCount: number;
  needsJudgment: boolean;
  isBlocked: boolean;
  captureKind: string | null;
  attachmentId: string | null;
  isProtected: boolean;
  createdAt: Date;
};

export type DayModel = {
  now: Date;
  settings: DaySettings;
  day: { start: Date; end: Date };
  meetings: CalendarBusy[];
  calendarKnown: boolean;
  blocks: DayTask[]; // scheduled today, open
  current: DayTask | null;
  currentMeeting: CalendarBusy | null;
  next: { start: Date; title: string; kind: "TASK" | "MEETING" } | null;
  endedOpen: DayTask[]; // ended blocks without an outcome
  expired: DayTask[]; // expired opportunities still open
  stillWorthIt: DayTask[]; // postponed 3+ times
  judgment: DayTask[]; // needs Ryan's judgment (inbox)
  judgmentDue: DayTask[]; // judgment items whose review time has come
  openIncidents: DayTask[]; // source incidents still open (not yet inspected)
  dueForReview: DayTask[]; // review date reached
  queue: DayTask[]; // accepted for today/this week, not scheduled
  sourceProblems: { sourceSystem: string; lastSuccessAt: Date | null }[];
};

export function toDayTask(task: {
  id: string; title: string; status: string; projectId: string | null; sourceSystem: string | null; sourceKind: string | null;
  sourceUrl: string | null; sourceState: string | null; sourceCheckedAt: Date | null; doneWhen: string | null; note: string | null;
  whenBucket: string; dueDate: Date | null; expiresAt: Date | null; followUpDate: Date | null; scheduledStart: Date | null;
  scheduledEnd: Date | null; remainingMinutes: number | null; estimatedDuration: string | null; workContext: string | null;
  postponeCount: number; needsJudgment: boolean; isBlocked: boolean; captureKind: string | null; createdAt: Date;
  domain: { slug: string; name: string }; project: { name: string } | null; attachments: { id: string }[];
}): DayTask {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    domainSlug: task.domain.slug,
    domainName: task.domain.name,
    projectId: task.projectId,
    projectName: task.project?.name ?? null,
    sourceSystem: task.sourceSystem,
    sourceKind: task.sourceKind,
    sourceUrl: task.sourceUrl,
    sourceState: task.sourceState,
    sourceCheckedAt: task.sourceCheckedAt,
    doneWhen: task.doneWhen,
    note: task.note,
    whenBucket: task.whenBucket,
    dueDate: task.dueDate,
    expiresAt: task.expiresAt,
    followUpDate: task.followUpDate,
    scheduledStart: task.scheduledStart,
    scheduledEnd: task.scheduledEnd,
    minutes: taskMinutes(task),
    workContext: task.workContext,
    postponeCount: task.postponeCount,
    needsJudgment: task.needsJudgment,
    isBlocked: task.isBlocked,
    captureKind: task.captureKind,
    attachmentId: task.attachments[0]?.id ?? null,
    isProtected: PROTECTED_SLUGS.has(task.domain.slug),
    createdAt: task.createdAt
  };
}

export const dayTaskSelect = {
  id: true, title: true, status: true, projectId: true, sourceSystem: true, sourceKind: true, sourceUrl: true, sourceState: true,
  sourceCheckedAt: true, doneWhen: true, note: true, whenBucket: true, dueDate: true, expiresAt: true, followUpDate: true,
  scheduledStart: true, scheduledEnd: true, remainingMinutes: true, estimatedDuration: true, workContext: true, postponeCount: true,
  needsJudgment: true, isBlocked: true, captureKind: true, createdAt: true,
  domain: { select: { slug: true, name: true } }, project: { select: { name: true } }, attachments: { select: { id: true }, take: 1 }
} as const;

// Where to do the work: the exact source record when known.
export function workHref(task: Pick<DayTask, "id" | "sourceUrl">) {
  return task.sourceUrl ?? `/tasks?taskId=${encodeURIComponent(task.id)}`;
}

export async function loadDay(userId: string, db: PrismaClient, calendarLoader: CalendarLoader, now = new Date()): Promise<DayModel> {
  const settings = await loadDaySettings(userId, db);
  const day = zonedDayRange(now, settings.timeZone);
  let meetings: CalendarBusy[] = [];
  let calendarKnown = true;
  try {
    meetings = await calendarLoader(day.start, day.end);
  } catch {
    calendarKnown = false;
  }

  const [open, syncs] = await Promise.all([
    db.executionTask.findMany({ where: { userId, status: { notIn: ["DONE", "DROPPED"] } }, select: dayTaskSelect, take: 2000 }),
    db.sourceSync.findMany({ where: { userId, status: "FAILING" }, select: { sourceSystem: true, lastSuccessAt: true } })
  ]);
  const tasks = open.map(toDayTask);
  const blocks = tasks
    .filter((task) => task.scheduledStart && task.scheduledEnd && task.scheduledStart < day.end && task.scheduledEnd > day.start)
    .sort((a, b) => (a.scheduledStart as Date).getTime() - (b.scheduledStart as Date).getTime());
  const current = blocks.find((task) => (task.scheduledStart as Date) <= now && (task.scheduledEnd as Date) > now) ?? null;
  const currentMeeting = meetings.find((meeting) => meeting.start <= now && meeting.end > now) ?? null;
  const nextTask = blocks.find((task) => (task.scheduledStart as Date) > now);
  const nextMeeting = meetings.filter((meeting) => meeting.start > now).sort((a, b) => a.start.getTime() - b.start.getTime())[0];
  const next =
    nextTask && (!nextMeeting || (nextTask.scheduledStart as Date) <= nextMeeting.start)
      ? { start: nextTask.scheduledStart as Date, title: nextTask.title, kind: "TASK" as const }
      : nextMeeting
        ? { start: nextMeeting.start, title: nextMeeting.title, kind: "MEETING" as const }
        : null;

  const endedOpen = tasks
    .filter((task) => task.scheduledEnd && task.scheduledEnd <= now && task.status !== "WAITING")
    .sort((a, b) => (b.scheduledEnd as Date).getTime() - (a.scheduledEnd as Date).getTime());
  const expired = tasks.filter((task) => task.expiresAt && task.expiresAt <= now);
  const stillWorthIt = tasks.filter((task) => task.postponeCount >= 3 && !task.scheduledStart);
  const judgment = tasks.filter((task) => task.needsJudgment).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const judgmentDue = judgment.filter((task) => !task.followUpDate || task.followUpDate <= now);
  const openIncidents = tasks.filter((task) => task.sourceKind === "INCIDENT" && task.sourceState === "OPEN" && task.status !== "WAITING");
  const dueForReview = tasks.filter((task) => !task.needsJudgment && task.followUpDate && task.followUpDate <= now && !task.scheduledStart);
  const queue = tasks.filter(
    (task) => !task.scheduledStart && !task.needsJudgment && !task.isBlocked && task.status !== "WAITING" && !(task.expiresAt && task.expiresAt <= now) &&
      (task.whenBucket === "TODAY" || (task.dueDate && task.dueDate < addZonedDays(startOfZonedDay(now, settings.timeZone), 2, settings.timeZone)))
  );

  return {
    now,
    settings,
    day,
    meetings,
    calendarKnown,
    blocks,
    current,
    currentMeeting,
    next,
    endedOpen,
    expired,
    stillWorthIt,
    judgment,
    judgmentDue,
    openIncidents,
    dueForReview,
    queue,
    sourceProblems: syncs
  };
}

// Best single thing to do in free time that fits before the next boundary.
// Returning null (keep the buffer) is a valid answer.
export function recommendNow(model: DayModel): DayTask | null {
  const freeUntil = model.next?.start ?? new Date(model.day.start.getTime() + model.settings.dayEndMin * 60_000);
  const freeMinutes = Math.floor((freeUntil.getTime() - model.now.getTime()) / 60_000);
  if (freeMinutes < 10) return null;
  const score = (task: DayTask) => {
    const deadline = [task.dueDate, task.expiresAt].filter((value): value is Date => value instanceof Date).sort((a, b) => a.getTime() - b.getTime())[0];
    return (deadline ? deadline.getTime() : Number.MAX_SAFE_INTEGER) - (task.whenBucket === "TODAY" ? 86_400_000 : 0);
  };
  return model.queue.filter((task) => task.minutes <= freeMinutes).sort((a, b) => score(a) - score(b))[0] ?? null;
}

export async function loadProjectCoverage(userId: string, db: PrismaClient, now = new Date()) {
  const projects = await db.executionProject.findMany({
    // Closed projects stay listed while they still hold open obligations.
    where: { userId, OR: [{ closedAt: null }, { tasks: { some: { status: { notIn: ["DONE", "DROPPED"] } } } }] },
    select: {
      id: true, name: true, desiredOutcome: true, activeStatus: true, weeklyFocus: true, monitoring: true, closedAt: true,
      sourceStatus: true, sourceSystem: true, sourceUrl: true, domain: { select: { name: true, slug: true } },
      tasks: {
        select: {
          id: true, title: true, status: true, isBlocked: true, scheduledStart: true, followUpDate: true, dueDate: true,
          expiresAt: true, completedAt: true, sourceVerifiedAt: true, createdAt: true, remainingMinutes: true, estimatedDuration: true
        },
        orderBy: { createdAt: "asc" },
        take: 300
      }
    },
    orderBy: [{ weeklyFocus: "asc" }, { name: "asc" }]
  });
  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    desiredOutcome: project.desiredOutcome,
    weeklyFocus: project.weeklyFocus,
    domain: project.domain,
    sourceSystem: project.sourceSystem,
    sourceUrl: project.sourceUrl,
    coverage: deriveCoverage(project, project.tasks, now) as Coverage
  }));
}
