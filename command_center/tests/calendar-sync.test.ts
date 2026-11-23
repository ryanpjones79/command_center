import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { decide, eventIdFor, syncCalendar, taskIdFromEventId, type BlockBody, type GoogleBlock, type GoogleBlockApi, type SyncTask } from "@/server/v2/calendar-sync";
import { toCalendarEvents } from "@/server/google-calendar-service";
import { createV2TestDb } from "./helpers/v2-db";

const t = (iso: string) => new Date(iso);
const task = (over: Partial<SyncTask> = {}): SyncTask => ({
  id: "task1", title: "Write gift list", status: "NOT_STARTED", scheduledStart: t("2026-11-24T17:00:00Z"), scheduledEnd: t("2026-11-24T17:30:00Z"),
  updatedAt: t("2026-11-23T10:00:00Z"), projectName: null, ...over
});
const event = (over: Partial<GoogleBlock> = {}): GoogleBlock => ({
  eventId: eventIdFor("task1"), taskId: "task1", cancelled: false, start: t("2026-11-24T17:00:00Z"), end: t("2026-11-24T17:30:00Z"),
  summary: "Write gift list", updated: t("2026-11-23T10:00:01Z"), ...over
});

describe("calendar sync rules (pure)", () => {
  it("event ids are fixed, valid for Google and reversible", () => {
    const id = eventIdFor("cmabc123xyz");
    expect(id).toMatch(/^[a-v0-9]{5,1024}$/);
    expect(taskIdFromEventId(id)).toBe("cmabc123xyz");
    expect(taskIdFromEventId("someoneelse")).toBeNull();
  });

  it("new or changed RyanOS blocks are pushed; matching ones are left alone", () => {
    expect(decide(task(), null)).toEqual({ type: "PUSH" });
    expect(decide(task(), event())).toEqual({ type: "NONE" });
    expect(decide(task({ title: "Write gift list for kids" }), event())).toEqual({ type: "PUSH" });
    const movedInRyanOs = task({ scheduledStart: t("2026-11-24T18:00:00Z"), scheduledEnd: t("2026-11-24T18:30:00Z"), updatedAt: t("2026-11-23T11:00:00Z") });
    expect(decide(movedInRyanOs, event())).toEqual({ type: "PUSH" });
  });

  it("a block moved or deleted in Google moves or unschedules the task, when Google's edit is later", () => {
    const moved = event({ start: t("2026-11-25T16:00:00Z"), end: t("2026-11-25T17:00:00Z"), updated: t("2026-11-23T12:00:00Z") });
    expect(decide(task(), moved)).toEqual({ type: "PULL", start: moved.start, end: moved.end });
    expect(decide(task(), event({ cancelled: true, updated: t("2026-11-23T12:00:00Z") }))).toEqual({ type: "UNSCHEDULE" });
    // Rescheduled in RyanOS after it was deleted in Google: put it back.
    expect(decide(task({ updatedAt: t("2026-11-23T13:00:00Z") }), event({ cancelled: true, updated: t("2026-11-23T12:00:00Z") }))).toEqual({ type: "PUSH" });
  });

  it("unscheduled or dropped tasks lose their event; done tasks keep it", () => {
    expect(decide(task({ scheduledStart: null, scheduledEnd: null, updatedAt: t("2026-11-23T12:00:00Z") }), event())).toEqual({ type: "DELETE_EVENT" });
    expect(decide(task({ status: "DROPPED", updatedAt: t("2026-11-23T12:00:00Z") }), event())).toEqual({ type: "DELETE_EVENT" });
    expect(decide(task({ status: "DONE" }), event())).toEqual({ type: "NONE" });
    expect(decide(null, event())).toEqual({ type: "DELETE_EVENT" });
  });

  it("RyanOS blocks in Google are not read back as meetings", () => {
    const items = [
      { id: "m1", summary: "Standup", start: { dateTime: "2026-11-24T16:00:00Z" }, end: { dateTime: "2026-11-24T16:15:00Z" } },
      { id: eventIdFor("task1"), summary: "Write gift list", start: { dateTime: "2026-11-24T17:00:00Z" }, end: { dateTime: "2026-11-24T17:30:00Z" }, extendedProperties: { private: { ryanosTaskId: "task1" } } }
    ];
    expect(toCalendarEvents(items).map((item) => item.id)).toEqual(["m1"]);
  });
});

class FakeCalendar implements GoogleBlockApi {
  events = new Map<string, GoogleBlock>();
  clock = t("2026-11-23T10:00:00Z");
  async list() { return [...this.events.values()]; }
  async upsert(eventId: string, body: BlockBody) {
    this.events.set(eventId, { eventId, taskId: body.taskId, cancelled: false, start: body.start, end: body.end, summary: body.summary, updated: new Date() });
  }
  async remove(eventId: string) {
    const current = this.events.get(eventId);
    if (current) this.events.set(eventId, { ...current, cancelled: true, updated: new Date() });
  }
}

describe("calendar sync against the database", () => {
  let db: PrismaClient;
  let userId: string;
  let cleanup: () => Promise<void>;
  beforeAll(async () => ({ db, userId, cleanup } = await createV2TestDb("calsync")), 60_000);
  afterAll(async () => cleanup());

  it("pushes, follows a move made in Google, and clears a dropped block", async () => {
    const now = new Date();
    const start = new Date(now.getTime() + 2 * 3_600_000);
    const domain = await db.executionDomain.findFirstOrThrow({ where: { userId, slug: "admin" } });
    const created = await db.executionTask.create({ data: { userId, domainId: domain.id, title: "Call the bank", scheduledStart: start, scheduledEnd: new Date(start.getTime() + 30 * 60_000) } });
    const google = new FakeCalendar();

    expect(await syncCalendar(userId, db, { api: google, force: true, now })).toMatchObject({ ok: true, pushed: 1 });
    expect(await syncCalendar(userId, db, { api: google, force: true, now })).toMatchObject({ ok: true, pushed: 0, pulled: 0 });

    const id = eventIdFor(created.id);
    const later = new Date(start.getTime() + 3_600_000);
    await new Promise((resolve) => setTimeout(resolve, 5));
    google.events.set(id, { ...(google.events.get(id) as GoogleBlock), start: later, end: new Date(later.getTime() + 45 * 60_000), updated: new Date(Date.now() + 1000) });
    expect(await syncCalendar(userId, db, { api: google, force: true, now })).toMatchObject({ pulled: 1 });
    const moved = await db.executionTask.findUniqueOrThrow({ where: { id: created.id } });
    expect([moved.scheduledStart?.getTime(), moved.remainingMinutes]).toEqual([later.getTime(), 45]);

    await db.executionTask.update({ where: { id: created.id }, data: { status: "DROPPED", scheduledStart: null, scheduledEnd: null } });
    expect(await syncCalendar(userId, db, { api: google, force: true, now })).toMatchObject({ deleted: 1 });
    expect(google.events.get(id)?.cancelled).toBe(true);
  });

  it("a Google failure is recorded and does not throw", async () => {
    const broken: GoogleBlockApi = { list: async () => { throw Object.assign(new Error("no"), { code: 403 }); }, upsert: async () => undefined, remove: async () => undefined };
    const result = await syncCalendar(userId, db, { api: broken, force: true });
    expect(result).toMatchObject({ ok: false });
    expect(result.error).toMatch(/calendar edit access/);
    const record = await db.sourceSync.findUniqueOrThrow({ where: { userId_sourceSystem: { userId, sourceSystem: "GOOGLE_CALENDAR" } } });
    expect(record.status).toBe("FAILING");
  });

  it("is off unless switched on", async () => {
    expect(await syncCalendar(userId, db, {})).toMatchObject({ enabled: false, ok: true });
  });
});
