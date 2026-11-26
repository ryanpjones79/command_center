import type { PrismaClient } from "@prisma/client";
import { addZonedDays, startOfZonedDay } from "@/lib/v2/zoned-time";
import type { QuickTarget } from "@/lib/v2/quick-add";
import { dayTaskSelect, toDayTask, workHref, type DayTask } from "@/server/v2/day";
import { materializeRoutines } from "@/server/v2/routines";
import { loadDaySettings, type CalendarLoader } from "@/server/v2/schedule-service";
import { SYNC_SOURCE, writeEnabled } from "@/server/v2/calendar-sync";
import { loadHabits, type Habit } from "@/server/v2/habits";
import { resolveTools, type ToolLink } from "@/lib/v2/tools";
import { agentDoing, readiness, safeLink, type Readiness } from "@/lib/v2/readiness";
import { optionalEventsBlock, protectionLines, workWindows, type ProtectionLine } from "@/lib/v2/availability";
import { startOfZonedWeek } from "@/lib/v2/zoned-time";
import { HANDOFF_SYSTEMS } from "@/lib/v2/source-events";
import { INBOX_STATUS } from "@/server/inbox/inbox";

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
  committed?: boolean; // whenBucket TODAY: Ryan committed to it for today
  ready: Readiness; // "preparing": an agent is still working on it; "ready": Ryan's to do
  doing: string | null; // what the agent is preparing, when ready === "preparing"
  links: BoardLink[]; // drafts and sources attached to the task
  weekly: boolean; // its project is one Ryan chose to advance this week
  workContext: string | null;
  details: string | null; // the full imported note/report, kept for the details view
};

export type BoardLink = { title: string; url: string; kind: "draft" | "source" | "link" };

export type BoardProject = { id: string; name: string; tasks: BoardTask[] };
export type BoardArea = { id: string; slug: string; name: string; projects: BoardProject[]; loose: BoardTask[] };
export type BoardMeeting = { title: string; start: string; end: string; optional?: boolean };
// A project on the Plan shelf. RyanOS has no "pin" field, so the shelf is derived from existing data: projects
// Ryan put in his weekly top 3 or gave time this week, then the ones holding his most urgent ready actions.
export type ShelfProject = { id: string; name: string; areaSlug: string; areaName: string; ready: number; scheduled: number; workOnly: boolean; focus: boolean };

export type Board = {
  tools: ToolLink[]; // where each app's check-ins are handled
  now: string;
  timeZone: string;
  workdayStartMin: number;
  workdayEndMin: number;
  dayEndMin: number;
  days: string[]; // start of each day shown (UTC instants of local midnight)
  soonDays: string[]; // today and tomorrow, for the phone's Schedule choices
  areas: BoardArea[];
  waiting: BoardTask[];
  preparing: BoardTask[]; // an agent is preparing these; not bookable until ready
  blocks: BoardTask[];
  meetings: BoardMeeting[];
  calendarKnown: boolean;
  // What "Bookable" accounts for: protections, sources and their status, and the work windows on the days shown.
  availability: { protections: ProtectionLine[]; sources: { label: string; ok: boolean; detail: string }[]; work: { start: string; end: string }[]; optionalBlocks: boolean };
  calendarSync: { enabled: boolean; ok: boolean; message: string | null };
  targets: QuickTarget[];
  habits: Habit[]; // today's daily habits (routines) with streaks
  routineTasks: BoardTask[]; // today's open routine copies, so a habit can be placed on the calendar
  shelf: ShelfProject[]; // the Plan project shelf, most important first
  decisions: { count: number; first: string | null }; // Inbox items waiting for Ryan's judgment
};

const SHELF_MAX = 8;

// The shelf: active projects with a ready action Ryan can book, plus his weekly top-3 projects. Order: top 3,
// then projects given time this week, then the one holding the most urgent ready action, then the most ready.
export function shelfProjects(
  projects: { id: string; name: string; domainId: string; weeklyFocus?: string | null; activeStatus?: string | null }[],
  domains: { id: string; slug: string; name: string }[],
  tasks: BoardTask[],
  weekly: Set<string>
): ShelfProject[] {
  const ranked = sortTasks(tasks.filter((task) => task.projectId && !task.source && task.ready === "ready" && !task.start && task.status !== "WAITING" && !task.waitingOn));
  const firstIndex = new Map<string, number>();
  ranked.forEach((task, index) => { if (!firstIndex.has(task.projectId as string)) firstIndex.set(task.projectId as string, index); });
  return projects
    .map((project) => {
      const domain = domains.find((item) => item.id === project.domainId);
      const own = tasks.filter((task) => task.projectId === project.id && !task.source);
      return {
        project,
        row: {
          id: project.id,
          name: project.name,
          areaSlug: domain?.slug ?? "",
          areaName: domain?.name ?? "",
          ready: ranked.filter((task) => task.projectId === project.id).length,
          scheduled: own.filter((task) => task.start).length,
          workOnly: domain?.slug === "work",
          focus: project.weeklyFocus === "TOP_3"
        } satisfies ShelfProject
      };
    })
    .filter(({ project, row }) => row.ready > 0 || (row.focus && project.activeStatus !== "PARKED"))
    .sort((a, b) =>
      Number(b.row.focus) - Number(a.row.focus) ||
      Number(weekly.has(b.row.id)) - Number(weekly.has(a.row.id)) ||
      (firstIndex.get(a.row.id) ?? Infinity) - (firstIndex.get(b.row.id) ?? Infinity) ||
      b.row.ready - a.row.ready ||
      a.row.name.localeCompare(b.row.name)
    )
    .slice(0, SHELF_MAX)
    .map(({ row }) => row);
}

const AREA_ORDER = ["ebay", "rykas", "betting-models", "casino-ap", "work", "health", "golf", "family", "opportunities", "admin"];
const PRIORITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

type LinkRow = { title: string; url: string | null; provider: string };

function toLinks(rows: LinkRow[]): BoardLink[] {
  return rows
    .map((row) => ({ title: row.title, url: safeLink(row.url), kind: row.provider === "draft" ? ("draft" as const) : row.provider === "source" ? ("source" as const) : ("link" as const) }))
    .filter((link): link is BoardLink => Boolean(link.url));
}

function toBoardTask(task: DayTask & { priority: string; waitingOn: string | null; references?: LinkRow[] }, now: Date, weeklyProjects: Set<string> = new Set()): BoardTask {
  const deadline = [task.dueDate, task.expiresAt].filter((value): value is Date => value instanceof Date).sort((a, b) => a.getTime() - b.getTime())[0];
  return {
    id: task.id,
    title: task.title,
    areaSlug: task.domainSlug,
    areaName: task.domainName,
    projectId: task.projectId,
    projectName: task.projectName,
    // Check-in source label. Handoffs (ChatGPT-prepared drafts) are Ryan's own to-dos, so they carry none.
    source: task.sourceSystem && task.sourceSystem !== "ROUTINE" && task.sourceSystem !== "CAPTURE" && !HANDOFF_SYSTEMS.has(task.sourceSystem) ? task.sourceSystem : null,
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
    urgent: task.priority === "CRITICAL" || Boolean(deadline && deadline.getTime() - now.getTime() < 2 * 86_400_000),
    committed: task.whenBucket === "TODAY",
    ready: readiness(task),
    doing: readiness(task) === "preparing" ? agentDoing(task.waitingOn) : null,
    links: toLinks(task.references ?? []),
    weekly: Boolean(task.projectId && weeklyProjects.has(task.projectId)),
    workContext: task.workContext,
    details: task.note
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
    meetings = (await calendarLoader(busyFrom, busyTo)).map((item) => ({ title: item.title, start: item.start.toISOString(), end: item.end.toISOString(), ...(item.optional ? { optional: true } : {}) }));
  } catch {
    calendarKnown = false;
  }

  const [rows, domains, projects, sync, attention, judgment, ideas] = await Promise.all([
    db.executionTask.findMany({
      where: { userId, status: { notIn: ["DONE", "DROPPED"] }, needsJudgment: false },
      select: { ...dayTaskSelect, priority: true, waitingOn: true, references: { select: { title: true, url: true, provider: true }, orderBy: { createdAt: "asc" }, take: 4 } },
      take: 3000
    }),
    db.executionDomain.findMany({ where: { userId }, select: { id: true, slug: true, name: true } }),
    db.executionProject.findMany({
      where: { userId, activeStatus: { in: ["ACTIVE_NOW", "ACTIVE_LATER"] }, closedAt: null },
      select: { id: true, name: true, domainId: true, weeklyFocus: true, activeStatus: true },
      orderBy: { name: "asc" }
    }),
    db.sourceSync.findUnique({ where: { userId_sourceSystem: { userId, sourceSystem: SYNC_SOURCE } } }),
    db.projectAttention.findMany({ where: { userId, weekOf: startOfZonedWeek(now, tz), plannedMinutes: { gt: 0 } }, select: { projectId: true } }),
    // Same rule as the Inbox badge (app/layout.tsx): open items needing a decision, follow-up date reached.
    db.executionTask.findMany({
      where: { userId, needsJudgment: true, status: { notIn: ["DONE", "DROPPED"] }, OR: [{ followUpDate: null }, { followUpDate: { lte: now } }] },
      select: { title: true },
      orderBy: { createdAt: "desc" },
      take: 200
    }),
    db.parkedIdea.count({ where: { userId, status: INBOX_STATUS } }).catch(() => 0)
  ]);
  const weeklyProjects = new Set(attention.map((row) => row.projectId));

  // Hidden until they matter again: snoozed (Tomorrow / Later / Review) and parked items, and expired offers.
  // Anything already on the calendar or waiting on someone stays visible.
  const visible = rows.filter((row) => {
    if (row.scheduledStart) return true;
    if (row.expiresAt && row.expiresAt <= now) return false;
    if (row.status === "WAITING") return true;
    if (row.whenBucket === "PARKING_LOT") return false;
    return !(row.followUpDate && row.followUpDate > now);
  });
  const tasks = visible.map((row) => toBoardTask({ ...toDayTask(row), priority: row.priority, waitingOn: row.waitingOn, references: row.references }, now, weeklyProjects));
  // Routine day copies live in the Daily habits strip (and on the calendar once placed), not in the lists.
  const isRoutine = (index: number) => visible[index].sourceSystem === "ROUTINE";
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
    tools: resolveTools(),
    now: now.toISOString(),
    timeZone: tz,
    workdayStartMin: settings.workdayStartMin,
    workdayEndMin: settings.workdayEndMin,
    dayEndMin: settings.dayEndMin,
    days: days.map((day) => day.toISOString()),
    soonDays: [today, addZonedDays(today, 1, tz)].map((day) => day.toISOString()),
    areas,
    waiting: sortTasks(listed.filter((task) => isWaiting(task) && task.ready !== "preparing")),
    preparing: sortTasks(listed.filter((task) => task.ready === "preparing")),
    blocks,
    meetings,
    calendarKnown,
    availability: {
      protections: protectionLines(settings),
      sources: [
        { label: "Google Calendar", ok: calendarKnown, detail: calendarKnown ? `read ${now.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" })}; timed events count, all-day events don't` : "couldn't be read, so free time below is unconfirmed" },
        { label: "RyanOS blocks", ok: true, detail: "your booked tasks and routines" },
        ...(writeEnabled() ? [{ label: "Google sync", ok: !sync || sync.status !== "FAILING", detail: sync?.status === "FAILING" ? "failing; blocks may be missing from Google" : `OK${sync?.lastSuccessAt ? ` as of ${sync.lastSuccessAt.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" })}` : ""}` }] : [])
      ],
      work: workWindows(busyFrom, busyTo, settings).map((window) => ({ start: new Date(window.start).toISOString(), end: new Date(window.end).toISOString() })),
      optionalBlocks: optionalEventsBlock()
    },
    calendarSync: { enabled: writeEnabled(), ok: !sync || sync.status !== "FAILING", message: sync?.status === "FAILING" ? sync.lastError : null },
    targets,
    habits: await loadHabits(userId, db, now),
    routineTasks,
    shelf: shelfProjects(projects, domains, listed, weeklyProjects),
    decisions: { count: judgment.length + ideas, first: judgment[0]?.title ?? null }
  };
}
