import { execFileSync } from "node:child_process";
import { closeSync, existsSync, openSync, rmSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertAgentWorkTransition,
  canTransitionAgentWorkItem
} from "@/lib/agent-state-machine";
import { evaluateAgentPolicy } from "@/lib/agent-policy";
import type { OrchestrationServices } from "@/server/agent/orchestration-service";
import { runAgentOrchestrationCycle } from "@/server/agent/orchestration-service";
import { ensureInitialAgentProjects } from "@/server/agent/setup-service";
import {
  resolveOwnerDecision,
  setAgentProjectPaused,
  transitionAgentWorkItem
} from "@/server/agent/work-service";

const databasePath = path.join(process.cwd(), `.agent-hq-test-${process.pid}.db`);
const databaseUrl = `file:${databasePath.replaceAll("\\", "/")}`;
let db: PrismaClient;
let userId: string;
let otherUserId: string;

beforeAll(async () => {
  closeSync(openSync(databasePath, "w"));
  const prismaCli = path.join(process.cwd(), "node_modules", "prisma", "build", "index.js");
  execFileSync(
    process.execPath,
    [prismaCli, "db", "push", "--skip-generate", "--schema", path.join(process.cwd(), "prisma", "schema.prisma")],
    { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe" }
  );
  db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const [user, otherUser] = await Promise.all([
    db.user.create({ data: { email: "agent-owner@example.com", passwordHash: "test" } }),
    db.user.create({ data: { email: "other-owner@example.com", passwordHash: "test" } })
  ]);
  userId = user.id;
  otherUserId = otherUser.id;
  await db.executionDomain.createMany({
    data: [
      { userId, name: "Work", slug: "work", isDefault: true },
      { userId, name: "Rykas", slug: "rykas", isDefault: true },
      { userId: otherUserId, name: "Work", slug: "work", isDefault: true }
    ]
  });
}, 60_000);

afterAll(async () => {
  await db?.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const target = `${databasePath}${suffix}`;
    if (existsSync(target)) rmSync(target);
  }
});

describe("Agent work state machine and deterministic policy", () => {
  it("allows only explicit legal transitions", () => {
    expect(canTransitionAgentWorkItem("QUEUED", "PLANNING")).toBe(true);
    expect(canTransitionAgentWorkItem("VERIFYING", "DONE")).toBe(true);
    expect(canTransitionAgentWorkItem("DONE", "RUNNING")).toBe(false);
    expect(() => assertAgentWorkTransition("NEEDS_RYAN", "VERIFYING")).toThrow(
      "Illegal AgentWorkItem transition"
    );
  });

  it("returns ALLOW, REQUIRE_OWNER_APPROVAL, and DENY deterministically", () => {
    expect(evaluateAgentPolicy({ category: "RESEARCH_READ_ONLY" })).toBe("ALLOW");
    expect(evaluateAgentPolicy({ category: "PURCHASE_INVENTORY" })).toBe(
      "REQUIRE_OWNER_APPROVAL"
    );
    expect(evaluateAgentPolicy({ category: "DESTRUCTIVE_OPERATION" })).toBe("DENY");
  });

  it("enforces the stricter CCHCS and PHI boundary", () => {
    expect(
      evaluateAgentPolicy({ category: "CCHCS_METHODOLOGY_DECISION", projectProfile: "CCHCS_PM" })
    ).toBe("REQUIRE_OWNER_APPROVAL");
    expect(
      evaluateAgentPolicy({
        category: "RESEARCH_READ_ONLY",
        projectProfile: "CCHCS_PM",
        containsPotentialPhi: true,
        leavesApprovedBoundary: true
      })
    ).toBe("DENY");
    expect(evaluateAgentPolicy({ category: "PHI_EXTERNAL_TRANSFER" })).toBe("DENY");
  });
});

describe("Agent HQ durable orchestration", () => {
  const cycleTime = new Date("2026-08-29T16:00:00.000Z");

  it("seeds CCHCS, SignalCare, and Rykas without duplicate projects", async () => {
    await ensureInitialAgentProjects(userId, db);
    await ensureInitialAgentProjects(userId, db);
    const projects = await db.executionProject.findMany({
      where: { userId, name: { in: ["CCHCS", "SignalCare", "Rykas"] } },
      include: { agentConfig: true },
      orderBy: { name: "asc" }
    });
    expect(projects).toHaveLength(3);
    expect(projects.every((project) => project.agentConfig?.maxConcurrentWorkItems === 2)).toBe(true);
    expect(projects.find((project) => project.name === "CCHCS")?.agentConfig?.primaryKpi).toBeNull();
  });

  it("runs all three seeded mock lifecycles through worker, QA, and NEED RYAN", async () => {
    await db.agentProjectConfig.updateMany({
      where: { userId },
      data: { nextAgentReviewAt: cycleTime, leaseToken: null, leaseExpiresAt: null }
    });
    const result = await runAgentOrchestrationCycle(cycleTime, { userId, db });
    expect(result.claimedProjectCount).toBe(3);
    expect(result.projects.map((project) => project.projectName).sort()).toEqual([
      "CCHCS",
      "Rykas",
      "SignalCare"
    ]);
    expect(result.projects.every((project) => project.outcome === "NEEDS_RYAN")).toBe(true);

    const [work, runs, decisions, events] = await Promise.all([
      db.agentWorkItem.findMany({ where: { userId } }),
      db.agentRun.findMany({ where: { userId } }),
      db.agentDecision.findMany({ where: { userId, status: "PENDING" }, include: { project: true } }),
      db.agentEvent.findMany({ where: { userId } })
    ]);
    expect(work).toHaveLength(3);
    expect(work.every((item) => item.state === "NEEDS_RYAN" && item.attemptCount === 1)).toBe(true);
    expect(runs).toHaveLength(6);
    expect(runs.every((run) => run.status === "SUCCEEDED")).toBe(true);
    expect(decisions.map((decision) => decision.project.name).sort()).toEqual([
      "CCHCS",
      "Rykas",
      "SignalCare"
    ]);
    expect(events.some((event) => event.type === "WORK_COMPLETED")).toBe(true);
    expect(events.some((event) => event.type === "QA_PASSED")).toBe(true);
    expect(events.some((event) => event.type === "OWNER_ESCALATION_CREATED")).toBe(true);
  });

  it("makes repeated scheduler invocation idempotent and prevents duplicate work", async () => {
    const before = await db.agentWorkItem.count({ where: { userId } });
    const repeated = await runAgentOrchestrationCycle(cycleTime, { userId, db });
    const after = await db.agentWorkItem.count({ where: { userId } });
    expect(repeated.dueProjectCount).toBe(0);
    expect(after).toBe(before);
  });

  it("creates and resolves owner decisions with per-user isolation", async () => {
    const decision = await db.agentDecision.findFirstOrThrow({
      where: { userId, project: { name: "SignalCare" }, status: "PENDING" }
    });
    await expect(resolveOwnerDecision(otherUserId, decision.id, "APPROVE", db)).rejects.toThrow(
      "not found for this user"
    );
    const resolved = await resolveOwnerDecision(userId, decision.id, "APPROVE", db);
    expect(resolved.status).toBe("RESOLVED");
    expect(resolved.resultingAction).toContain("nothing external");
    const work = await db.agentWorkItem.findUniqueOrThrow({ where: { id: decision.originatingWorkItemId! } });
    expect(work.state).toBe("AWAITING_EXECUTION");
    const action = await db.agentActionRequest.findUniqueOrThrow({ where: { decisionId: decision.id } });
    expect(action.state).toBe("AWAITING_EXECUTION");
    expect(action.executedAt).toBeNull();
    expect(JSON.parse(action.authorizationBounds)).toMatchObject({ oneTime: true });
    expect(await db.agentEvent.count({ where: { decisionId: decision.id, type: "OWNER_DECISION_RESOLVED" } })).toBe(1);
  });

  it("supports pause and resume without losing durable state", async () => {
    const project = await db.executionProject.findFirstOrThrow({ where: { userId, name: "CCHCS" } });
    const paused = await setAgentProjectPaused(userId, project.id, true, db);
    expect(paused.enabled).toBe(false);
    expect(paused.pausedAt).not.toBeNull();
    const resumed = await setAgentProjectPaused(userId, project.id, false, db);
    expect(resumed.enabled).toBe(true);
    expect(resumed.pausedAt).toBeNull();
  });

  it("enforces project WIP limits before creating more work", async () => {
    const project = await db.executionProject.findFirstOrThrow({
      where: { userId, name: "SignalCare" }, include: { agentConfig: true }
    });
    await db.agentWorkItem.createMany({
      data: ["wip-a", "wip-b"].map((key) => ({
        userId,
        projectId: project.id,
        idempotencyKey: key,
        title: key,
        objective: "Bounded WIP test",
        expectedValue: "Test WIP",
        acceptanceCriteria: "Remain bounded",
        agentRole: "TEST",
        state: "QUEUED" as const
      }))
    });
    await db.agentProjectConfig.update({
      where: { id: project.agentConfig!.id },
      data: { nextAgentReviewAt: cycleTime, leaseToken: null, leaseExpiresAt: null }
    });
    const before = await db.agentWorkItem.count({ where: { projectId: project.id } });
    const result = await runAgentOrchestrationCycle(cycleTime, { userId, projectIds: [project.id], db });
    expect(result.projects[0]?.outcome).toBe("WIP_LIMIT");
    expect(await db.agentWorkItem.count({ where: { projectId: project.id } })).toBe(before);
  });

  it("creates bounded retries and stops at max-attempt exhaustion", async () => {
    const domain = await db.executionDomain.findFirstOrThrow({ where: { userId, slug: "work" } });
    const project = await db.executionProject.create({
      data: { userId, domainId: domain.id, name: "Retry Test Project" }
    });
    await db.agentProjectConfig.create({
      data: {
        userId,
        projectId: project.id,
        objective: "Test bounded retry behavior",
        projectManagerInstructions: "Create bounded work",
        autonomyPolicy: "Allow read-only work",
        escalationPolicy: "Stop at max attempts",
        nextAgentReviewAt: cycleTime,
        maxConcurrentWorkItems: 2
      }
    });
    const services: OrchestrationServices = {
      projectManager: {
        async chooseNextWork() {
          return {
            title: "Fail predictably",
            objective: "Exercise retry control",
            expectedValue: "Prove bounded execution",
            acceptanceCriteria: "Stop after two attempts",
            agentRole: "TEST_WORKER",
            actionCategory: "RESEARCH_READ_ONLY",
            priority: "HIGH",
            maxAttempts: 2,
            plannedBottleneck: "Intentional test failure"
          };
        }
      },
      worker: { async execute() { throw new Error("Intentional bounded failure"); } },
      verifier: { async verify() { return { outcome: "PASS", feedback: "unused", evidence: "unused" }; } }
    };
    const first = await runAgentOrchestrationCycle(cycleTime, { userId, projectIds: [project.id], db, services });
    expect(first.projects[0]?.outcome).toBe("RETRY");
    const work = await db.agentWorkItem.findFirstOrThrow({ where: { projectId: project.id } });
    await db.agentWorkItem.update({ where: { id: work.id }, data: { nextEligibleRunAt: cycleTime } });
    await db.agentProjectConfig.update({
      where: { projectId: project.id },
      data: { nextAgentReviewAt: cycleTime, leaseToken: null, leaseExpiresAt: null }
    });
    const second = await runAgentOrchestrationCycle(cycleTime, { userId, projectIds: [project.id], db, services });
    expect(second.projects[0]?.outcome).toBe("FAILED");
    const exhausted = await db.agentWorkItem.findUniqueOrThrow({ where: { id: work.id } });
    expect(exhausted.state).toBe("FAILED");
    expect(exhausted.attemptCount).toBe(2);
  });

  it("rejects cross-user work-item transitions", async () => {
    const work = await db.agentWorkItem.findFirstOrThrow({ where: { userId } });
    await expect(transitionAgentWorkItem(otherUserId, work.id, "PARKED", {}, db)).rejects.toThrow(
      "not found for this user"
    );
  });
});
