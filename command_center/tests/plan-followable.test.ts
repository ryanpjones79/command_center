import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { freeGaps, isOptionalEvent, optionalWords, respectsWorkHours, workWindows } from "@/lib/v2/availability";
import { shortTitle } from "@/lib/v2/short-title";
import { loadBoard } from "@/server/v2/board";
import { loadDay } from "@/server/v2/day";
import { ingestSourceEvents, splitTitle } from "@/server/v2/ingest";
import { completeAction } from "@/server/v2/outcomes";
import { MAX_COMMITMENTS, MAX_EXTRAS, proposeDay } from "@/server/v2/plan";
import { bookSlot, scheduleAction } from "@/server/v2/schedule-service";
import { createV2TestDb } from "./helpers/v2-db";

let db: PrismaClient;
let userId: string;
let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db, userId, cleanup } = await createV2TestDb("followable"));
  await db.userSettings.create({ data: { userId, timeZone: "America/Los_Angeles", workdayStartMin: 480, workdayEndMin: 1050, dayEndMin: 1260, bufferMinutes: 30 } });
  await db.executionDomain.create({ data: { userId, name: "Upwork & opportunities", slug: "opportunities" } });
}, 60_000);
afterAll(async () => cleanup());

const PT = (hour: number, minute = 0) => new Date(Date.UTC(2026, 10, 25, hour + 8, minute)); // Wed Nov 25, Pacific
const noCalendar = async () => [];
const settings = { timeZone: "America/Los_Angeles", workdayStartMin: 480, workdayEndMin: 1050 };

describe("availability rules", () => {
  it("optional events, work hours and gaps", () => {
    expect(isOptionalEvent({ title: "Kings vs Ducks" })).toBe(true);
    expect(isOptionalEvent({ title: "Warriors @ Lakers" })).toBe(true);
    expect(isOptionalEvent({ title: "Dentist" })).toBe(false);
    expect(isOptionalEvent({ title: "Dentist", showAsFree: true })).toBe(true);
    expect(optionalWords({ RYANOS_OPTIONAL_EVENT_WORDS: "" })).toEqual([]);
    const windows = workWindows(PT(0), PT(23, 59), settings);
    expect(windows.map((window) => [new Date(window.start).toISOString(), new Date(window.end).toISOString()])).toEqual([[PT(8).toISOString(), PT(17, 30).toISOString()]]);
    expect(workWindows(new Date("2026-11-28T08:00:00Z"), new Date("2026-11-29T07:59:00Z"), settings)).toEqual([]); // Saturday
    expect(respectsWorkHours("rykas", null)).toBe(true);
    expect(respectsWorkHours("work", null)).toBe(false);
    expect(respectsWorkHours("admin", "PHONE")).toBe(false);
    expect(freeGaps([{ start: 10, end: 20 }], 0, 30 * 60_000, 0).length).toBeGreaterThan(0);
  });
  it("short titles keep the first sentence or line, cut at a word", () => {
    const report = "AP Trader status: maker not ready for 10+ minutes. Last heartbeat 09:12, queue depth 14, retries 3, venue latency elevated, see runbook section 4.2 for details.";
    expect(shortTitle(report)).toBe("AP Trader status: maker not ready for 10+ minutes.");
    expect(shortTitle("Line one\nline two")).toBe("Line one");
    expect(shortTitle("Call Gold River")).toBe("Call Gold River");
    expect(splitTitle({ title: report, details: null })).toEqual({ title: shortTitle(report, 90), details: report });
  });
});

describe("a day Ryan would follow", () => {
  it("up to three commitments, extras unticked, buffer and work hours respected, optional events don't block", async () => {
    const rykas = await db.executionDomain.findFirstOrThrow({ where: { userId, slug: "rykas" } });
    const work = await db.executionDomain.findFirstOrThrow({ where: { userId, slug: "work" } });
    const project = await db.executionProject.create({ data: { userId, domainId: rykas.id, name: "Rykas: top-20 restock" } });
    const weekOf = new Date("2026-11-23T08:00:00Z"); // Monday 00:00 Pacific
    await db.projectAttention.create({ data: { userId, projectId: project.id, weekOf, plannedMinutes: 120 } });
    const pinned = await db.executionTask.create({ data: { userId, domainId: rykas.id, title: "Ask Gold River for a quote", remainingMinutes: 20, whenBucket: "TODAY" } });
    const due = await db.executionTask.create({ data: { userId, domainId: rykas.id, title: "Confirm PO ledger", remainingMinutes: 30, dueDate: PT(23) } });
    const weekly = await db.executionTask.create({ data: { userId, domainId: rykas.id, projectId: project.id, title: "Price the top 20", remainingMinutes: 60 } });
    await db.executionTask.create({ data: { userId, domainId: rykas.id, projectId: project.id, title: "Second step, same project", remainingMinutes: 30 } });
    const more = await Promise.all([1, 2, 3, 4, 5, 6].map((n) => db.executionTask.create({ data: { userId, domainId: rykas.id, title: `Pinned extra ${n}`, remainingMinutes: 15, whenBucket: "TODAY" } })));
    const workTask = await db.executionTask.create({ data: { userId, domainId: work.id, title: "CCHCS report", remainingMinutes: 30, whenBucket: "TODAY" } });

    const game = async () => [{ title: "Kings vs Ducks", start: PT(18), end: PT(21), optional: true }];
    const proposal = await proposeDay(userId, db, game, PT(7));
    const commits = proposal.items.filter((item) => item.group === "COMMIT");
    const extras = proposal.items.filter((item) => item.group === "EXTRA");
    expect(commits.length).toBe(MAX_COMMITMENTS);
    expect(extras.length).toBeLessThanOrEqual(MAX_EXTRAS);
    expect(commits.map((item) => item.reason)).toEqual(expect.arrayContaining(["You pinned it for today"]));
    expect(proposal.items.some((item) => item.task.id === pinned.id)).toBe(true);
    // Personal work stays out of CCHCS hours (8:00-17:30); the Work task may use them.
    for (const item of proposal.items.filter((row) => row.task.domainSlug !== "work")) {
      const inside = item.slot.start < PT(17, 30) && item.slot.end > PT(8);
      expect(inside, item.task.title).toBe(false);
    }
    const workItem = proposal.items.find((item) => item.task.id === workTask.id);
    if (workItem) expect(workItem.slot.start >= PT(7)).toBe(true);
    // The optional game (6-9 PM) didn't block the evening: personal work is placed inside it.
    expect(proposal.items.some((item) => item.task.domainSlug !== "work" && item.slot.start >= PT(18) && item.slot.start < PT(21))).toBe(true);
    // Everything left over is explained.
    expect(proposal.unplaced.every((item) => item.reason.length > 0)).toBe(true);
    const placedIds = new Set(proposal.items.map((item) => item.task.id));
    expect([due, weekly, ...more].filter((task) => !placedIds.has(task.id)).every((task) => proposal.unplaced.some((item) => item.task.id === task.id))).toBe(true);
    // Only one action per weekly project.
    expect(proposal.items.filter((item) => item.task.projectId === project.id).length).toBeLessThanOrEqual(1);
    await db.executionTask.updateMany({ where: { userId }, data: { status: "DROPPED" } });
  });

  it("an exact suggested slot is re-checked: meetings, work hours and other blocks refuse it", async () => {
    const rykas = await db.executionDomain.findFirstOrThrow({ where: { userId, slug: "rykas" } });
    const task = await db.executionTask.create({ data: { userId, domainId: rykas.id, title: "Reorder sleeves", remainingMinutes: 30 } });
    const other = await db.executionTask.create({ data: { userId, domainId: rykas.id, title: "Already there", scheduledStart: PT(19), scheduledEnd: PT(19, 30) } });
    const meeting = async () => [{ title: "Parent call", start: PT(18), end: PT(18, 30) }, { title: "Lakers vs Kings", start: PT(20), end: PT(21), optional: true }];
    expect(await bookSlot(userId, task.id, PT(18), PT(18, 30), db, meeting, PT(7))).toMatchObject({ type: "TAKEN" });
    expect(await bookSlot(userId, task.id, PT(10), PT(10, 30), db, meeting, PT(7))).toMatchObject({ type: "TAKEN" }); // work hours
    expect(await bookSlot(userId, task.id, PT(19), PT(19, 30), db, meeting, PT(7))).toMatchObject({ type: "TAKEN" }); // stale: now taken
    expect(await bookSlot(userId, task.id, PT(20), PT(20, 30), db, meeting, PT(7))).toMatchObject({ type: "BOOKED" }); // optional game doesn't block
    const unknown = async () => { throw new Error("down"); };
    await db.executionTask.update({ where: { id: task.id }, data: { scheduledStart: null, scheduledEnd: null } });
    expect(await bookSlot(userId, task.id, PT(17, 45), PT(18, 15), db, unknown, PT(7))).toMatchObject({ type: "BOOKED", calendarKnown: false });
    await db.executionTask.updateMany({ where: { id: { in: [task.id, other.id] } }, data: { status: "DROPPED" } });
  });
});

describe("career handoff through the ingest connection", () => {
  it("agent preparing -> ready for Ryan with draft and source, reusing the project and task; book, miss, move, done", async () => {
    const opportunities = await db.executionDomain.findFirstOrThrow({ where: { userId, slug: "opportunities" } });
    const project = await db.executionProject.create({ data: { userId, domainId: opportunities.id, name: "Freelance launch" } });
    const existing = await db.executionTask.create({ data: { userId, domainId: opportunities.id, projectId: project.id, title: "Review Alignment resume", remainingMinutes: 15 } });
    const base = { version: 1, system: "CHATGPT", sourceId: "resume/alignment", kind: "ACTION", title: "Review Alignment resume", durationMinutes: 15, projectName: "Freelance launch", ryanosTaskId: existing.id };

    const [preparing] = await ingestSourceEvents(userId, [{ ...base, handoff: "PREPARING", preparing: "tailoring the resume", observedAt: PT(6).toISOString() }], db);
    expect(preparing).toMatchObject({ taskId: existing.id, decision: "CREATE" });
    let board = await loadBoard(userId, db, noCalendar, { now: PT(7) });
    expect(board.preparing.map((task) => [task.id, task.doing])).toEqual([[existing.id, "tailoring the resume"]]);
    expect((await proposeDay(userId, db, noCalendar, PT(7))).items.some((item) => item.task.id === existing.id)).toBe(false);

    const [ready] = await ingestSourceEvents(userId, [{ ...base, handoff: "READY", draftUrl: "https://docs.example.com/alignment-resume", draftTitle: "Alignment resume v2", url: "https://jobs.example.com/alignment/123", details: "Tailored for the analyst role; check the dates in section 2.", observedAt: PT(6, 30).toISOString() }], db);
    expect(ready).toMatchObject({ taskId: existing.id, decision: "UPDATE_SOURCE" });
    expect(await db.executionTask.count({ where: { userId, title: "Review Alignment resume" } })).toBe(1);
    board = await loadBoard(userId, db, noCalendar, { now: PT(7) });
    const card = board.areas.flatMap((area) => [...area.loose, ...area.projects.flatMap((p) => p.tasks)]).find((task) => task.id === existing.id);
    expect(card).toMatchObject({ ready: "ready", source: null, minutes: 15, projectName: "Freelance launch" });
    expect(card?.links.map((link) => [link.kind, link.url])).toEqual([["draft", "https://docs.example.com/alignment-resume"], ["source", "https://jobs.example.com/alignment/123"]]);

    // Book (not completion): one row in Plan and Now.
    const booked = await bookSlot(userId, existing.id, PT(18), PT(18, 15), db, noCalendar, PT(7));
    expect(booked.type).toBe("BOOKED");
    expect((await db.executionTask.findUniqueOrThrow({ where: { id: existing.id } })).status).toBe("NOT_STARTED");
    board = await loadBoard(userId, db, noCalendar, { now: PT(17, 50) });
    expect(board.blocks.filter((task) => task.id === existing.id)).toHaveLength(1);
    const day = await loadDay(userId, db, noCalendar, PT(17, 50));
    expect(day.blocks.filter((task) => task.id === existing.id)).toHaveLength(1);

    // Missed: it goes to "Needs rescheduling", never takes over Now; next free slot keeps links and source.
    const late = await loadDay(userId, db, noCalendar, PT(18, 30));
    expect(late.current).toBeNull();
    expect(late.endedOpen.map((task) => task.id)).toContain(existing.id);
    const moved = await scheduleAction(userId, existing.id, db, noCalendar, { now: PT(18, 30) });
    expect(moved.type).toBe("BOOKED");
    const after = await db.executionTask.findUniqueOrThrow({ where: { id: existing.id }, include: { references: true } });
    expect([after.projectId, after.sourceUrl, after.references.length, after.note]).toEqual([project.id, "https://jobs.example.com/alignment/123", 2, "Tailored for the analyst role; check the dates in section 2."]);

    // Done = Ryan reviewed it. Nothing is submitted anywhere; the draft and source stay on the record.
    await completeAction(userId, existing.id, db, PT(19));
    const done = await db.executionTask.findUniqueOrThrow({ where: { id: existing.id }, include: { references: true } });
    expect([done.status, done.references.length]).toEqual(["DONE", 2]);
  });

  it("a long imported report becomes a short title with the full text in the note", async () => {
    const report = "Store route sync report:\nTarget run 14 stores, 3 skipped (closed), 2 price errors, see attached sheet for line items and next steps for each store.";
    const [result] = await ingestSourceEvents(userId, [{ version: 1, system: "STORE_ROUTE", sourceId: "report-1", title: report, observedAt: PT(6).toISOString() }], db);
    const task = await db.executionTask.findUniqueOrThrow({ where: { id: result.taskId as string } });
    expect([task.title, task.note]).toEqual(["Store route sync report:", report]);
  });
});
