import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { addSuggestedRoutines, createHabit, loadHabits } from "@/server/v2/habits";
import { proposeDay } from "@/server/v2/plan";
import { materializeRoutines, timeOfDayWindow, weeklyTarget } from "@/server/v2/routines";
import { createV2TestDb } from "./helpers/v2-db";

let db: PrismaClient;
let userId: string;
let cleanup: () => Promise<void>;
beforeAll(async () => ({ db, userId, cleanup } = await createV2TestDb("routines")), 60_000);
afterAll(async () => cleanup());

const noCalendar = async () => [];
const wed7am = new Date("2026-11-25T15:00:00Z"); // Wed Nov 25, 7:00 AM Pacific; the week started Mon Nov 23

describe("routines that fill free time", () => {
  it("weekly target: no copy once done that many times this week", async () => {
    const created = await createHabit(userId, { title: "Workout", area: "health", weekdays: [0, 1, 2, 3, 4, 5, 6], minutes: 45, timesPerWeek: 2 }, db, new Date("2026-11-23T15:00:00Z"));
    expect(created.ok).toBe(true);
    const routine = await db.protectedRoutine.findFirstOrThrow({ where: { userId, title: "Workout" } });
    expect(weeklyTarget(routine)).toBe(2);
    const health = await db.executionDomain.findFirstOrThrow({ where: { userId, slug: "health" } });
    for (const day of ["2026-11-23", "2026-11-24"]) {
      await db.executionTask.upsert({
        where: { userId_integrationSourceKey: { userId, integrationSourceKey: `ROUTINE:${routine.id}:${day}` } },
        update: { status: "DONE" },
        create: { userId, domainId: health.id, title: "Workout", status: "DONE", sourceSystem: "ROUTINE", integrationSourceKey: `ROUTINE:${routine.id}:${day}` }
      });
    }
    await materializeRoutines(userId, db, wed7am);
    expect(await db.executionTask.findUnique({ where: { userId_integrationSourceKey: { userId, integrationSourceKey: `ROUTINE:${routine.id}:2026-11-25` } } })).toBeNull();
    const habit = (await loadHabits(userId, db, wed7am)).find((item) => item.title === "Workout");
    expect(habit?.week).toMatchObject({ done: 2, target: 2 });
    await db.protectedRoutine.update({ where: { id: routine.id }, data: { active: false } });
  });

  it("any area works, and a target at least the number of days means every day", async () => {
    expect((await createHabit(userId, { title: "eBay listing", area: "rykas", weekdays: [1, 2, 3, 4, 5], minutes: 60, timesPerWeek: 9 }, db, wed7am)).ok).toBe(true);
    const routine = await db.protectedRoutine.findFirstOrThrow({ where: { userId, title: "eBay listing" } });
    expect([routine.domainSlug, routine.timesPerWeek]).toEqual(["rykas", null]);
    expect((await createHabit(userId, { title: "Nope", area: "not-an-area", weekdays: [1], minutes: 30 }, db, wed7am)).ok).toBe(false);
    expect((await createHabit(userId, { title: "Chart MRN 1234567", area: "work", weekdays: [1], minutes: 30 }, db, wed7am)).ok).toBe(false);
  });

  it("plan my day: to-dos first, then routines in the gaps and inside their time of day", async () => {
    expect((await createHabit(userId, { title: "Slot hustle", area: "casino-ap", weekdays: [0, 1, 2, 3, 4, 5, 6], minutes: 120, timeOfDay: "EVENING" }, db, wed7am)).ok).toBe(true);
    const rykas = await db.executionDomain.findFirstOrThrow({ where: { userId, slug: "rykas" } });
    const todo = await db.executionTask.create({ data: { userId, domainId: rykas.id, title: "Confirm PO ledger", remainingMinutes: 60, dueDate: new Date("2026-11-26T07:00:00Z") } });

    const proposal = await proposeDay(userId, db, noCalendar, wed7am);
    const titles = proposal.items.map((item) => item.task.title);
    expect(titles).toEqual(expect.arrayContaining(["Confirm PO ledger", "eBay listing", "Slot hustle"]));
    const first = proposal.items.find((item) => item.task.id === todo.id);
    const ebay = proposal.items.find((item) => item.task.title === "eBay listing");
    const slots = proposal.items.find((item) => item.task.title === "Slot hustle");
    expect(first?.routine).toBeFalsy();
    expect(ebay?.routine).toBe(true);
    expect(ebay?.reason).toMatch(/^Routine · 0 of 5 this week/);
    expect(first!.slot.start.getTime()).toBeLessThanOrEqual(ebay!.slot.start.getTime());
    expect(slots!.slot.start.getTime()).toBeGreaterThanOrEqual(new Date("2026-11-26T01:00:00Z").getTime()); // 5 PM Pacific
    expect(timeOfDayWindow("EVENING", { workdayStartMin: 480, dayEndMin: 1260 })).toEqual({ startMin: 1020, endMin: 1260 });
  });

  it("planning tomorrow puts picked must-dos first, on that day", async () => {
    const work = await db.executionDomain.findFirstOrThrow({ where: { userId, slug: "work" } });
    const pick = await db.executionTask.create({ data: { userId, domainId: work.id, title: "Draft vendor timeline", remainingMinutes: 60 } });
    const tomorrow = new Date("2026-11-26T08:00:00Z"); // Thu Nov 26, 00:00 Pacific
    await materializeRoutines(userId, db, wed7am, { day: tomorrow });
    const copy = await db.executionTask.findFirst({ where: { userId, integrationSourceKey: { endsWith: ":2026-11-26" }, title: "eBay listing" } });
    expect(copy?.whenBucket).toBe("THIS_WEEK"); // not today's list
    const proposal = await proposeDay(userId, db, noCalendar, wed7am, { day: tomorrow, mustDo: [pick.id] });
    const placed = proposal.items.find((item) => item.task.id === pick.id);
    expect(placed?.reason).toBe("You picked it as a must-do");
    expect(placed!.slot.start.getTime()).toBeGreaterThanOrEqual(tomorrow.getTime());
    expect(proposal.items.some((item) => item.task.title === "eBay listing" && item.routine)).toBe(true);
  });

  it("check-ins from apps are not auto-planned unless committed for today", async () => {
    const ap = await db.executionDomain.findFirstOrThrow({ where: { userId, slug: "betting-models" } });
    const alert = await db.executionTask.create({ data: { userId, domainId: ap.id, title: "AP Trader: 1 arb leg still held", sourceSystem: "AP_TRADER", remainingMinutes: 15, dueDate: new Date("2026-11-25T23:00:00Z") } });
    const committed = await db.executionTask.create({ data: { userId, domainId: ap.id, title: "AP Trader: fee audit", sourceSystem: "AP_TRADER", remainingMinutes: 15, whenBucket: "TODAY" } });
    const proposal = await proposeDay(userId, db, noCalendar, wed7am);
    const ids = proposal.items.map((item) => item.task.id);
    expect(ids).not.toContain(alert.id);
    expect(ids).toContain(committed.id);
  });

  it("suggested routines are only added when asked, and never twice", async () => {
    const first = await addSuggestedRoutines(userId, ["walk", "slots"], db, wed7am);
    expect(first.added).toEqual(["Walk"]);
    expect(first.skipped).toEqual(["Slot hustle"]);
    const walk = await db.protectedRoutine.findFirstOrThrow({ where: { userId, title: "Walk" } });
    expect([walk.domainSlug, walk.durationMin]).toEqual(["health", 30]);
  });
});

describe("Field Book offers", () => {
  it("are not filed under a project per casino; the casino name goes in the title", async () => {
    const { flattenCasinoProject } = await import("@/server/v2/ingest");
    expect(flattenCasinoProject({ system: "CASINO_AP", title: "Use $50 free play", projectKey: "thunder-valley", projectName: "Casino AP: Thunder Valley" }))
      .toMatchObject({ title: "Thunder Valley: Use $50 free play", projectKey: undefined, projectName: undefined });
    expect(flattenCasinoProject({ system: "CASINO_AP", title: "Sky River: tier match", projectKey: "sky-river", projectName: "Sky River" }).title).toBe("Sky River: tier match");
    expect(flattenCasinoProject({ system: "EBAY", title: "Mark down", projectKey: "x", projectName: "Y" }).projectKey).toBe("x");
  });
});
