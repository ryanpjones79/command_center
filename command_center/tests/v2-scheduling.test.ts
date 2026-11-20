import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { placeItem, type BusyBlock, type DaySettings } from "@/lib/v2/scheduler";
import { extendAction, interruptAction, postponeAction, scheduleAction, type CalendarLoader } from "@/server/v2/schedule-service";
import { createV2TestDb } from "./helpers/v2-db";

const TZ = "America/Los_Angeles";
const settings: DaySettings = { timeZone: TZ, workdayStartMin: 480, workdayEndMin: 1050, dayEndMin: 1260, bufferMinutes: 30 };
const pt = (iso: string) => new Date(`${iso}-08:00`); // PST wall time
const FRI_9 = pt("2026-11-20T09:00:00");

function block(id: string, start: string, end: string, kind: BusyBlock["kind"] = "COMMITTED", movable = true): BusyBlock {
  return { id, title: id, start: pt(start), end: pt(end), kind, movable: kind === "COMMITTED" ? movable : false };
}

describe("placement rules (pure)", () => {
  it("10: avoids meetings and protected family/health time", () => {
    const busy = [block("standup", "2026-11-20T09:00:00", "2026-11-20T10:00:00", "MEETING"), block("gym", "2026-11-20T10:00:00", "2026-11-20T11:00:00", "PROTECTED")];
    const result = placeItem({ minutes: 45, workContext: "DESK", dueAt: null, expiresAt: null, earliest: FRI_9 }, busy, settings);
    expect(result.type).toBe("SLOT");
    if (result.type === "SLOT") expect(result.slot.start.toISOString()).toBe(pt("2026-11-20T11:00:00").toISOString());
  });

  it("10: desk work stays in work hours and skips the weekend; home work goes to the evening", () => {
    const lateFri = pt("2026-11-20T17:20:00");
    const desk = placeItem({ minutes: 60, workContext: "DESK", dueAt: null, expiresAt: null, earliest: lateFri }, [], settings);
    expect(desk.type === "SLOT" && desk.slot.start.toISOString()).toBe(pt("2026-11-23T08:00:00").toISOString()); // Monday
    const home = placeItem({ minutes: 30, workContext: "HOME", dueAt: null, expiresAt: null, earliest: FRI_9 }, [], settings);
    expect(home.type === "SLOT" && home.slot.start.toISOString()).toBe(pt("2026-11-20T17:30:00").toISOString());
  });

  it("10: errands get store hours and travel time around neighbouring blocks", () => {
    const busy = [block("call", "2026-11-20T09:00:00", "2026-11-20T09:30:00", "MEETING")];
    const result = placeItem({ minutes: 45, workContext: "ERRAND", dueAt: null, expiresAt: null, earliest: FRI_9 }, busy, settings);
    expect(result.type === "SLOT" && result.slot.start.toISOString()).toBe(pt("2026-11-20T09:45:00").toISOString());
  });

  it("10: never schedules past the deadline; shows what would be displaced instead", () => {
    const busy = [
      block("meeting", "2026-11-20T09:00:00", "2026-11-20T10:00:00", "MEETING"),
      block("listing-batch", "2026-11-20T10:00:00", "2026-11-20T11:00:00", "COMMITTED", true)
    ];
    const result = placeItem({ minutes: 60, workContext: "DESK", dueAt: pt("2026-11-20T11:00:00"), expiresAt: null, earliest: FRI_9 }, busy, settings);
    expect(result.type).toBe("CONFLICT");
    if (result.type === "CONFLICT") {
      expect(result.displace?.displaced.map((b) => b.id)).toEqual(["listing-batch"]);
      expect(result.displace?.slot.end.getTime()).toBeLessThanOrEqual(pt("2026-11-20T11:00:00").getTime());
    }
  });

  it("10: protected time is never offered for displacement", () => {
    const busy = [block("meeting", "2026-11-20T09:00:00", "2026-11-20T10:00:00", "MEETING"), block("pickup", "2026-11-20T10:00:00", "2026-11-20T11:00:00", "PROTECTED")];
    const result = placeItem({ minutes: 60, workContext: "DESK", dueAt: pt("2026-11-20T11:00:00"), expiresAt: null, earliest: FRI_9 }, busy, settings);
    expect(result.type === "CONFLICT" && result.displace).toBeNull();
  });

  it("12: an expired offer can't be scheduled for later", () => {
    const result = placeItem({ minutes: 30, workContext: null, dueAt: null, expiresAt: pt("2026-11-20T08:00:00"), earliest: FRI_9 }, [], settings);
    expect(result.type).toBe("EXPIRED");
  });

  it("prefers keeping today's interruption buffer free", () => {
    const busy = [block("long", "2026-11-20T09:00:00", "2026-11-20T16:45:00", "MEETING")];
    const result = placeItem({ minutes: 30, workContext: "DESK", dueAt: null, expiresAt: null, earliest: FRI_9 }, busy, settings);
    expect(result.type === "SLOT" && result.slot.start.toISOString()).toBe(pt("2026-11-23T08:00:00").toISOString());
  });
});

let db: PrismaClient;
let userId: string;
let cleanup: () => Promise<void>;
const noCalendar: CalendarLoader = async () => [];

beforeAll(async () => {
  ({ db, userId, cleanup } = await createV2TestDb("scheduling"));
}, 60_000);
afterAll(async () => cleanup());

async function newTask(title: string, data: Record<string, unknown> = {}) {
  const domain = await db.executionDomain.findFirstOrThrow({ where: { userId, slug: "rykas" } });
  return db.executionTask.create({ data: { userId, domainId: domain.id, title, remainingMinutes: 60, workContext: "DESK", ...data } });
}

describe("server-side scheduling", () => {
  it("10: concurrent scheduling requests never overlap", async () => {
    const a = await newTask("A");
    const b = await newTask("B");
    const [ra, rb] = await Promise.all([scheduleAction(userId, a.id, db, noCalendar, { now: FRI_9 }), scheduleAction(userId, b.id, db, noCalendar, { now: FRI_9 })]);
    expect(ra.type).toBe("BOOKED");
    expect(rb.type).toBe("BOOKED");
    const rows = await db.executionTask.findMany({ where: { id: { in: [a.id, b.id] } }, orderBy: { scheduledStart: "asc" } });
    expect(rows[0].scheduledEnd!.getTime()).toBeLessThanOrEqual(rows[1].scheduledStart!.getTime());
  });

  it("2: a repeated scheduling submission keeps one booking", async () => {
    const c = await newTask("C");
    await scheduleAction(userId, c.id, db, noCalendar, { now: FRI_9 });
    const first = await db.executionTask.findUniqueOrThrow({ where: { id: c.id } });
    await scheduleAction(userId, c.id, db, noCalendar, { now: FRI_9 });
    const again = await db.executionTask.findUniqueOrThrow({ where: { id: c.id } });
    expect(await db.executionTask.count({ where: { userId, title: "C" } })).toBe(1);
    expect(again.scheduledStart?.getTime()).toBe(first.scheduledStart?.getTime());
  });

  it("10: the calendar's meetings block placement", async () => {
    const d = await newTask("D", { remainingMinutes: 30 });
    const calendar: CalendarLoader = async () => [{ title: "Leadership sync", start: pt("2026-11-23T08:00:00"), end: pt("2026-11-23T12:00:00") }];
    const monday8 = pt("2026-11-23T08:00:00");
    const result = await scheduleAction(userId, d.id, db, calendar, { now: monday8 });
    expect(result.type === "BOOKED" && result.slot.start.toISOString()).toBe(pt("2026-11-23T12:00:00").toISOString());
  });

  it("11: extending into the next block is refused with the conflict named; interruption keeps the remainder", async () => {
    const e = await newTask("E", { scheduledStart: pt("2026-11-24T09:00:00"), scheduledEnd: pt("2026-11-24T10:00:00"), remainingMinutes: 60 });
    await newTask("Next thing", { scheduledStart: pt("2026-11-24T10:00:00"), scheduledEnd: pt("2026-11-24T11:00:00") });
    const ext = await extendAction(userId, e.id, 15, db, noCalendar, pt("2026-11-24T09:55:00"));
    expect(ext.type).toBe("CONFLICT");
    if (ext.type === "CONFLICT") expect(ext.message).toContain("Next thing");
    const interrupted = await interruptAction(userId, e.id, db, null, pt("2026-11-24T09:20:00"));
    expect(interrupted.remainingMinutes).toBe(40);
    const row = await db.executionTask.findUniqueOrThrow({ where: { id: e.id } });
    expect(row).toMatchObject({ scheduledStart: null, remainingMinutes: 40, whenBucket: "TODAY" });
  });

  it("10/11: displacing needs the exact confirmed set and keeps the moved block's work", async () => {
    const urgent = await newTask("Urgent", { remainingMinutes: 60, dueDate: pt("2026-11-25T10:00:00") });
    const movable = await newTask("Movable", { scheduledStart: pt("2026-11-25T09:00:00"), scheduledEnd: pt("2026-11-25T10:00:00") });
    const now = pt("2026-11-25T09:00:00");
    const preview = await scheduleAction(userId, urgent.id, db, noCalendar, { now });
    expect(preview.type).toBe("CONFLICT");
    const wrong = await scheduleAction(userId, urgent.id, db, noCalendar, { now, displaceIds: ["someone-else"] });
    expect(wrong.type).toBe("STALE");
    const booked = await scheduleAction(userId, urgent.id, db, noCalendar, { now, displaceIds: [movable.id] });
    expect(booked.type === "BOOKED" && booked.displacedIds).toEqual([movable.id]);
    const moved = await db.executionTask.findUniqueOrThrow({ where: { id: movable.id } });
    expect(moved).toMatchObject({ scheduledStart: null, remainingMinutes: 60, whenBucket: "TODAY" });
  });

  it("13: postponed and parked items return on a valid future review date; the 3rd postponement asks", async () => {
    const f = await newTask("F");
    await postponeAction(userId, f.id, "TOMORROW", db, { now: FRI_9 });
    await postponeAction(userId, f.id, "THIS_WEEK", db, { now: FRI_9 });
    const third = await postponeAction(userId, f.id, "REVIEW", db, { now: FRI_9 });
    expect(third.stillWorthIt).toBe(true);
    const row = await db.executionTask.findUniqueOrThrow({ where: { id: f.id } });
    expect(row.followUpDate?.toISOString()).toBe(pt("2026-11-27T08:00:00").toISOString());
    const g = await newTask("G");
    await postponeAction(userId, g.id, "PARK", db, { now: pt("2026-10-26T09:00:00") });
    const parked = await db.executionTask.findUniqueOrThrow({ where: { id: g.id } });
    expect(parked.followUpDate?.toISOString()).toBe(pt("2026-11-25T08:00:00").toISOString()); // across DST, still 8:00 local
  });
});
