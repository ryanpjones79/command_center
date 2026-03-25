import { prisma } from "@/lib/prisma";
import { executionSelectOptions } from "@/lib/execution-options";

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function daysAgo(value: Date, count: number) {
  const copy = new Date(value);
  copy.setDate(copy.getDate() - count);
  return copy;
}

function rankMap<T extends string>(values: readonly T[]) {
  return new Map<string, number>(values.map((value, index) => [value, index]));
}

const priorityRank = rankMap(executionSelectOptions.priorities);
const taskStatusRank = rankMap(executionSelectOptions.taskStatuses);
const whenBucketRank = rankMap(executionSelectOptions.whenBuckets);
const projectStatusRank = rankMap(executionSelectOptions.projectStatuses);
const activeStatusRank = rankMap(executionSelectOptions.activeStatuses);
const weeklyFocusRank = rankMap(executionSelectOptions.weeklyFocuses);

function compareDateAsc(left: Date | null, right: Date | null) {
  if (left && right) return left.getTime() - right.getTime();
  if (left) return -1;
  if (right) return 1;
  return 0;
}

function compareDateDesc(left: Date | null, right: Date | null) {
  if (left && right) return right.getTime() - left.getTime();
  if (left) return -1;
  if (right) return 1;
  return 0;
}

function compareTaskPriority(left: string, right: string) {
  return (priorityRank.get(right) ?? 0) - (priorityRank.get(left) ?? 0);
}

function sortTasks<
  T extends {
    priority: string;
    dueDate: Date | null;
    followUpDate?: Date | null;
    updatedAt: Date;
    status: string;
    whenBucket: string;
    pinToTodayUntilDone?: boolean;
  }
>(tasks: T[]) {
  return [...tasks].sort((left, right) => {
    const pinnedDiff = Number(Boolean(right.pinToTodayUntilDone)) - Number(Boolean(left.pinToTodayUntilDone));
    if (pinnedDiff !== 0) return pinnedDiff;

    const statusDiff = (taskStatusRank.get(left.status) ?? 0) - (taskStatusRank.get(right.status) ?? 0);
    if (statusDiff !== 0) return statusDiff;

    const bucketDiff = (whenBucketRank.get(left.whenBucket) ?? 0) - (whenBucketRank.get(right.whenBucket) ?? 0);
    if (bucketDiff !== 0) return bucketDiff;

    const priorityDiff = compareTaskPriority(left.priority, right.priority);
    if (priorityDiff !== 0) return priorityDiff;

    const dateDiff = compareDateAsc(left.dueDate, right.dueDate);
    if (dateDiff !== 0) return dateDiff;

    const followUpDiff = compareDateAsc(left.followUpDate ?? null, right.followUpDate ?? null);
    if (followUpDiff !== 0) return followUpDiff;

    return left.updatedAt.getTime() - right.updatedAt.getTime();
  });
}

function sortWaitingTasks<
  T extends {
    priority: string;
    followUpDate?: Date | null;
    dueDate: Date | null;
    updatedAt: Date;
  }
>(tasks: T[]) {
  return [...tasks].sort((left, right) => {
    const followUpDiff = compareDateAsc(left.followUpDate ?? null, right.followUpDate ?? null);
    if (followUpDiff !== 0) return followUpDiff;

    const priorityDiff = compareTaskPriority(left.priority, right.priority);
    if (priorityDiff !== 0) return priorityDiff;

    const dueDiff = compareDateAsc(left.dueDate, right.dueDate);
    if (dueDiff !== 0) return dueDiff;

    return left.updatedAt.getTime() - right.updatedAt.getTime();
  });
}

function sortProjects<
  T extends {
    weeklyFocus: string;
    activeStatus: string;
    priority: string;
    status: string;
    updatedAt: Date;
  }
>(projects: T[]) {
  return [...projects].sort((left, right) => {
    const weeklyDiff = (weeklyFocusRank.get(left.weeklyFocus) ?? 0) - (weeklyFocusRank.get(right.weeklyFocus) ?? 0);
    if (weeklyDiff !== 0) return weeklyDiff;

    const activeDiff = (activeStatusRank.get(left.activeStatus) ?? 0) - (activeStatusRank.get(right.activeStatus) ?? 0);
    if (activeDiff !== 0) return activeDiff;

    const priorityDiff = compareTaskPriority(left.priority, right.priority);
    if (priorityDiff !== 0) return priorityDiff;

    const statusDiff = (projectStatusRank.get(left.status) ?? 0) - (projectStatusRank.get(right.status) ?? 0);
    if (statusDiff !== 0) return statusDiff;

    return compareDateDesc(left.updatedAt, right.updatedAt);
  });
}

function isWaitingTask<
  T extends {
    status: string;
    whenBucket: string;
  }
>(task: T) {
  return task.status === "WAITING" || task.whenBucket === "WAITING";
}

function isQuickWinTask<T extends { type: string }>(task: T) {
  return task.type === "QUICK_WIN";
}

function isSuggestedQuickWinTask<
  T extends {
    type: string;
    estimatedDuration?: string | null;
    pinToTodayUntilDone?: boolean;
    isBlocked?: boolean;
    dueDate: Date | null;
    priority: string;
    project?: { weeklyFocus?: string | null } | null;
  }
>(task: T, today: Date) {
  if (task.type === "QUICK_WIN") return false;
  if (task.estimatedDuration !== "UNDER_30_MIN") return false;
  if (task.pinToTodayUntilDone || task.isBlocked) return false;
  if (task.priority === "CRITICAL") return false;
  if (task.project?.weeklyFocus === "TOP_3") return false;
  if (task.dueDate && startOfDay(task.dueDate) <= today) return false;

  return true;
}

function addQuickWinCandidateFlag<
  T extends {
    type: string;
    estimatedDuration?: string | null;
    pinToTodayUntilDone?: boolean;
    isBlocked?: boolean;
    dueDate: Date | null;
    priority: string;
    project?: { weeklyFocus?: string | null } | null;
  }
>(tasks: T[], today: Date) {
  return tasks.map((task) => ({
    ...task,
    isQuickWinCandidate: isSuggestedQuickWinTask(task, today)
  }));
}

function belongsInQuickWinSection<
  T extends {
    type: string;
    estimatedDuration?: string | null;
    pinToTodayUntilDone?: boolean;
    isBlocked?: boolean;
    dueDate: Date | null;
    priority: string;
    project?: { weeklyFocus?: string | null } | null;
  }
>(task: T, today: Date) {
  return isQuickWinTask(task) || isSuggestedQuickWinTask(task, today);
}

function isParkingLotTask<T extends { whenBucket: string }>(task: T) {
  return task.whenBucket === "PARKING_LOT" || task.whenBucket === "LATER";
}

function isTodayTask<T extends { whenBucket: string; pinToTodayUntilDone?: boolean }>(task: T) {
  return task.whenBucket === "TODAY" || Boolean(task.pinToTodayUntilDone);
}

export const defaultExecutionDomains = [
  { name: "Work", slug: "work", description: "Leadership, analytics, dev workflows. No PHI." },
  { name: "Rykas", slug: "rykas", description: "Amazon FBA, reorders, vendor coordination." },
  { name: "Casino/AP", slug: "casino-ap", description: "Legal and compliant AP tracking only." },
  { name: "Betting Models", slug: "betting-models", description: "Research queue, model maintenance, data pulls." },
  { name: "Poker", slug: "poker", description: "Study plans and live execution prep." },
  { name: "Health", slug: "health", description: "Protein, calories, training, recovery." },
  { name: "Family", slug: "family", description: "Family planning and commitments." },
  { name: "Golf", slug: "golf", description: "Practice, play, and scheduling." },
  { name: "Travel", slug: "travel", description: "Trips, logistics, preparation." },
  { name: "Admin", slug: "admin", description: "Paperwork, errands, misc operations." }
] as const;

export async function ensureExecutionSetup(userId: string) {
  for (const domain of defaultExecutionDomains) {
    await prisma.executionDomain.upsert({
      where: { userId_slug: { userId, slug: domain.slug } },
      update: { description: domain.description },
      create: { ...domain, isDefault: true, userId }
    });
  }
}

export async function getExecutionWorkspace(userId: string) {
  const [domains, rawProjects] = await Promise.all([
    prisma.executionDomain.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    prisma.executionProject.findMany({
      where: { userId },
      include: { domain: true }
    })
  ]);

  return { domains, projects: sortProjects(rawProjects) };
}

export async function getActionSheetData(userId: string) {
  await ensureExecutionSetup(userId);

  const today = startOfDay(new Date());
  const staleCutoff = daysAgo(today, 7);

  const [domains, rawTasks, rawProjects] = await Promise.all([
    prisma.executionDomain.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    prisma.executionTask.findMany({
      where: {
        userId,
        status: { notIn: ["DONE", "DROPPED"] }
      },
      include: { domain: true, project: true }
    }),
    prisma.executionProject.findMany({
      where: { userId, activeStatus: { not: "COMPLETED" } },
      include: { domain: true }
    })
  ]);

  const tasks = addQuickWinCandidateFlag(sortTasks(rawTasks), today);
  const projects = sortProjects(rawProjects);

  const todayTasks = tasks.filter(
    (task) => isTodayTask(task) && !isWaitingTask(task) && !belongsInQuickWinSection(task, today)
  );
  const thisWeekTasks = tasks.filter(
    (task) => task.whenBucket === "THIS_WEEK" && !isWaitingTask(task) && !belongsInQuickWinSection(task, today)
  );
  const waitingTasks = sortWaitingTasks(tasks.filter((task) => isWaitingTask(task)));
  const quickWinTasks = tasks.filter((task) => belongsInQuickWinSection(task, today) && !isWaitingTask(task));
  const parkingLotTasks = tasks.filter(
    (task) => isParkingLotTask(task) && !isWaitingTask(task) && !belongsInQuickWinSection(task, today)
  );

  const topThreeProjects = projects.filter((project) => project.weeklyFocus === "TOP_3").slice(0, 3);
  const overdueFollowUps = waitingTasks.filter(
    (task) => task.followUpDate && startOfDay(task.followUpDate) < today
  );
  const blockedItems = [
    ...projects.filter((project) => project.blocked),
    ...tasks.filter((task) => task.isBlocked)
  ];
  const staleTasks = tasks.filter((task) => task.updatedAt < staleCutoff);

  return {
    today,
    domains,
    projects,
    sections: {
      today: todayTasks,
      thisWeek: thisWeekTasks,
      waiting: waitingTasks,
      quickWins: quickWinTasks,
      parkingLot: parkingLotTasks
    },
    topThreeProjects,
    overdueFollowUps,
    blockedItems,
    staleTasks
  };
}

export async function getWeeklyReviewData(userId: string) {
  await ensureExecutionSetup(userId);

  const staleCutoff = daysAgo(startOfDay(new Date()), 7);
  const rawProjects = await prisma.executionProject.findMany({
    where: { userId },
    include: {
      domain: true,
      tasks: {
        where: { status: { notIn: ["DONE", "DROPPED"] } },
        take: 6
      }
    }
  });

  const projects = sortProjects(rawProjects).map((project) => ({
    ...project,
    tasks: sortTasks(project.tasks)
  }));

  return {
    projects,
    summary: {
      activeNowCount: projects.filter((project) => project.activeStatus === "ACTIVE_NOW").length,
      topThreeCount: projects.filter((project) => project.weeklyFocus === "TOP_3").length,
      missingNextAction: projects.filter(
        (project) =>
          project.activeStatus === "ACTIVE_NOW" &&
          project.status !== "COMPLETED" &&
          !project.nextAction?.trim()
      ),
      blockedProjects: projects.filter((project) => project.blocked || project.status === "BLOCKED"),
      waitingProjects: projects.filter((project) => Boolean(project.waitingOn?.trim())),
      staleProjects: projects.filter(
        (project) =>
          project.activeStatus !== "COMPLETED" &&
          (project.lastReviewedAt ?? project.updatedAt) < staleCutoff
      )
    }
  };
}

export async function getTaskMaintenanceData(
  userId: string,
  filters?: {
    whenBucket?: string;
    status?: string;
    domainId?: string;
    projectId?: string;
    priority?: string;
    q?: string;
  }
) {
  await ensureExecutionSetup(userId);

  const [rawTasks, domains, projects] = await Promise.all([
    prisma.executionTask.findMany({
      where: {
        userId,
        ...(filters?.whenBucket ? { whenBucket: filters.whenBucket as never } : {}),
        ...(filters?.status ? { status: filters.status as never } : {}),
        ...(filters?.domainId ? { domainId: filters.domainId } : {}),
        ...(filters?.projectId ? { projectId: filters.projectId } : {}),
        ...(filters?.priority ? { priority: filters.priority as never } : {}),
        ...(filters?.q
          ? {
              OR: [
                { title: { contains: filters.q } },
                { note: { contains: filters.q } },
                { waitingOn: { contains: filters.q } },
                { source: { contains: filters.q } }
              ]
            }
          : {})
      },
      include: { domain: true, project: true }
    }),
    prisma.executionDomain.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    prisma.executionProject.findMany({ where: { userId }, include: { domain: true }, orderBy: { name: "asc" } })
  ]);

  const today = startOfDay(new Date());

  return { tasks: addQuickWinCandidateFlag(sortTasks(rawTasks), today), domains, projects };
}

export async function getProjectMaintenanceData(userId: string) {
  await ensureExecutionSetup(userId);

  const [rawProjects, domains] = await Promise.all([
    prisma.executionProject.findMany({
      where: { userId },
      include: {
        domain: true,
        tasks: {
          where: { status: { notIn: ["DONE", "DROPPED"] } },
          take: 8
        }
      }
    }),
    prisma.executionDomain.findMany({ where: { userId }, orderBy: { name: "asc" } })
  ]);

  return {
    projects: sortProjects(rawProjects).map((project) => ({
      ...project,
      tasks: sortTasks(project.tasks)
    })),
    domains
  };
}
