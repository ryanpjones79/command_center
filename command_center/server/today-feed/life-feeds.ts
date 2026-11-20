import type { PrismaClient } from "@prisma/client";
import {
  capOwnerActions,
  OWNER_ACTION_AREA_LABELS,
  truncateText,
  type OwnerActionCard,
  type OwnerActionFeed
} from "@/lib/owner-actions";

// Kids and Health feeds for Today.
//
// No new tables: these areas live in RyanOS's existing task system. A daily
// workout or protein target is a recurring task in the Health domain; kids'
// time is a recurring task in the Family (or Kids) domain. "Checking in" is
// completing that task. The feed reads only and never creates or moves tasks.
//
// What counts as needing Ryan, in priority order:
//   1. overdue tasks in the area,
//   2. tasks due today that are not on today's grid yet,
//   3. nothing planned, scheduled or done today in the area at all.

export const LIFE_AREA_DOMAIN_SLUGS: Record<"KIDS" | "HEALTH", string[]> = {
  KIDS: ["kids", "family"],
  HEALTH: ["health"]
};

export type LifeTask = {
  id: string;
  title: string;
  domainSlug: string;
  domainId: string;
  whenBucket: string;
  dueDate: Date | null;
  scheduledStart: Date | null;
  pinToTodayUntilDone: boolean;
};

export type LifeDay = { start: Date; end: Date; timeZone: string };

function clock(value: Date, timeZone: string) {
  return value.toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
}

export function buildLifeFeed(
  area: "KIDS" | "HEALTH",
  input: {
    domainIds: string[];
    openTasks: LifeTask[];
    doneTodayCount: number;
    day: LifeDay;
  }
): OwnerActionFeed {
  const label = OWNER_ACTION_AREA_LABELS[area];
  const slugs = LIFE_AREA_DOMAIN_SLUGS[area];

  if (input.domainIds.length === 0) {
    return {
      area,
      status: "UNAVAILABLE",
      message: `Add a ${area === "KIDS" ? "Family or Kids" : "Health"} domain in Tasks to track ${label.toLowerCase()} here.`,
      observedAt: null,
      cards: []
    };
  }

  const { start, end, timeZone } = input.day;
  const tasks = input.openTasks.filter((task) => slugs.includes(task.domainSlug));
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

  const cards: OwnerActionCard[] = [
    ...overdue.map((task): OwnerActionCard => ({
      id: `${area.toLowerCase()}:overdue:${task.id}`,
      area,
      kind: "FIX",
      title: truncateText(`Overdue: ${task.title}`, 110),
      whyNow: "Do it today or reschedule it on purpose.",
      minutes: 2,
      dueAt: task.dueDate?.toISOString() ?? null,
      href: `/tasks?taskId=${encodeURIComponent(task.id)}`,
      external: false,
      source: `${label} task`
    })),
    ...dueTodayUnscheduled.map((task): OwnerActionCard => ({
      id: `${area.toLowerCase()}:unscheduled:${task.id}`,
      area,
      kind: "FIX",
      title: truncateText(`Put on today's grid: ${task.title}`, 110),
      whyNow: `${label} blocks go on the grid before work does.`,
      minutes: 1,
      dueAt: task.dueDate?.toISOString() ?? null,
      href: `/tasks?taskId=${encodeURIComponent(task.id)}`,
      external: false,
      source: `${label} task`
    }))
  ];

  const nothingToday = onGridToday.length === 0 && cards.length === 0 && input.doneTodayCount === 0;
  if (nothingToday) {
    cards.push({
      id: `${area.toLowerCase()}:none-planned`,
      area,
      kind: "FIX",
      title: `No ${label.toLowerCase()} time planned today`,
      whyNow:
        area === "KIDS"
          ? "Add a recurring Family task (school run, one-on-one, bedtime) and block it first."
          : "Add recurring Health tasks (workout, protein target) and block the workout first.",
      minutes: 2,
      dueAt: null,
      href: `/tasks?domainId=${encodeURIComponent(input.domainIds[0])}`,
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
    message: progress ? `${progress[0].toUpperCase()}${progress.slice(1)}.` : capped.length ? null : `${label} is handled today.`,
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
  const areas: ("KIDS" | "HEALTH")[] = ["KIDS", "HEALTH"];
  try {
    const domainIdsByArea = Object.fromEntries(
      areas.map((area) => [
        area,
        input.domains.filter((domain) => LIFE_AREA_DOMAIN_SLUGS[area].includes(domain.slug)).map((domain) => domain.id)
      ])
    ) as Record<"KIDS" | "HEALTH", string[]>;

    const doneCounts = await Promise.all(
      areas.map((area) =>
        domainIdsByArea[area].length === 0
          ? Promise.resolve(0)
          : db.executionTask.count({
              where: {
                userId,
                domainId: { in: domainIdsByArea[area] },
                status: "DONE",
                completedAt: { gte: input.day.start, lt: input.day.end }
              }
            })
      )
    );

    return areas.map((area, index) =>
      buildLifeFeed(area, {
        domainIds: domainIdsByArea[area],
        openTasks: input.openTasks,
        doneTodayCount: doneCounts[index],
        day: input.day
      })
    );
  } catch (error) {
    console.error("Life Today feeds failed", error instanceof Error ? error.message : "unknown error");
    return areas.map((area) => ({
      area,
      status: "UNAVAILABLE" as const,
      message: `Couldn't load ${OWNER_ACTION_AREA_LABELS[area].toLowerCase()} actions. The rest of Today still works.`,
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
    whenBucket: task.whenBucket,
    dueDate: task.dueDate,
    scheduledStart: task.scheduledStart,
    pinToTodayUntilDone: task.pinToTodayUntilDone
  }));
}
