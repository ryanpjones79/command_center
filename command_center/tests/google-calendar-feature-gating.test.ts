import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    executionDomain: {
      upsert: vi.fn(),
      findMany: vi.fn()
    },
    executionTask: {
      findMany: vi.fn()
    },
    executionProject: {
      findMany: vi.fn()
    },
    dailyPlan: {
      upsert: vi.fn()
    },
    rykasDay: {
      upsert: vi.fn()
    },
    season: {
      findFirst: vi.fn()
    }
  }
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { getCalendarEventsForDate } from "@/server/google-calendar-service";
import { getTimeBlockPlannerData } from "@/server/execution-service";

const googleEnvironmentKeys = [
  "FEATURE_GOOGLE_CALENDAR",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN"
] as const;

const originalEnvironment = Object.fromEntries(
  googleEnvironmentKeys.map((key) => [key, process.env[key]])
);

function removeGoogleCredentials() {
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.GOOGLE_REFRESH_TOKEN;
}

beforeEach(() => {
  vi.clearAllMocks();
  removeGoogleCredentials();
  process.env.FEATURE_GOOGLE_CALENDAR = "false";

  prismaMock.executionDomain.upsert.mockResolvedValue({});
  prismaMock.executionDomain.findMany.mockResolvedValue([
    { id: "domain-1", name: "Work", slug: "work" }
  ]);
  prismaMock.executionTask.findMany.mockResolvedValue([
    {
      id: "task-1",
      title: "RyanOS task remains available",
      priority: "HIGH",
      dueDate: null,
      followUpDate: null,
      updatedAt: new Date("2026-08-29T12:00:00.000Z"),
      status: "NOT_STARTED",
      whenBucket: "TODAY",
      pinToTodayUntilDone: false,
      type: "ACTION",
      estimatedDuration: "UNDER_30_MIN",
      isBlocked: false,
      project: null,
      scheduledStart: null,
      scheduledEnd: null,
      references: []
    }
  ]);
  prismaMock.executionProject.findMany.mockResolvedValue([]);
  prismaMock.dailyPlan.upsert.mockResolvedValue({
    needleMove: null,
    ruleStep: null,
    shutdownNote: null
  });
  prismaMock.rykasDay.upsert.mockResolvedValue({ backlogAfter: null });
  prismaMock.season.findFirst.mockResolvedValue(null);
});

afterEach(() => {
  for (const key of googleEnvironmentKeys) {
    const value = originalEnvironment[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Google Calendar feature gating", () => {
  it("returns no events without credentials when Calendar is disabled", async () => {
    await expect(
      getCalendarEventsForDate(new Date("2026-08-29T12:00:00.000Z"))
    ).resolves.toEqual([]);
  });

  it("loads Time Blocks with RyanOS tasks when Calendar is disabled", async () => {
    const planner = await getTimeBlockPlannerData(
      "user-1",
      new Date("2026-08-29T12:00:00.000Z")
    );

    expect(planner.calendarEvents).toEqual([]);
    expect(planner.unscheduledTasks).toEqual([
      expect.objectContaining({
        id: "task-1",
        title: "RyanOS task remains available"
      })
    ]);
  });

  it("preserves credential validation when Calendar is enabled", async () => {
    process.env.FEATURE_GOOGLE_CALENDAR = "true";

    await expect(
      getCalendarEventsForDate(new Date("2026-08-29T12:00:00.000Z"))
    ).rejects.toThrow(
      "Missing Google configuration: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN"
    );
  });
});
