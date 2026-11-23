import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createHabit, loadHabits, setHabitDone, streakFor } from "@/server/v2/habits";
import { loadBoard } from "@/server/v2/board";
import { createV2TestDb } from "./helpers/v2-db";

// Days counting back from "today" (Mon 2026-11-23): key and weekday (0 = Sunday).
const back = (count: number) => Array.from({ length: count }, (_, index) => {
  const day = new Date(Date.UTC(2026, 10, 23 - index));
  return { key: day.toISOString().slice(0, 10), weekday: day.getUTCDay() };
});

describe("habit streaks", () => {
  const days = back(14);
  const everyDay = [0, 1, 2, 3, 4, 5, 6];
  it("counts consecutive done days; today counts only once done", () => {
    const done = new Set(["2026-11-22", "2026-11-21", "2026-11-20"]);
    expect(streakFor(everyDay, done, days, "2026-01-01")).toBe(3);
    expect(streakFor(everyDay, new Set([...done, "2026-11-23"]), days, "2026-01-01")).toBe(4);
  });
  it("a missed scheduled day ends it; unscheduled days are skipped", () => {
    expect(streakFor(everyDay, new Set(["2026-11-22", "2026-11-20"]), days, "2026-01-01")).toBe(1);
    const monWedFri = [1, 3, 5];
    expect(streakFor(monWedFri, new Set(["2026-11-20", "2026-11-18", "2026-11-16"]), days, "2026-01-01")).toBe(3); // weekend + Tue/Thu skipped
  });
  it("stops at the day the habit was created", () => {
    expect(streakFor(everyDay, new Set(["2026-11-22", "2026-11-21", "2026-11-20"]), days, "2026-11-21")).toBe(2);
  });
});

describe("daily habits on Plan", () => {
  let db: PrismaClient;
  let userId: string;
  let cleanup: () => Promise<void>;
  beforeAll(async () => ({ db, userId, cleanup } = await createV2TestDb("habits")), 60_000);
  afterAll(async () => cleanup());

  it("adding a habit puts today's copy in the strip, not the lists; checking it off counts", async () => {
    expect(await createHabit(userId, { title: "Walk", weekdays: [0, 1, 2, 3, 4, 5, 6], minutes: 60, area: "HEALTH" }, db)).toMatchObject({ ok: true });
    expect(await createHabit(userId, { title: "Walk", weekdays: [1], minutes: 60, area: "HEALTH" }, db)).toMatchObject({ ok: false });
    expect(await createHabit(userId, { title: "Stretch", weekdays: [], minutes: 10, area: "HEALTH" }, db)).toMatchObject({ ok: false });

    let habits = await loadHabits(userId, db);
    const walk = habits.find((habit) => habit.title === "Walk");
    expect(walk).toMatchObject({ done: false, streak: 0, minutes: 60 });
    expect(walk?.todayTaskId).toBeTruthy();

    const board = await loadBoard(userId, db, async () => []);
    const listed = board.areas.flatMap((area) => [...area.loose, ...area.projects.flatMap((project) => project.tasks)]).map((task) => task.title);
    expect(listed).not.toContain("Walk");
    expect(board.habits.map((habit) => habit.title)).toContain("Walk");
    expect(board.routineTasks.map((task) => task.id)).toContain(walk?.todayTaskId);

    await setHabitDone(userId, walk?.todayTaskId as string, true, db);
    habits = await loadHabits(userId, db);
    expect(habits.find((habit) => habit.title === "Walk")).toMatchObject({ done: true, streak: 1 });
    await setHabitDone(userId, walk?.todayTaskId as string, false, db);
    expect((await loadHabits(userId, db)).find((habit) => habit.title === "Walk")).toMatchObject({ done: false, streak: 0 });
    // Undo keeps its length, so placing it later still books an hour.
    expect((await db.executionTask.findUniqueOrThrow({ where: { id: walk?.todayTaskId as string } })).remainingMinutes).toBe(60);
  });

  it("only routines refuse other tasks", async () => {
    const domain = await db.executionDomain.findFirstOrThrow({ where: { userId, slug: "admin" } });
    const other = await db.executionTask.create({ data: { userId, domainId: domain.id, title: "Not a habit" } });
    expect(await setHabitDone(userId, other.id, true, db)).toMatchObject({ ok: false });
  });
});
