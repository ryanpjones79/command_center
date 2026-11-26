import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { loadBoard, type BoardTask } from "@/server/v2/board";
import { bookSlot } from "@/server/v2/schedule-service";
import { fitsOpening, gridWindow, nextOpening, reasonFor, startsFor } from "@/lib/v2/today";
import { createV2TestDb } from "./helpers/v2-db";

// Plan/Today redesign (2026-11-25): the fitting rules from the handoff acceptance checks, the project shelf, and
// that booking from the new UI writes once to the existing task row and keeps its links.

const PT = (hour: number, minute = 0) => new Date(Date.UTC(2026, 10, 25, hour + 8, minute)); // Wed Nov 25, Pacific
const iso = (date: Date) => date.toISOString();
const MIN = 60_000;

const task = (id: string, minutes: number, extra: Partial<BoardTask> = {}): BoardTask => ({
  id, title: id, areaSlug: "opportunities", areaName: "Upwork & opportunities", projectId: "freelance", projectName: "Freelance launch",
  source: null, href: `/tasks?taskId=${id}`, external: false, dueDate: null, expiresAt: null, start: null, end: null, minutes,
  priority: "MEDIUM", waitingOn: null, status: "NOT_STARTED", isProtected: false, urgent: false, ready: "ready", doing: null,
  links: [], weekly: false, workContext: null, details: null, ...extra
});

// The handoff's sample evening: free at 5:30, protected family time 6:15–6:45, a portfolio block 7:30–8:00.
const board = {
  now: iso(PT(17, 30)),
  timeZone: "America/Los_Angeles",
  soonDays: [iso(PT(0)), iso(PT(24))],
  workdayStartMin: 480,
  workdayEndMin: 1050,
  dayEndMin: 1260,
  meetings: [],
  availability: { work: [{ start: iso(PT(8)), end: iso(PT(17, 30)) }], optionalBlocks: false }
};
const family = task("family", 30, { title: "Protected family time", areaSlug: "family", projectId: null, isProtected: true, start: iso(PT(18, 15)), end: iso(PT(18, 45)) });
const portfolio = task("portfolio", 30, { title: "Build provider-performance portfolio sample", start: iso(PT(19, 30)), end: iso(PT(20)) });
const proposal = task("proposal", 20);
const followUp = task("follow-up", 15);
const polish = task("polish", 30);
const build = task("build", 60);
const minuteOf = (value: string) => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: board.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  return Number(parts.find((part) => part.type === "hour")?.value) * 60 + Number(parts.find((part) => part.type === "minute")?.value);
};

describe("what fits the next opening", () => {
  it("45 open minutes: 20, 15 and 30 fit, 60 doesn't; after booking the 20 at 5:30, 15 fits and 30 no longer does", () => {
    const blocks = [family, portfolio];
    const opening = nextOpening(board, blocks);
    expect(opening).toMatchObject({ start: PT(17, 30).getTime(), end: PT(18, 15).getTime(), minutes: 45, limit: "Before protected family time" });
    expect([proposal, followUp, polish, build].map((item) => fitsOpening(board, blocks, item, opening))).toEqual([true, true, true, false]);

    const booked = [...blocks, { ...proposal, start: iso(PT(17, 30)), end: iso(PT(17, 50)) }];
    const after = nextOpening(board, booked);
    expect(after).toMatchObject({ start: PT(17, 50).getTime(), end: PT(18, 15).getTime() });
    expect(fitsOpening(board, booked, followUp, after)).toBe(true);
    expect(fitsOpening(board, booked, polish, after)).toBe(false);
    // Neither longer task is dropped: they still have later times today.
    expect(startsFor(board, booked, polish).length).toBeGreaterThan(0);
    expect(startsFor(board, booked, build).map((at) => new Date(at).toISOString())).toContain(iso(PT(20)));
  });

  it("the time sheet only offers valid starts; protected and booked time never appear", () => {
    const starts = startsFor(board, [family, portfolio], polish).map((at) => minuteOf(new Date(at).toISOString()));
    expect(starts).toContain(17 * 60 + 30);
    expect(starts).not.toContain(18 * 60); // would run into family time
    expect(starts).not.toContain(19 * 60 + 15); // would run into the portfolio block
    expect(starts.every((minute) => minute + 30 <= 21 * 60)).toBe(true);
    // A Work-area task may use work hours (none left today at 5:30, so nothing earlier appears).
    expect(startsFor({ ...board, now: iso(PT(9)) }, [], task("work-review", 30, { areaSlug: "work" }))[0]).toBe(PT(9).getTime());
    expect(startsFor({ ...board, now: iso(PT(9)) }, [], polish)[0]).toBe(PT(17, 30).getTime());
  });

  it("the grid opens at the current half hour after work, keeps earlier time foldable, and shows the whole evening", () => {
    const window = gridWindow(board, [family, portfolio], board.soonDays[0], minuteOf);
    expect(window).toMatchObject({ start: 17 * 60 + 30, end: 21 * 60 });
    expect(window.earlier).toEqual({ start: 7 * 60, end: 17 * 60 + 30 });
    expect(gridWindow(board, [family, portfolio], board.soonDays[0], minuteOf, true).start).toBe(7 * 60);
    // During work hours the grid starts when work ends.
    expect(gridWindow({ ...board, now: iso(PT(10, 10)) }, [], board.soonDays[0], minuteOf).start).toBe(17 * 60 + 30);
    // A late block extends the grid instead of being cut off.
    const late = task("late", 30, { start: iso(PT(21, 30)), end: iso(PT(22)) });
    expect(gridWindow(board, [late], board.soonDays[0], minuteOf).end).toBe(22 * 60);
  });

  it("each action carries one short, honest reason", () => {
    expect(reasonFor({ ...proposal, links: [{ kind: "draft", title: "Draft", url: "https://docs.google.com/x" }] }, board.timeZone, board.now)).toBe("Draft ready");
    expect(reasonFor({ ...proposal, dueDate: iso(PT(20)) }, board.timeZone, board.now)).toBe("Due today");
    expect(reasonFor({ ...proposal, committed: true }, board.timeZone, board.now)).toBe("Pinned today");
    expect(reasonFor({ ...proposal, areaSlug: "work" }, board.timeZone, board.now)).toBe("Work hours");
    expect(reasonFor(proposal, board.timeZone, board.now)).toBe("Ready");
  });
});

let db: PrismaClient;
let userId: string;
let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db, userId, cleanup } = await createV2TestDb("today"));
  await db.userSettings.create({ data: { userId, timeZone: "America/Los_Angeles", workdayStartMin: 480, workdayEndMin: 1050, dayEndMin: 1260, bufferMinutes: 30 } });
  await db.executionDomain.create({ data: { userId, name: "Upwork & opportunities", slug: "opportunities" } });
}, 60_000);
afterAll(async () => cleanup());

describe("shelf and booking on live records", () => {
  it("the shelf puts weekly top-3 projects first, counts ready actions, and lists the Inbox", async () => {
    const opp = await db.executionDomain.findFirstOrThrow({ where: { userId, slug: "opportunities" } });
    const rykas = await db.executionDomain.findFirstOrThrow({ where: { userId, slug: "rykas" } });
    const freelance = await db.executionProject.create({ data: { userId, domainId: opp.id, name: "Freelance launch", weeklyFocus: "TOP_3" } });
    const restock = await db.executionProject.create({ data: { userId, domainId: rykas.id, name: "Rykas: top-20 restock" } });
    await db.executionProject.create({ data: { userId, domainId: rykas.id, name: "Empty project" } });
    for (const [title, minutes] of [["Review and submit Power BI proposal", 20], ["Follow up on SQL reporting quote", 15], ["Polish portfolio screenshots", 30], ["Build care-gaps dashboard model", 60]] as const) {
      await db.executionTask.create({ data: { userId, domainId: opp.id, projectId: freelance.id, title, remainingMinutes: minutes } });
    }
    await db.executionTask.create({ data: { userId, domainId: rykas.id, projectId: restock.id, title: "Request top-20 quote", remainingMinutes: 20, priority: "CRITICAL" } });
    await db.executionTask.create({ data: { userId, domainId: opp.id, title: "Power BI dashboard repair lead", needsJudgment: true } });

    const loaded = await loadBoard(userId, db, async () => [], { now: PT(17, 30) });
    expect(loaded.shelf.map((project) => [project.name, project.ready])).toEqual([["Freelance launch", 4], ["Rykas: top-20 restock", 1]]);
    expect(loaded.shelf[0]).toMatchObject({ areaSlug: "opportunities", focus: true, workOnly: false });
    expect(loaded.decisions).toEqual({ count: 1, first: "Power BI dashboard repair lead" });
  });

  it("booking writes once to the same task, keeps its links and notes, rejects protected time and stale slots", async () => {
    const opp = await db.executionDomain.findFirstOrThrow({ where: { userId, slug: "opportunities" } });
    const family = await db.executionDomain.findFirstOrThrow({ where: { userId, slug: "family" } });
    const project = await db.executionProject.findFirstOrThrow({ where: { userId, name: "Freelance launch" } });
    const proposalRow = await db.executionTask.findFirstOrThrow({ where: { userId, title: "Review and submit Power BI proposal" } });
    await db.executionTask.update({ where: { id: proposalRow.id }, data: { note: "Scope, budget and availability are in the posting." } });
    await db.executionTaskReference.create({ data: { userId, taskId: proposalRow.id, title: "Upwork posting", url: "https://www.upwork.com/jobs/~example", provider: "source" } });
    await db.executionTask.create({ data: { userId, domainId: family.id, title: "Protected family time", scheduledStart: PT(18, 15), scheduledEnd: PT(18, 45) } });
    const now = PT(17, 20);

    // Into protected family time: refused, nothing written.
    expect(await bookSlot(userId, proposalRow.id, PT(18, 15), PT(18, 35), db, async () => [], now)).toMatchObject({ type: "TAKEN" });
    expect((await db.executionTask.findUniqueOrThrow({ where: { id: proposalRow.id } })).scheduledStart).toBeNull();

    // Double submit: two confirmations land on the same row, never a second task or a second block.
    const [first, second] = await Promise.all([
      bookSlot(userId, proposalRow.id, PT(17, 30), PT(17, 50), db, async () => [], now),
      bookSlot(userId, proposalRow.id, PT(17, 30), PT(17, 50), db, async () => [], now)
    ]);
    expect([first.type, second.type]).toEqual(["BOOKED", "BOOKED"]);
    expect(await db.executionTask.count({ where: { userId, title: "Review and submit Power BI proposal" } })).toBe(1);

    // A slot taken after the screen rendered is refused for another task.
    const followUpRow = await db.executionTask.findFirstOrThrow({ where: { userId, title: "Follow up on SQL reporting quote" } });
    expect(await bookSlot(userId, followUpRow.id, PT(17, 30), PT(17, 45), db, async () => [], now)).toMatchObject({ type: "TAKEN" });

    const after = await db.executionTask.findUniqueOrThrow({ where: { id: proposalRow.id }, include: { references: true } });
    expect(after).toMatchObject({ projectId: project.id, status: "NOT_STARTED", note: "Scope, budget and availability are in the posting.", scheduledStart: PT(17, 30), scheduledEnd: PT(17, 50) });
    expect(after.references.map((ref) => ref.url)).toEqual(["https://www.upwork.com/jobs/~example"]);

    // The project keeps its other ready actions; the booked one is now scheduled work in the same project.
    const loaded = await loadBoard(userId, db, async () => [], { now });
    expect(loaded.shelf.find((item) => item.name === "Freelance launch")).toMatchObject({ ready: 3, scheduled: 1 });
    expect(loaded.blocks.find((block) => block.id === proposalRow.id)?.links.map((link) => link.kind)).toEqual(["source"]);
    expect(PT(17, 50).getTime() - PT(17, 30).getTime()).toBe(20 * MIN);
  });
});
