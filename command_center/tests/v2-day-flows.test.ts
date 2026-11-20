import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createCapture, nextReviewTime, undoCapture } from "@/server/v2/capture";
import { loadDay, recommendNow } from "@/server/v2/day";
import { acceptPlan, proposeDay } from "@/server/v2/plan";
import type { CalendarLoader } from "@/server/v2/schedule-service";
import { batchCapturesForReview, buildShutdown, closeDay } from "@/server/v2/shutdown";
import { triageItem } from "@/server/v2/triage";
import { createV2TestDb } from "./helpers/v2-db";

const pt = (iso: string) => new Date(`${iso}-08:00`);
const MON_9 = pt("2026-11-23T09:00:00");
const TZ = "America/Los_Angeles";
let db: PrismaClient;
let userId: string;
let cleanup: () => Promise<void>;
const meetingAt10: CalendarLoader = async () => [{ title: "Leadership sync", start: pt("2026-11-23T10:00:00"), end: pt("2026-11-23T11:00:00") }];

beforeAll(async () => {
  ({ db, userId, cleanup } = await createV2TestDb("dayflows"));
}, 60_000);
afterAll(async () => cleanup());

async function domainId(slug: string) {
  return (await db.executionDomain.findFirstOrThrow({ where: { userId, slug } })).id;
}

describe("capture", () => {
  it("15: saves one item per line with a dated review, survives reload, and supports undo", async () => {
    const receipt = await createCapture(userId, { text: "Call Level Brands about MOQ\nReturn permission slip" }, db, MON_9);
    expect(receipt.ok).toBe(true);
    if (!receipt.ok) return;
    const rows = await db.executionTask.findMany({ where: { id: { in: receipt.taskIds } } });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.needsJudgment && row.followUpDate?.toISOString() === pt("2026-11-23T17:30:00").toISOString())).toBe(true);
    expect(receipt.reviewLabel).toBe("Mon 5:30 PM");
    const undone = await undoCapture(userId, receipt.taskIds, db, new Date(MON_9.getTime() + 60_000));
    expect(undone.removed).toBe(2);
    const late = await createCapture(userId, { text: "Too late to undo" }, db, MON_9);
    if (late.ok) expect((await undoCapture(userId, late.taskIds, db, new Date(MON_9.getTime() + 20 * 60_000))).ok).toBe(false);
  });

  it("15: refuses PHI and empty input honestly; evening captures return next morning", async () => {
    expect(await createCapture(userId, { text: "" }, db, MON_9)).toMatchObject({ ok: false });
    const phi = await createCapture(userId, { text: "Patient Jane Doe DOB 02/03/1971 MRN 7654321" }, db, MON_9);
    expect(phi.ok).toBe(false);
    expect(nextReviewTime(pt("2026-11-23T19:00:00"), TZ, 480, 1050).toISOString()).toBe(pt("2026-11-24T08:00:00").toISOString());
  });

  it("stores a photo with its original bytes and rejects oversized or wrong types", async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    const ok = await createCapture(userId, { photo: { mimeType: "image/jpeg", bytes }, locationNote: "Kitchen folder" }, db, MON_9);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      const file = await db.captureAttachment.findFirstOrThrow({ where: { taskId: ok.taskIds[0] } });
      expect(Buffer.from(file.data).equals(Buffer.from(bytes))).toBe(true);
      expect(file.locationNote).toBe("Kitchen folder");
    }
    expect((await createCapture(userId, { photo: { mimeType: "application/pdf", bytes } }, db, MON_9)).ok).toBe(false);
  });
});

describe("triage", () => {
  it("keeps the event date separate from the action deadline and the same task identity", async () => {
    const receipt = await createCapture(userId, { text: "Field trip form" }, db, MON_9);
    if (!receipt.ok) throw new Error("capture failed");
    const [id] = receipt.taskIds;
    await triageItem(userId, id, { decision: "THIS_WEEK", title: "Return field-trip permission slip", area: "KIDS", dueDate: "2026-11-25", eventDate: "2026-11-27" }, db, MON_9);
    const row = await db.executionTask.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ title: "Return field-trip permission slip", needsJudgment: false, whenBucket: "THIS_WEEK" });
    expect(row.dueDate?.toISOString()).toBe(pt("2026-11-25T17:30:00").toISOString());
    expect(row.note).toContain("Event: 2026-11-27");
    expect(row.domainId).toBe(await domainId("family"));
  });

  it("13: someday and waiting items return on a valid future review date; reference stays searchable", async () => {
    const receipt = await createCapture(userId, { text: "Idea one\nIdea two\nIdea three" }, db, MON_9);
    if (!receipt.ok) throw new Error("capture failed");
    const [a, b, c] = receipt.taskIds;
    await triageItem(userId, a, { decision: "SOMEDAY" }, db, MON_9);
    await triageItem(userId, b, { decision: "WAITING", waitingOn: "Supplier rep", followUpDate: "2026-11-26" }, db, MON_9);
    await triageItem(userId, c, { decision: "REFERENCE", area: "RYKAS" }, db, MON_9);
    expect((await db.executionTask.findUniqueOrThrow({ where: { id: a } })).followUpDate?.toISOString()).toBe(pt("2026-12-23T08:00:00").toISOString());
    expect(await db.executionTask.findUniqueOrThrow({ where: { id: b } })).toMatchObject({ status: "WAITING", waitingOn: "Supplier rep" });
    expect(await db.parkedIdea.count({ where: { userId, status: "note", idea: { contains: "Idea three" } } })).toBe(1);
    expect((await triageItem(userId, a, { decision: "THIS_WEEK", dueDate: "2026-11-01" }, db, MON_9)).ok).toBe(false);
  });
});

describe("morning plan, recovery and shutdown", () => {
  it("proposes protected and due work around meetings, then books it once", async () => {
    await db.executionTask.create({ data: { userId, domainId: await domainId("health"), title: "Workout", whenBucket: "TODAY", remainingMinutes: 60 } });
    await db.executionTask.create({ data: { userId, domainId: await domainId("rykas"), title: "Approve PO", whenBucket: "TODAY", remainingMinutes: 30, workContext: "DESK", dueDate: pt("2026-11-23T15:00:00") } });
    const proposal = await proposeDay(userId, db, meetingAt10, MON_9);
    const titles = proposal.items.map((item) => item.task.title);
    expect(titles).toEqual(expect.arrayContaining(["Workout", "Approve PO"]));
    for (const item of proposal.items) {
      expect(item.slot.end <= pt("2026-11-23T10:00:00") || item.slot.start >= pt("2026-11-23T11:00:00")).toBe(true);
    }
    const accepted = proposal.items.map((item) => ({ taskId: item.task.id, start: item.slot.start.toISOString(), end: item.slot.end.toISOString() }));
    const first = await acceptPlan(userId, db, accepted);
    const second = await acceptPlan(userId, db, accepted);
    expect(first.booked.length).toBe(accepted.length);
    expect(second.booked).toHaveLength(0);
  });

  it("12/14: ended work and expired offers stay visible; shutdown batches captures without triage", async () => {
    await db.executionTask.create({ data: { userId, domainId: await domainId("rykas"), title: "Missed block", scheduledStart: pt("2026-11-23T08:00:00"), scheduledEnd: pt("2026-11-23T08:30:00"), whenBucket: "TODAY" } });
    await db.executionTask.create({ data: { userId, domainId: await domainId("casino-ap"), title: "Free play offer", expiresAt: pt("2026-11-23T08:45:00") } });
    const evening = pt("2026-11-23T18:00:00");
    const model = await loadDay(userId, db, async () => [], evening);
    expect(model.endedOpen.map((task) => task.title)).toContain("Missed block");
    expect(model.expired.map((task) => task.title)).toContain("Free play offer");
    const shutdown = buildShutdown(model);
    expect(shutdown.canClose).toBe(false);
    expect((await closeDay(userId, db, shutdown, evening)).ok).toBe(false);
    expect(shutdown.newCaptures.length).toBeGreaterThan(0);
    const batch = await batchCapturesForReview(userId, db, "2026-11-25", evening);
    expect(batch.ok).toBe(true);
    expect(batch.reviewAt?.toISOString()).toBe(pt("2026-11-25T08:00:00").toISOString());
    const stillThere = await db.executionTask.count({ where: { userId, needsJudgment: true, followUpDate: batch.reviewAt! } });
    expect(stillThere).toBe(batch.count);
  });

  it("recommends one feasible thing for free time, or nothing", async () => {
    const model = await loadDay(userId, db, async () => [], pt("2026-11-23T13:00:00"));
    const pick = recommendNow(model);
    if (pick) expect(pick.minutes).toBeLessThanOrEqual(8 * 60);
  });
});
