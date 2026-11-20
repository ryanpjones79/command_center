import type { PrismaClient } from "@prisma/client";
import {
  capOwnerActions,
  OWNER_ACTION_AREA_LABELS,
  truncateText,
  type OwnerActionCard,
  type OwnerActionFeed
} from "@/lib/owner-actions";

// Task-backed area feeds for Today: Kids, Health, CCHCS and Casino AP.
//
// No new tables: these areas live in RyanOS's existing task system. A daily
// workout is a recurring Health task; kids' time is a recurring Family task;
// CCHCS work is a Work-domain task (the existing CCHCS daily block lives there;
// Pipeline/SignalCare blocks are excluded); Casino AP plays are tasks in the
// Casino/AP domain. "Checking in" is completing the task. The feed reads only
// and never creates or moves tasks.
//
// What counts as needing Ryan, in priority order:
//   1. overdue tasks in the area,
//   2. tasks due today that are not on today's grid yet,
//   3. nothing planned, scheduled or done today, for areas that need daily
//      time (Kids and Health every day, CCHCS on weekdays; Casino AP never
//      nags: it is opportunistic).

export type LifeArea = "KIDS" | "HEALTH" | "CCHCS" | "CASINO_AP";

type LifeAreaConfig = {
  slugs: string[];
  excludeBlockTypes: string[];
  daily: "every" | "weekdays" | "never";
  domainHint: string;
  nonePrompt: string;
};

export const LIFE_AREAS: Record<LifeArea, LifeAreaConfig> = {
  KIDS: {
    slugs: ["kids", "family"],
    excludeBlockTypes: [],
    daily: "every",
    domainHint: "Family or Kids",
    nonePrompt: "Add a recurring Family task (school run, one-on-one, bedtime) and block it first."
  },
  HEALTH: {
    slugs: ["health"],
    excludeBlockTypes: [],
    daily: "every",
    domainHint: "Health",
    nonePrompt: "Add recurring Health tasks (workout, protein target) and block the workout first."
  },
  CCHCS: {
    slugs: ["cchcs", "work"],
    excludeBlockTypes: ["pipeline"],
    daily: "weekdays",
    domainHint: "Work",
    nonePrompt: "Drag the CCHCS block onto the grid and name its one deliverable."
  },
  CASINO_AP: {
    slugs: ["casino-ap"],
    excludeBlockTypes: [],
    daily: "never",
    domainHint: "Casino/AP",
    nonePrompt: ""
  }
};

export const LIFE_AREA_ORDER: LifeArea[] = ["KIDS", "HEALTH", "CCHCS", "CASINO_AP"];

export type LifeTask = {
  id: string;
  title: string;
  domainSlug: string;
  domainId: string;
  blockType: string | null;
  whenBucket: string;
  dueDate: Date | null;
  scheduledStart: Date | null;
  pinToTodayUntilDone: boolean;
};

export type LifeDay = { start: Date; end: Date; timeZone: string };

function clock(value: Date, timeZone: string) {
  return value.toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
}

function isWeekday(day: LifeDay) {
  const midday = new Date(day.start.getTime() + 12 * 60 * 60 * 1000);
  const name = new Intl.DateTimeFormat("en-US", { timeZone: day.timeZone, weekday: "short" }).format(midday);
  return !["Sat", "Sun"].includes(name);
}

export function taskInArea(area: LifeArea, task: Pick<LifeTask, "domainSlug" | "blockType">) {
  const config = LIFE_AREAS[area];
  return (
    config.slugs.includes(task.domainSlug) &&
    !config.excludeBlockTypes.includes((task.blockType ?? "").toLowerCase())
  );
}

export function buildLifeFeed(
  area: LifeArea,
  input: {
    domainIds: string[];
    openTasks: LifeTask[];
    doneTodayCount: number;
    day: LifeDay;
  }
): OwnerActionFeed {
  const label = OWNER_ACTION_AREA_LABELS[area];
  const config = LIFE_AREAS[area];

  if (input.domainIds.length === 0) {
    return {
      area,
      status: "UNAVAILABLE",
      message: `Add a ${config.domainHint} domain in Tasks to track ${label} here.`,
      observedAt: null,
      cards: []
    };
  }

  const { start, end, timeZone } = input.day;
  const tasks = input.openTasks.filter((task) => taskInArea(area, task));
  const onGridToday = tasks.filter(
    (task) => task.scheduledStart && task.scheduledStart >= start && task.scheduledStart < end
  );
  const overdue = tasks.filter(
    (task) => task.dueDate && task.dueDate < start && !onGridToday.includes(task)
  );
  const dueTodayUnscheduled = tasks.filter(
    (task) =>
      !onGridToday.includes(task) &&
      !overdue.includes(task) &&
      ((task.dueDate && task.dueDate < end) || task.whenBucket === "TODAY" || task.pinToTodayUntilDone)
  );

  const prefix = area.toLowerCase();
  const cards: OwnerActionCard[] = [
    ...overdue.map((task): OwnerActionCard => ({
      id: `${prefix}:overdue:${task.id}`,
      area,
      kind: "FIX",
      title: truncateText(`Overdue: ${task.title}`, 110),
      whyNow: "Do it today or reschedule it on purpose.",
      minutes: 2,
      dueAt: task.dueDate?.toISOString() ?? null,
      href: `/tasks?taskId=${encodeURIComponent(task.id)}`,
      external: false,
      source: `${label} task`,
      taskId: task.id
    })),
    ...dueTodayUnscheduled.map((task): OwnerActionCard => ({
      id: `${prefix}:unscheduled:${task.id}`,
      area,
      kind: "FIX",
      title: truncateText(`Put on today's grid: ${task.title}`, 110),
      whyNow:
        area === "KIDS" || area === "HEALTH"
          ? `${label} blocks go on the grid before work does.`
          : "Due today and not on the grid yet.",
      minutes: 1,
      dueAt: task.dueDate?.toISOString() ?? null,
      href: `/tasks?taskId=${encodeURIComponent(task.id)}`,
      external: false,
      source: `${label} task`,
      taskId: task.id
    }))
  ];

  const needsDaily = config.daily === "every" || (config.daily === "weekdays" && isWeekday(input.day));
  const nothingToday = onGridToday.length === 0 && cards.length === 0 && input.doneTodayCount === 0;
  if (needsDaily && nothingToday) {
    cards.push({
      id: `${prefix}:none-planned`,
      area,
      kind: "FIX",
      title: `No ${label === "CCHCS" ? "CCHCS" : label.toLowerCase()} time planned today`,
      whyNow: config.nonePrompt,
      minutes: 2,
      dueAt: null,
      href: area === "CCHCS" ? "/time-blocks" : `/tasks?domainId=${encodeURIComponent(input.domainIds[0])}`,
      external: false,
      source: `${label} plan`
    });
  }

  const capped = capOwnerActions(cards);
  const progress = [
    input.doneTodayCount > 0 ? `${input.doneTodayCount} done today` : null,
    onGridToday.length > 0
      ? `on the grid: ${onGridToday
          .slice(0, 3)
          .map((task) => `${truncateText(task.title, 40)} ${clock(task.scheduledStart as Date, timeZone)}`)
          .join(", ")}`
      : null
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    area,
    status: capped.length ? "READY" : "EMPTY",
    message: progress
      ? `${progress[0].toUpperCase()}${progress.slice(1)}.`
      : capped.length
        ? null
        : config.daily === "never"
          ? `Nothing planned for ${label}.`
          : `${label} is handled today.`,
    observedAt: null,
    cards: capped
  };
}

export async function loadLifeFeeds(
  userId: string,
  db: PrismaClient,
  input: {
    domains: { id: string; slug: string }[];
    openTasks: LifeTask[];
    day: LifeDay;
  }
): Promise<OwnerActionFeed[]> {
  try {
    const domainIdsByArea = Object.fromEntries(
      LIFE_AREA_ORDER.map((area) => [
        area,
        input.domains.filter((domain) => LIFE_AREAS[area].slugs.includes(domain.slug)).map((domain) => domain.id)
      ])
    ) as Record<LifeArea, string[]>;

    const doneToday = await db.executionTask.findMany({
      where: {
        userId,
        domainId: { in: [...new Set(Object.values(domainIdsByArea).flat())] },
        status: "DONE",
        completedAt: { gte: input.day.start, lt: input.day.end }
      },
      select: { blockType: true, domain: { select: { slug: true } } }
    });

    return LIFE_AREA_ORDER.map((area) =>
      buildLifeFeed(area, {
        domainIds: domainIdsByArea[area],
        openTasks: input.openTasks,
        doneTodayCount: doneToday.filter((task) => taskInArea(area, { domainSlug: task.domain.slug, blockType: task.blockType })).length,
        day: input.day
      })
    );
  } catch (error) {
    console.error("Life Today feeds failed", error instanceof Error ? error.message : "unknown error");
    return LIFE_AREA_ORDER.map((area) => ({
      area,
      status: "UNAVAILABLE" as const,
      message: `Couldn't load ${OWNER_ACTION_AREA_LABELS[area]} actions. The rest of Today still works.`,
      observedAt: null,
      cards: []
    }));
  }
}

export function toLifeTasks(
  tasks: {
    id: string;
    title: string;
    domainId: string;
    domain: { slug: string };
    blockType: string | null;
    whenBucket: string;
    dueDate: Date | null;
    scheduledStart: Date | null;
    pinToTodayUntilDone: boolean;
  }[]
): LifeTask[] {
  return tasks.map((task) => ({
    id: task.id,
    title: task.title,
    domainId: task.domainId,
    domainSlug: task.domain.slug,
    blockType: task.blockType,
    whenBucket: task.whenBucket,
    dueDate: task.dueDate,
    scheduledStart: task.scheduledStart,
    pinToTodayUntilDone: task.pinToTodayUntilDone
  }));
}
