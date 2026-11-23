import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { proposeDay } from "@/server/v2/plan";
import { materializeRoutines, parseWeekdays, routinesForDay } from "@/server/v2/routines";
import { createV2TestDb } from "./helpers/v2-db";

const TZ = "America/Los_Angeles";
const pst = (iso: string) => new Date(`${iso}-08:00`);
const pdt = (iso: string) => new Date(`${iso}-07:00`);
let db: PrismaClient;
let userId: string;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, userId, cleanup } = await createV2TestDb("routines"));
}, 60_000);
afterAll(async () => cleanup());

describe("standard week rules", () => {
  it("parses weekdays and matches the local day", () => {
    expect(parseWeekdays("5, 1,1,9,x,0")).toEqual([0, 1, 5]);
    const routine = { id: "r", title: "Pickup", domainSlug: "family", weekdays: "1,2,3,4,5", startMin: 915, durationMin: 30, active: true };
    expect(routinesForDay([routine], pst("2026-11-23T09:00:00"), TZ)).toHaveLength(1); // Monday
    expect(routinesForDay([routine], pst("2026-11-22T09:00:00"), TZ)).toHaveLength(0); // Sunday
    // 11:30 PM Friday PT is Saturday in UTC: still Friday locally
    expect(routinesForDay([routine], pst("2026-11-20T23:30:00"), TZ)).toHaveLength(1);
  });
});

describe("placing routines", () => {
  it("places a fixed-time protected routine once, at the right local time, and displaces work there", async () => {
    const rykas = await db.executionDomain.findFirstOrThrow({ where: { userId, slug: "rykas" } });
    const work = await db.executionTask.create({ data: { userId, domainId: rykas.id, title: "List backlog", scheduledStart: pst("2026-11-23T15:00:00"), scheduledEnd: pst("2026-11-23T16:00:00"), remainingMinutes: 60 } });
    await db.protectedRoutine.create({ data: { userId, title: "School pickup", domainSlug: "family", weekdays: "1,2,3,4,5", startMin: 15 * 60 + 15, durationMin: 30 } });

    const now = pst("2026-11-23T08:00:00");
    await Promise.all([materializeRoutines(userId, db, now), materializeRoutines(userId, db, now)]);
    await materializeRoutines(userId, db, now);
    const pickups = await db.executionTask.findMany({ where: { userId, title: "School pickup" } });
    expect(pickups).toHaveLength(1);
    expect(pickups[0].scheduledStart?.toISOString()).toBe(pst("2026-11-23T15:15:00").toISOString());
    const moved = await db.executionTask.findUniqueOrThrow({ where: { id: work.id } });
    expect(moved).toMatchObject({ scheduledStart: null, whenBucket: "TODAY", remainingMinutes: 60 });

    // dropped instance is not recreated the same day
    await db.executionTask.update({ where: { id: pickups[0].id }, data: { status: "DROPPED" } });
    await materializeRoutines(userId, db, pst("2026-11-23T12:00:00"));
    expect(await db.executionTask.count({ where: { userId, title: "School pickup" } })).toBe(1);
    // next day gets its own
    await materializeRoutines(userId, db, pst("2026-11-24T08:00:00"));
    expect(await db.executionTask.count({ where: { userId, title: "School pickup" } })).toBe(2);
  });

  it("keeps the local time across the DST change", async () => {
    await db.protectedRoutine.create({ data: { userId, title: "Morning walk", domainSlug: "health", weekdays: "0,1,2,3,4,5,6", startMin: 7 * 60, durationMin: 30 } });
    await materializeRoutines(userId, db, pdt("2026-10-30T06:00:00"));
    await materializeRoutines(userId, db, pst("2026-11-02T06:00:00"));
    const walks = await db.executionTask.findMany({ where: { userId, title: "Morning walk" }, orderBy: { scheduledStart: "asc" } });
    expect(walks.map((walk) => walk.scheduledStart?.toISOString())).toEqual([pdt("2026-10-30T07:00:00").toISOString(), pst("2026-11-02T07:00:00").toISOString()]);
  });

  it("an any-time routine is planned into a free gap after to-dos", async () => {
    await db.protectedRoutine.create({ data: { userId, title: "Workout", domainSlug: "health", weekdays: "3", startMin: null, durationMin: 45 } });
    const wednesday = pst("2026-11-25T08:00:00");
    await materializeRoutines(userId, db, wednesday);
    const workout = await db.executionTask.findFirstOrThrow({ where: { userId, title: "Workout" } });
    expect(workout).toMatchObject({ scheduledStart: null, whenBucket: "TODAY", remainingMinutes: 45 });
    const plan = await proposeDay(userId, db, async () => [], wednesday);
    const placed = plan.items.find((item) => item.task.id === workout.id);
    expect(placed?.routine).toBe(true);
    expect(placed?.reason).toMatch(/^Routine · 0 of 1 this week/);
  });

  it("paused routines are not placed", async () => {
    await db.protectedRoutine.create({ data: { userId, title: "Paused thing", domainSlug: "health", weekdays: "4", startMin: 600, durationMin: 30, active: false } });
    await materializeRoutines(userId, db, pst("2026-11-26T08:00:00"));
    expect(await db.executionTask.count({ where: { userId, title: "Paused thing" } })).toBe(0);
  });
});
