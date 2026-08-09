import { prisma } from "@/lib/prisma";
import { getExecutionWorkspace, getWeeklyReviewData } from "@/server/execution-service";

export const weeklyThemeExamples = [
  "Simplify",
  "Ship",
  "Focus",
  "Relationships",
  "Recovery",
  "Presence",
  "Build"
] as const;

export const staleDecisionOptions = [
  "Do",
  "Reschedule",
  "Return to Project",
  "Park",
  "Release"
] as const;

export type StaleDecision = (typeof staleDecisionOptions)[number];

export const weeklyHealthMetricTargets = [
  {
    help: "Goal: 7 days below calories",
    key: "belowCaloriesDays",
    label: "Calories",
    target: 7
  },
  {
    help: "Goal: 4 walks",
    key: "walkingDays",
    label: "Walking",
    target: 4
  },
  {
    help: "Goal: 2 workouts",
    key: "workoutDays",
    label: "Workouts",
    target: 2
  }
] as const;

export type WeeklyHealthMetricKey = (typeof weeklyHealthMetricTargets)[number]["key"];

export type WeeklyResetOutcomes = {
  topThreeProjectIds?: string[];
  peopleIntentions?: string[];
  staleDecisions?: Record<string, StaleDecision>;
  healthMetrics?: {
    belowCaloriesDays?: number;
    walkingDays?: number;
    workoutDays?: number;
  };
  calendarPrep?: {
    cchcsImported?: boolean;
    kidsEventsAdded?: boolean;
  };
};

export type WeeklyHealthMetricSnapshot = {
  weekOf: Date;
  healthMetrics: NonNullable<WeeklyResetOutcomes["healthMetrics"]>;
};

export function summarizeWeeklyHealthTrend(
  snapshots: WeeklyHealthMetricSnapshot[],
  key: WeeklyHealthMetricKey,
  target: number
) {
  const recent = snapshots
    .filter((snapshot) => typeof snapshot.healthMetrics[key] === "number")
    .slice(0, 4);

  if (recent.length === 0) {
    return {
      hitGoalWeeks: 0,
      label: "No history yet",
      values: []
    };
  }

  const values = recent.map((snapshot) => ({
    value: snapshot.healthMetrics[key] ?? 0,
    weekOf: snapshot.weekOf
  }));
  const hitGoalWeeks = values.filter((item) => item.value >= target).length;
  const label =
    hitGoalWeeks === recent.length
      ? "Consistent"
      : hitGoalWeeks >= Math.ceil(recent.length / 2)
        ? "Building"
        : "Needs consistency";

  return {
    hitGoalWeeks,
    label,
    values
  };
}

export function startOfWeek(value: Date) {
  const date = new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + mondayOffset);
  return date;
}

export function addDays(value: Date, days: number) {
  const copy = new Date(value);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function parseWeeklyResetOutcomes(value: string | null | undefined): WeeklyResetOutcomes {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value) as WeeklyResetOutcomes;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function serializeWeeklyResetOutcomes(outcomes: WeeklyResetOutcomes) {
  return JSON.stringify(outcomes);
}

export async function getOrCreateWeeklyReset(userId: string, date = new Date()) {
  const weekOf = startOfWeek(date);

  return prisma.weeklyReset.upsert({
    where: { userId_weekOf: { userId, weekOf } },
    update: {},
    create: {
      userId,
      weekOf,
      outcomes: serializeWeeklyResetOutcomes({})
    }
  });
}

export async function updateWeeklyResetOutcomes(
  userId: string,
  patch: WeeklyResetOutcomes
) {
  const reset = await getOrCreateWeeklyReset(userId);
  const current = parseWeeklyResetOutcomes(reset.outcomes);
  const next: WeeklyResetOutcomes = {
    ...current,
    ...patch,
    staleDecisions: {
      ...(current.staleDecisions ?? {}),
      ...(patch.staleDecisions ?? {})
    }
  };

  return prisma.weeklyReset.update({
    where: { id: reset.id },
    data: { outcomes: serializeWeeklyResetOutcomes(next) }
  });
}

export async function getGuidedWeeklyResetData(userId: string) {
  const reset = await getOrCreateWeeklyReset(userId);
  const weekEnd = addDays(reset.weekOf, 7);

  const [review, workspace, notebookEntries, recentResets] = await Promise.all([
    getWeeklyReviewData(userId),
    getExecutionWorkspace(userId),
    prisma.notebookEntryIndex.findMany({
      where: {
        userId,
        date: { gte: reset.weekOf, lt: weekEnd }
      },
      include: {
        notebook: true,
        project: true,
        domain: true
      },
      orderBy: [{ date: "desc" }, { updatedAt: "desc" }],
      take: 12
    }),
    prisma.weeklyReset.findMany({
      where: { userId },
      orderBy: { weekOf: "desc" },
      take: 8
    })
  ]);
  const recentHealthMetrics = recentResets
    .map((weeklyReset) => ({
      healthMetrics: parseWeeklyResetOutcomes(weeklyReset.outcomes).healthMetrics,
      weekOf: weeklyReset.weekOf
    }))
    .filter(
      (
        item
      ): item is WeeklyHealthMetricSnapshot => Boolean(item.healthMetrics)
    );

  return {
    reset,
    outcomes: parseWeeklyResetOutcomes(reset.outcomes),
    review,
    workspace,
    notebookEntries,
    recentHealthMetrics
  };
}

export function getWeeklyResetStepStatus(reset: {
  paperReflectionStartedAt: Date | null;
  paperReflectionCompletedAt: Date | null;
  notebookProcessedAt: Date | null;
  weekTheme: string | null;
  guideGeneratedAt: Date | null;
  completedAt: Date | null;
}) {
  return {
    paperStarted: Boolean(reset.paperReflectionStartedAt),
    paperCompleted: Boolean(reset.paperReflectionCompletedAt),
    notebookProcessed: Boolean(reset.notebookProcessedAt),
    nextWeekChosen: Boolean(reset.weekTheme),
    guideGenerated: Boolean(reset.guideGeneratedAt),
    complete: Boolean(reset.completedAt)
  };
}
