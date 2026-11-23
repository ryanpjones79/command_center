import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { loadBoard, sortTasks, type BoardTask } from "@/server/v2/board";
import { quickAdd, setBlock, setWaitingOn } from "@/server/v2/plan-board";
import { createV2TestDb } from "./helpers/v2-db";

let db: PrismaClient;
let userId: string;
let cleanup: () => Promise<void>;
beforeAll(async () => ({ db, userId, cleanup } = await createV2TestDb("plan")), 60_000);
afterAll(async () => cleanup());

const noCalendar = async () => [];
const hour = (h: number) => new Date(Date.UTC(2026, 10, 24, h + 8)); // Tue Nov 24, Pacific hours

describe("plan board", () => {
  it("drag to schedule, resize, report overlaps, and drag back to the list", async () => {
    const domain = await db.executionDomain.findFirstOrThrow({ where: { userId, slug: "admin" } });
    const family = await db.executionDomain.findFirstOrThrow({ where: { userId, slug: "family" } });
    const task = await db.executionTask.create({ data: { userId, domainId: domain.id, title: "Renew tabs" } });
    await db.executionTask.create({ data: { userId, domainId: family.id, title: "Soccer practice", scheduledStart: hour(10), scheduledEnd: hour(11) } });

    const meeting = async () => [{ title: "Standup", start: hour(9), end: new Date(hour(9).getTime() + 15 * 60_000) }];
    const placed = await setBlock(userId, task.id, hour(9), hour(10), db, meeting);
    expect(placed).toMatchObject({ ok: true, overlaps: ["Standup"] });
    const longer = await setBlock(userId, task.id, hour(9), new Date(hour(10).getTime() + 30 * 60_000), db, noCalendar);
    expect(longer).toMatchObject({ ok: true, overlaps: ["Soccer practice (protected)"] });
    expect((await db.executionTask.findUniqueOrThrow({ where: { id: task.id } })).remainingMinutes).toBe(90);

    expect(await setBlock(userId, task.id, hour(9), new Date(hour(9).getTime() + 60_000), db, noCalendar)).toMatchObject({ ok: false });
    expect(await setBlock(userId, task.id, null, null, db, noCalendar)).toMatchObject({ ok: true, start: null });
    expect((await db.executionTask.findUniqueOrThrow({ where: { id: task.id } })).scheduledStart).toBeNull();
  });

  it("quick add files the task, schedules a timed one, and refuses patient information", async () => {
    const rykas = await db.executionDomain.findFirstOrThrow({ where: { userId, slug: "rykas" } });
    const project = await db.executionProject.create({ data: { userId, domainId: rykas.id, name: "Amazon: Wholesale sourcing" } });
    const now = new Date("2026-11-23T02:00:00Z");
    const one = await quickAdd(userId, "Call Redstone about MOQ #wholesale fri 30m", null, db, now);
    expect(one.ok && one.message).toContain("Added to Amazon: Wholesale sourcing, due Fri, Nov 27");
    const saved = await db.executionTask.findUniqueOrThrow({ where: { id: one.ok ? one.taskId : "" } });
    expect([saved.projectId, saved.domainId, saved.remainingMinutes, saved.sourceSystem]).toEqual([project.id, rykas.id, 30, null]);

    const timed = await quickAdd(userId, "Dentist tomorrow at 3pm 1h", null, db, now);
    const dentist = await db.executionTask.findUniqueOrThrow({ where: { id: timed.ok ? timed.taskId : "" } });
    expect([dentist.scheduledStart?.toISOString(), dentist.scheduledEnd?.toISOString()]).toEqual(["2026-11-23T23:00:00.000Z", "2026-11-24T00:00:00.000Z"]);

    const inProject = await quickAdd(userId, "Send price list", project.id, db, now);
    expect(inProject.ok && inProject.message).toContain("Amazon: Wholesale sourcing");
    expect(await quickAdd(userId, "Follow up MRN 1234567", null, db, now)).toMatchObject({ ok: false });
    expect(await quickAdd(userId, "   ", null, db, now)).toMatchObject({ ok: false });
  });

  it("waiting-on moves a task to Waiting and back", async () => {
    const domain = await db.executionDomain.findFirstOrThrow({ where: { userId, slug: "work" } });
    const task = await db.executionTask.create({ data: { userId, domainId: domain.id, title: "Get sign-off on dashboard" } });
    await setWaitingOn(userId, task.id, "Dana", db);
    let board = await loadBoard(userId, db, noCalendar);
    expect(board.waiting.map((item) => item.title)).toContain("Get sign-off on dashboard");
    await setWaitingOn(userId, task.id, null, db);
    board = await loadBoard(userId, db, noCalendar);
    expect(board.waiting.map((item) => item.title)).not.toContain("Get sign-off on dashboard");
    const work = board.areas.find((area) => area.slug === "work");
    expect(work?.loose.map((item) => item.title)).toContain("Get sign-off on dashboard");
  });

  it("the board groups by area and project and lists scheduled blocks for the days shown", async () => {
    const board = await loadBoard(userId, db, noCalendar, { anchor: hour(12), dayCount: 3 });
    expect(board.days).toHaveLength(3);
    const rykas = board.areas.find((area) => area.slug === "rykas");
    expect(rykas?.projects.find((project) => project.name === "Amazon: Wholesale sourcing")?.tasks.length).toBeGreaterThanOrEqual(2);
    expect(board.blocks.map((block) => block.title)).toContain("Soccer practice");
    expect(board.targets.some((target) => target.kind === "AREA" && target.slug === "rykas")).toBe(true);
  });

  it("urgent items float to the top", () => {
    const base = { areaSlug: "a", areaName: "A", projectId: null, projectName: null, source: null, href: "#", external: false, start: null, end: null, minutes: 30, waitingOn: null, status: "NOT_STARTED", isProtected: false, expiresAt: null } as const;
    const tasks: BoardTask[] = [
      { ...base, id: "1", title: "later", dueDate: "2026-12-20T00:00:00Z", priority: "MEDIUM", urgent: false },
      { ...base, id: "2", title: "high", dueDate: null, priority: "HIGH", urgent: false },
      { ...base, id: "3", title: "soon", dueDate: "2026-11-23T20:00:00Z", priority: "LOW", urgent: true }
    ];
    expect(sortTasks(tasks).map((task) => task.title)).toEqual(["soon", "high", "later"]);
  });
});
