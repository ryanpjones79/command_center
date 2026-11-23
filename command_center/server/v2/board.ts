import type { PrismaClient } from "@prisma/client";
import { addZonedDays, startOfZonedDay } from "@/lib/v2/zoned-time";
import type { QuickTarget } from "@/lib/v2/quick-add";
import { dayTaskSelect, toDayTask, workHref, type DayTask } from "@/server/v2/day";
import { materializeRoutines } from "@/server/v2/routines";
import { loadDaySettings, type CalendarLoader } from "@/server/v2/schedule-service";
import { SYNC_SOURCE, writeEnabled } from "@/server/v2/calendar-sync";
import { loadHabits, type Habit } from "@/server/v2/habits";

// Read model for the Plan screen: every open task grouped by area and project (feed items included, labelled
// by source), plus the calendar for the days shown (Google meetings and RyanOS blocks).

export type BoardTask = {
  id: string;
  title: string;
  areaSlug: string;
  areaName: string;
  projectId: string | null;
  projectName: string | null;
  source: string | null; // EBAY, RYKAS, CASINO_AP, ... ; null for Ryan's own
  href: string;
  external: boolean;
  dueDate: string | null;
  expiresAt: string | null;
  start: string | null;
  end: string | null;
  minutes: number;
  priority: string;
  waitingOn: string | null;
  status: string;
  isProtected: boolean;
  urgent: boolean;
};

export type BoardProject = { id: string; name: string; tasks: BoardTask[] };
export type BoardArea = { id: string; slug: string; name: string; projects: BoardProject[]; loose: BoardTask[] };
export type BoardMeeting = { title: string; start: string; end: string };

export type Board = {
  now: string;
  timeZone: string;
  workdayStartMin: number;
  workdayEndMin: number;
  dayEndMin: number;
  days: string[]; // start of each day shown (UTC instants of local midnight)
  soonDays: string[]; // today and tomorrow, for the phone's Schedule choices
  areas: BoardArea[];
  waiting: BoardTask[];
  blocks: BoardTask[];
  meetings: BoardMeeting[];
  calendarKnown: boolean;
  calendarSync: { enabled: boolean; ok: boolean; message: string | null };
  targets: QuickTarget[];
  habits: Habit[]; // today's daily habits (routines) with streaks
  routineTasks: BoardTask[]; // today's open routine copies, so a habit can be placed on the calendar
};

const AREA_ORDER = ["ebay", "rykas", "betting-models", "casino-ap", "work", "health", "golf", "family", "opportunities", "admin"];
const PRIORITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

function toBoardTask(task: DayTask & { priority: string; waitingOn: string | null }, now: Date): BoardTask {
  const deadline = [task.dueDate, task.expiresAt].filter((value): value is Date => value instanceof Date).sort((a, b) => a.getTime() - b.getTime())[0];
  return {
    id: task.id,
    title: task.title,
    areaSlug: task.domainSlug,
    areaName: task.domainName,
    projectId: task.projectId,
    projectName: task.projectName,
    source: task.sourceSystem && task.sourceSystem !== "ROUTINE" && task.sourceSystem !== "CAPTURE" ? task.sourceSystem : null,
    href: workHref(task),
    external: Boolean(task.sourceUrl),
    dueDate: task.dueDate?.toISOString() ?? null,
    expiresAt: task.expiresAt?.toISOString() ?? null,
    start: task.scheduledStart?.toISOString() ?? null,
    end: task.scheduledEnd?.toISOString() ?? null,
    minutes: task.minutes,
    priority: task.priority,
    waitingOn: task.waitingOn,
    status: task.status,
    isProtected: task.isProtected,
    urgent: task.priority === "CRITICAL" || Boolean(deadline && deadline.getTime() - now.getTime() < 2 * 86_400_000)
  };
}

// Projects and areas a quick-add line can be filed under (for the "Goes to" preview and the project picker).
export async function loadQuickTargets(userId: string, db: PrismaClient): Promise<QuickTarget[]> {
  const [domains, projects] = await Promise.all([
    db.executionDomain.findMany({ where: { userId }, select: { id: true, slug: true, name: true }, orderBy: { name: "asc" } }),
    db.executionProject.findMany({ where: { userId, activeStatus: { in: ["ACTIVE_NOW", "ACTIVE_LATER"] }, closedAt: null }, select: { id: true, name: true, domainId: true }, orderBy: { name: "asc" } })
  ]);
  return [
    ...projects.map((project) => ({ id: project.id, name: project.name, kind: "PROJECT" as const, domainId: project.domainId })),
    ...domains.map((domain) => ({ id: domain.id, name: domain.name, slug: domain.slug, kind: "AREA" as const, domainId: domain.id }))
  ];
}

// Most urgent first: deadline soon, then priority, then deadline, then oldest.
export function sortTasks(tasks: BoardTask[]) {
  const deadline = (task: BoardTask) => Math.min(...[task.dueDate, task.expiresAt].map((value) => (value ? Date.parse(value) : Infinity)));
  return [...tasks].sort((a, b) => Number(b.urgent) - Number(a.urgent) || (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2) || deadline(a) - deadline(b));
}

export async function loadBoard(
  userId: string,
  db: PrismaClient,
  calendarLoader: CalendarLoader,
  options: { now?: Date; anchor?: Date; dayCount?: number } = {}
): Promise<Board> {
  const now = options.now ?? new Date();
  await materializeRoutines(userId, db, now).catch(() => undefined);
  const settings = await loadDaySettings(userId, db);
  const tz = settings.timeZone;
  const dayCount = Math.min(7, Math.max(1, options.dayCount ?? 1));
  const first = startOfZonedDay(options.anchor ?? now, tz);
  const days = Array.from({ length: dayCount }, (_, index) => addZonedDays(first, index, tz));
  const rangeEnd = addZonedDays(first, dayCount, tz);
  // Meetings and blocks also cover today and tomorrow, so the phone's "Schedule" choices know what's busy
  // even when another day is on screen. The grid only draws the days shown.
  const today = startOfZonedDay(now, tz);
  const busyFrom = new Date(Math.min(first.getTime(), today.getTime()));
  const busyTo = new Date(Math.max(rangeEnd.getTime(), addZonedDays(today, 2, tz).getTime()));

  let meetings: BoardMeeting[] = [];
  let calendarKnown = true;
  try {
    meetings = (await calendarLoader(busyFrom, busyTo)).map((item) => ({ title: item.title, start: item.start.toISOString(), end: item.end.toISOString() }));
  } catch {
    calendarKnown = false;
  }

  const [rows, domains, projects, sync] = await Promise.all([
    db.executionTask.findMany({
      where: { userId, status: { notIn: ["DONE", "DROPPED"] }, needsJudgment: false },
      select: { ...dayTaskSelect, priority: true, waitingOn: true },
      take: 3000
    }),
    db.executionDomain.findMany({ where: { userId }, select: { id: true, slug: true, name: true } }),
    db.executionProject.findMany({
      where: { userId, activeStatus: { in: ["ACTIVE_NOW", "ACTIVE_LATER"] }, closedAt: null },
      select: { id: true, name: true, domainId: true },
      orderBy: { name: "asc" }
    }),
    db.sourceSync.findUnique({ where: { userId_sourceSystem: { userId, sourceSystem: SYNC_SOURCE } } })
  ]);

  const tasks = rows.map((row) => toBoardTask({ ...toDayTask(row), priority: row.priority, waitingOn: row.waitingOn }, now));
  // Routine day copies live in the Daily habits strip (and on the calendar once placed), not in the lists.
  const isRoutine = (index: number) => rows[index].sourceSystem === "ROUTINE";
  const listed = tasks.filter((_, index) => !isRoutine(index));
  const routineTasks = tasks.filter((_, index) => isRoutine(index));
  const isWaiting = (task: BoardTask) => task.status === "WAITING" || Boolean(task.waitingOn);
  const blocks = tasks.filter((task) => task.start && task.end && Date.parse(task.start) < busyTo.getTime() && Date.parse(task.end) > busyFrom.getTime());

  const areas: BoardArea[] = domains
    .map((domain) => {
      const areaTasks = listed.filter((task) => task.areaSlug === domain.slug && !isWaiting(task));
      const areaProjects = projects
        .filter((project) => project.domainId === domain.id)
        .map((project) => ({ id: project.id, name: project.name, tasks: sortTasks(areaTasks.filter((task) => task.projectId === project.id)) }));
      const known = new Set(areaProjects.map((project) => project.id));
      // Tasks in a parked or closed project still show, under their project's name.
      for (const task of areaTasks) {
        if (task.projectId && !known.has(task.projectId)) {
          known.add(task.projectId);
          areaProjects.push({ id: task.projectId, name: task.projectName ?? "Project", tasks: sortTasks(areaTasks.filter((other) => other.projectId === task.projectId)) });
        }
      }
      return { id: domain.id, slug: domain.slug, name: domain.name, projects: areaProjects, loose: sortTasks(areaTasks.filter((task) => !task.projectId)) };
    })
    .filter((area) => area.projects.length > 0 || area.loose.length > 0)
    .sort((a, b) => {
      const rank = (slug: string) => (AREA_ORDER.indexOf(slug) + 1 || 99);
      return rank(a.slug) - rank(b.slug) || a.name.localeCompare(b.name);
    });

  const targets: QuickTarget[] = [
    ...projects.map((project) => ({ id: project.id, name: project.name, kind: "PROJECT" as const, domainId: project.domainId })),
    ...domains.map((domain) => ({ id: domain.id, name: domain.name, slug: domain.slug, kind: "AREA" as const, domainId: domain.id }))
  ];

  return {
    now: now.toISOString(),
    timeZone: tz,
    workdayStartMin: settings.workdayStartMin,
    workdayEndMin: settings.workdayEndMin,
    dayEndMin: settings.dayEndMin,
    days: days.map((day) => day.toISOString()),
    soonDays: [today, addZonedDays(today, 1, tz)].map((day) => day.toISOString()),
    areas,
    waiting: sortTasks(listed.filter(isWaiting)),
    blocks,
    meetings,
    calendarKnown,
    calendarSync: { enabled: writeEnabled(), ok: !sync || sync.status !== "FAILING", message: sync?.status === "FAILING" ? sync.lastError : null },
    targets,
    habits: await loadHabits(userId, db, now),
    routineTasks
  };
}
