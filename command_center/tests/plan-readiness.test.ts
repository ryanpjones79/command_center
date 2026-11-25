import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { agentDoing, isAgentWaiting, readiness, safeLink } from "@/lib/v2/readiness";
import { loadBoard } from "@/server/v2/board";
import { acceptPlan, proposeDay } from "@/server/v2/plan";
import { scheduleAction } from "@/server/v2/schedule-service";
import { createV2TestDb } from "./helpers/v2-db";

let db: PrismaClient;
let userId: string;
let cleanup: () => Promise<void>;
beforeAll(async () => ({ db, userId, cleanup } = await createV2TestDb("readiness")), 60_000);
afterAll(async () => cleanup());

const noCalendar = async () => [];

describe("readiness helpers", () => {
  it("an agent holds a WAITING task whose waitingOn starts with Agent", () => {
    expect(readiness({ status: "WAITING", waitingOn: "Agent: drafting the profile" })).toBe("preparing");
    expect(readiness({ status: "WAITING", waitingOn: "agent" })).toBe("preparing");
    expect(readiness({ status: "WAITING", waitingOn: "Agnes" })).toBe("ready");
    expect(readiness({ status: "NOT_STARTED", waitingOn: null })).toBe("ready");
    expect(isAgentWaiting("Agents of SHIELD")).toBe(false);
    expect(agentDoing("Agent: drafting the profile")).toBe("drafting the profile");
    expect(agentDoing("Agent")).toBeNull();
  });
  it("only opens https links and RyanOS paths", () => {
    expect(safeLink("https://www.upwork.com/")).toBe("https://www.upwork.com/");
    expect(safeLink("/tasks?taskId=1")).toBe("/tasks?taskId=1");
    expect(safeLink("//evil.example")).toBeNull();
    expect(safeLink("javascript:alert(1)")).toBeNull();
    expect(safeLink("http://plain.example")).toBeNull();
  });
});

describe("career action end to end", () => {
  it("preparing is listed apart and never proposed; ready is bookable once, keeps its links, and moves without duplicating", async () => {
    const area = await db.executionDomain.findFirstOrThrow({ where: { userId, slug: "admin" } });
    const project = await db.executionProject.create({ data: { userId, domainId: area.id, name: "Freelance launch" } });
    const task = await db.executionTask.create({
      data: { userId, domainId: area.id, projectId: project.id, title: "Review the Upwork profile draft", remainingMinutes: 45, whenBucket: "TODAY", status: "WAITING", waitingOn: "Agent: drafting the profile" }
    });
    const now = new Date(Date.UTC(2026, 10, 24, 17)); // Tue 9 AM Pacific

    let board = await loadBoard(userId, db, noCalendar, { now });
    expect(board.preparing.map((row) => [row.title, row.ready, row.doing])).toEqual([["Review the Upwork profile draft", "preparing", "drafting the profile"]]);
    expect(board.waiting.some((row) => row.id === task.id)).toBe(false);
    expect((await proposeDay(userId, db, noCalendar, now)).items.some((item) => item.task.id === task.id)).toBe(false);

    // The agent finishes: draft and source attached, task handed to Ryan.
    await db.executionTaskReference.createMany({ data: [
      { userId, taskId: task.id, provider: "draft", title: "Profile draft", url: `/tasks?taskId=${task.id}` },
      { userId, taskId: task.id, provider: "source", title: "Upwork", url: "https://www.upwork.com/" }
    ] });
    await db.executionTask.update({ where: { id: task.id }, data: { status: "NOT_STARTED", waitingOn: null } });

    board = await loadBoard(userId, db, noCalendar, { now });
    expect(board.preparing).toHaveLength(0);
    const ready = board.areas.flatMap((row) => row.projects.flatMap((p) => p.tasks)).find((row) => row.id === task.id);
    expect(ready?.ready).toBe("ready");
    expect(ready?.links.map((link) => link.kind)).toEqual(["draft", "source"]);

    const proposal = await proposeDay(userId, db, noCalendar, now);
    const item = proposal.items.find((row) => row.task.id === task.id);
    expect(item).toBeTruthy();
    // Previewing books nothing.
    expect((await db.executionTask.findUniqueOrThrow({ where: { id: task.id } })).scheduledStart).toBeNull();
    const booked = await acceptPlan(userId, db, [{ taskId: task.id, start: item!.slot.start.toISOString(), end: item!.slot.end.toISOString() }]);
    expect(booked.booked).toEqual([task.id]);

    // Missed: the block ends unfinished; next free slot moves the same row and keeps project and links.
    const later = new Date(item!.slot.end.getTime() + 30 * 60_000);
    const moved = await scheduleAction(userId, task.id, db, noCalendar, { now: later });
    expect(moved.type).toBe("BOOKED");
    const after = await db.executionTask.findUniqueOrThrow({ where: { id: task.id }, include: { references: true } });
    expect(after.scheduledStart!.getTime()).toBeGreaterThanOrEqual(later.getTime());
    expect([after.projectId, after.references.length]).toEqual([project.id, 2]);
    expect(await db.executionTask.count({ where: { userId, title: "Review the Upwork profile draft" } })).toBe(1);
    board = await loadBoard(userId, db, noCalendar, { now: later });
    expect(board.blocks.filter((row) => row.id === task.id)).toHaveLength(1);
  });
});
