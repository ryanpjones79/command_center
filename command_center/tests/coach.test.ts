import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { coachPushWorthy, loadCoach } from "@/server/v2/coach";
import { nextCoachNudge } from "@/server/now/run-alerts";
import { createHabit } from "@/server/v2/habits";
import { materializeRoutines } from "@/server/v2/routines";
import { createV2TestDb } from "./helpers/v2-db";

let db: PrismaClient;
let userId: string;
let cleanup: () => Promise<void>;
beforeAll(async () => ({ db, userId, cleanup } = await createV2TestDb("coach")), 60_000);
afterAll(async () => cleanup());

const noCalendar = async () => [];
const pst = (local: string) => new Date(`${local}-08:00`);

describe("coach", () => {
  it("morning with nothing planned asks to plan the day", async () => {
    const coach = await loadCoach(userId, db, noCalendar, pst("2026-11-25T08:00:00"));
    expect(coach?.kind).toBe("MORNING");
    expect(coachPushWorthy(coach)).toBe(true);
  });

  it("a free gap suggests pinned to-dos first, then routines furthest behind", async () => {
    const work = await db.executionDomain.findFirstOrThrow({ where: { userId, slug: "work" } });
    await createHabit(userId, { title: "eBay listing", area: "rykas", weekdays: [1, 2, 3, 4, 5], minutes: 45 }, db, pst("2026-11-25T06:00:00"));
    await materializeRoutines(userId, db, pst("2026-11-25T06:00:00"));
    const pinned = await db.executionTask.create({ data: { userId, domainId: work.id, title: "Draft vendor timeline", whenBucket: "TODAY", remainingMinutes: 60 } });
    // Gymnastics at 4:15 on the calendar.
    const calendar = async () => [{ title: "Rylie gymnastics", start: pst("2026-11-25T16:15:00"), end: pst("2026-11-25T17:45:00") }];
    const coach = await loadCoach(userId, db, calendar, pst("2026-11-25T14:30:00"));
    expect(coach?.kind).toBe("GAP");
    if (coach?.kind !== "GAP") return;
    expect(coach.until).toBe("4:15 PM");
    expect(coach.options[0]).toMatchObject({ taskId: pinned.id, why: "pinned for today", minutes: 60 });
    expect(coach.options.some((option) => option.title === "eBay listing" && option.routine)).toBe(true);
    expect(coach.text).toBe("You're free until 4:15 PM. Draft vendor timeline for 1h?");
  });

  it("a block that just ended asks if it's done; inside a block it stays quiet", async () => {
    const work = await db.executionDomain.findFirstOrThrow({ where: { userId, slug: "work" } });
    const block = await db.executionTask.create({ data: { userId, domainId: work.id, title: "Ship orders", scheduledStart: pst("2026-11-26T10:00:00"), scheduledEnd: pst("2026-11-26T11:00:00") } });
    expect(await loadCoach(userId, db, noCalendar, pst("2026-11-26T10:30:00"))).toMatchObject({ kind: "NOW", taskId: block.id });
    expect(await loadCoach(userId, db, noCalendar, pst("2026-11-26T11:10:00"))).toMatchObject({ kind: "ENDED", taskId: block.id });
    expect(coachPushWorthy(await loadCoach(userId, db, noCalendar, pst("2026-11-26T10:30:00")))).toBe(false);
  });

  it("evening suggests the wrap-up", async () => {
    expect((await loadCoach(userId, db, noCalendar, pst("2026-11-27T20:30:00")))?.kind).toBe("EVENING");
  });

  it("phone nudges: never in quiet hours, once per message, at most one an hour", async () => {
    const quiet = await nextCoachNudge(db, userId, pst("2026-11-27T22:00:00"), "America/Los_Angeles", 21 * 60 + 30, 6 * 60 + 30, noCalendar);
    expect(quiet).toBeNull();
    const at = pst("2026-11-27T20:30:00");
    const nudge = await nextCoachNudge(db, userId, at, "America/Los_Angeles", 21 * 60 + 30, 6 * 60 + 30, noCalendar);
    expect(nudge?.title).toBe("Wrap up today?");
    await db.alertDelivery.create({ data: { userId, key: nudge!.key, kind: "coach", status: "SENT", sentAt: at } });
    expect(await nextCoachNudge(db, userId, new Date(at.getTime() + 20 * 60_000), "America/Los_Angeles", 21 * 60 + 30, 6 * 60 + 30, noCalendar)).toBeNull();
  });
});
