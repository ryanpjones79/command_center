import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getWeeklyResetStepStatus,
  parseWeeklyResetOutcomes,
  serializeWeeklyResetOutcomes,
  staleDecisionOptions,
  startOfWeek,
  summarizeWeeklyHealthTrend,
  weeklyThemeExamples
} from "@/server/review-service";

const rootDir = process.cwd();

function readSource(...parts: string[]) {
  return readFileSync(path.join(rootDir, ...parts), "utf8");
}

describe("Phase 4 Guided Weekly Reset", () => {
  it("adds approved WeeklyReset fields to both Prisma schemas and one additive migration", () => {
    for (const schemaName of ["schema.prisma", "schema.postgres.prisma"]) {
      const schema = readSource("prisma", schemaName);

      expect(schema).toContain("paperReflectionStartedAt");
      expect(schema).toContain("paperReflectionCompletedAt");
      expect(schema).toContain("notebookProcessedAt");
      expect(schema).toContain("weekTheme");
      expect(schema).toContain("guideGeneratedAt");
      expect(schema).not.toContain("reflectionText");
      expect(schema).not.toContain("spiritualScore");
    }

    const migration = readSource(
      "prisma",
      "migrations",
      "20260803001000_add_guided_weekly_reset_fields",
      "migration.sql"
    );

    expect(migration).toContain('ALTER TABLE "WeeklyReset" ADD COLUMN "paperReflectionStartedAt"');
    expect(migration).not.toContain("DROP");
  });

  it("computes a stable Monday week key and reset step status", () => {
    expect(startOfWeek(new Date(2026, 7, 3)).toDateString()).toBe(
      new Date(2026, 7, 3).toDateString()
    );
    expect(startOfWeek(new Date(2026, 7, 9)).toDateString()).toBe(
      new Date(2026, 7, 3).toDateString()
    );

    expect(
      getWeeklyResetStepStatus({
        paperReflectionStartedAt: new Date(),
        paperReflectionCompletedAt: null,
        notebookProcessedAt: null,
        weekTheme: "Ship",
        guideGeneratedAt: null,
        completedAt: null
      })
    ).toMatchObject({
      paperStarted: true,
      paperCompleted: false,
      nextWeekChosen: true,
      complete: false
    });
  });

  it("persists weekly theme, Top 3 IDs, people, and stale decisions through outcomes JSON", () => {
    const serialized = serializeWeeklyResetOutcomes({
      topThreeProjectIds: ["project_1", "project_2"],
      peopleIntentions: ["Daughter", "Customer"],
      staleDecisions: { "task:1": "Park" },
      healthMetrics: {
        belowCaloriesDays: 5,
        walkingDays: 4,
        workoutDays: 3
      },
      calendarPrep: {
        cchcsImported: true,
        kidsEventsAdded: false
      }
    });
    const parsed = parseWeeklyResetOutcomes(serialized);

    expect(weeklyThemeExamples).toContain("Simplify");
    expect(weeklyThemeExamples).toContain("Ship");
    expect(parsed.topThreeProjectIds).toEqual(["project_1", "project_2"]);
    expect(parsed.peopleIntentions).toEqual(["Daughter", "Customer"]);
    expect(parsed.staleDecisions?.["task:1"]).toBe("Park");
    expect(parsed.healthMetrics?.belowCaloriesDays).toBe(5);
    expect(parsed.calendarPrep?.cchcsImported).toBe(true);
  });

  it("summarizes weekly health metric trends without charts or scoring", () => {
    const trend = summarizeWeeklyHealthTrend(
      [
        { weekOf: new Date(2026, 7, 3), healthMetrics: { walkingDays: 4 } },
        { weekOf: new Date(2026, 6, 27), healthMetrics: { walkingDays: 3 } },
        { weekOf: new Date(2026, 6, 20), healthMetrics: { walkingDays: 5 } },
        { weekOf: new Date(2026, 6, 13), healthMetrics: { walkingDays: 2 } }
      ],
      "walkingDays",
      4
    );

    expect(trend.hitGoalWeeks).toBe(2);
    expect(trend.label).toBe("Building");
    expect(trend.values).toHaveLength(4);
  });

  it("offers the approved stale-work decisions without punitive language", () => {
    const projectControl = readSource("components", "review", "project-control.tsx");
    const weeklyPage = readSource("app", "weekly-review", "page.tsx");

    expect(staleDecisionOptions).toEqual([
      "Do",
      "Reschedule",
      "Return to Project",
      "Park",
      "Release"
    ]);
    expect(projectControl).toContain("Needs a decision");
    expect(projectControl).not.toContain("Overdue");
    expect(weeklyPage).not.toContain("Failed");
    expect(weeklyPage).not.toContain("Behind");
  });

  it("wraps Project Control in a guided wizard and preserves existing project intelligence", () => {
    const weeklyPage = readSource("app", "weekly-review", "page.tsx");
    const projectControl = readSource("components", "review", "project-control.tsx");
    const reviewService = readSource("server", "review-service.ts");

    expect(weeklyPage).toContain("Begin Weekly Reset");
    expect(weeklyPage).toContain("Take your notebook.");
    expect(weeklyPage).toContain("Process your notebook.");
    expect(weeklyPage).toContain("Project Control Foundation");
    expect(weeklyPage).toContain("Close Last Week");
    expect(reviewService).toContain("Goal: 7 days below calories");
    expect(reviewService).toContain("Goal: 4 walks");
    expect(reviewService).toContain("Goal: 2 workouts");
    expect(weeklyPage).toContain("Last 4 Weeks");
    expect(reviewService).toContain("Needs consistency");
    expect(weeklyPage).toContain("Prepare Next Week");
    expect(weeklyPage).toContain("Import CCHCS calendar to Google Calendar");
    expect(weeklyPage).toContain("Add kids events for the week to Google Calendar");
    expect(weeklyPage).toContain("Weekly Reset Complete");
    expect(projectControl).toContain("Top 3 Projects");
    expect(projectControl).toContain("Missing Next Action");
    expect(projectControl).toContain("Blocked / Waiting");
    expect(projectControl).toContain("Task Health");
  });

  it("provides a print-only Weekly Guide and review route alias", () => {
    const weeklyPage = readSource("app", "weekly-review", "page.tsx");

    expect(weeklyPage).toContain("Weekly Guide");
    expect(weeklyPage).toContain("Important Meetings");
    expect(weeklyPage).toContain("Health Signals");
    expect(weeklyPage).toContain("Calendar Prep");
    expect(weeklyPage).toContain("Notebook Reminder");
    expect(weeklyPage).toContain("Relationship Intention");
    expect(weeklyPage).toContain("Needle Move Reminder");
    expect(weeklyPage).toContain("weekly-guide-print-root print-only");
    expect(existsSync(path.join(rootDir, "app", "review", "weekly-reset", "page.tsx"))).toBe(true);
  });
});
