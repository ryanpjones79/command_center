import { execFileSync } from "node:child_process";
import { closeSync, existsSync, openSync, rmSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authenticateRunnerRequest, runnerSignature } from "@/server/agent/runner-auth";
import { claimRunnerWork, heartbeatRunnerWork, submitRunnerResult } from "@/server/agent/runner-service";
import { pmOutputSchema } from "@/server/agent/model-agents";
import { createOwnerDecision, resolveOwnerDecision } from "@/server/agent/work-service";
import { runAgentOrchestrationCycle, type OrchestrationServices } from "@/server/agent/orchestration-service";

const databasePath = path.join(process.cwd(), `.agent-hq-phase2-${process.pid}.db`);
let db: PrismaClient; let userId: string; let projectId: string; let runner: Awaited<ReturnType<PrismaClient["agentRunner"]["create"]>>;
beforeAll(async () => {
  closeSync(openSync(databasePath, "w")); const prismaCli = path.join(process.cwd(), "node_modules", "prisma", "build", "index.js");
  execFileSync(process.execPath, [prismaCli, "db", "push", "--skip-generate", "--schema", path.join(process.cwd(), "prisma", "schema.prisma")], { env: { ...process.env, DATABASE_URL: `file:${databasePath.replaceAll("\\", "/")}` }, stdio: "pipe" });
  db = new PrismaClient({ datasources: { db: { url: `file:${databasePath.replaceAll("\\", "/")}` } } });
  const user = await db.user.create({ data: { email: "phase2@example.com", passwordHash: "test" } }); userId = user.id;
  const domain = await db.executionDomain.create({ data: { userId, name: "Work", slug: "work" } });
  const project = await db.executionProject.create({ data: { userId, domainId: domain.id, name: "Phase 2" } }); projectId = project.id;
  await db.agentProjectConfig.create({ data: { userId, projectId, operatingMode: "LIVE_INTERNAL", objective: "Safe internal progress", projectManagerInstructions: "Bounded", autonomyPolicy: "Internal only", escalationPolicy: "Consequential only", workspaceIdentifier: "test-repo" } });
  runner = await db.agentRunner.create({ data: { userId, keyId: "runner-test", name: "Test runner" } });
});
afterAll(async () => { await db?.$disconnect(); for (const suffix of ["", "-journal", "-wal", "-shm"]) if (existsSync(`${databasePath}${suffix}`)) rmSync(`${databasePath}${suffix}`); });

async function work(key: string, state: "QUEUED" | "PLANNING" | "NEEDS_RYAN" = "QUEUED") {
  return db.agentWorkItem.create({ data: { userId, projectId, idempotencyKey: key, title: key, objective: "Bounded repository task", expectedValue: "Verified internal progress", acceptanceCriteria: "Tests pass", agentRole: "CODE_WORKER", actionCategory: "REVERSIBLE_REPOSITORY_WORK", requiredCapability: "CODEX_IMPLEMENTATION", sandboxPolicy: "WORKSPACE_WRITE", workspaceIdentifier: "test-repo", state } });
}

describe("authorization is distinct from execution", () => {
  it("creates a transaction-bounded action and approval leaves it awaiting execution", async () => {
    const item = await work("bounded-approval", "PLANNING"); await db.agentWorkItem.update({ where: { id: item.id }, data: { state: "NEEDS_RYAN" } });
    const decision = await createOwnerDecision({ userId, projectId, workItemId: item.id, idempotencyKey: "decision-bounded", plan: { category: "PURCHASE_INVENTORY", question: "Buy this exact lot up to $487?", context: "Verified lot 42", recommendedChoice: "BUY", availableChoices: ["BUY", "REDUCE", "PASS"], expectedUpside: "Inventory margin", risk: "Capital exposure", amountCents: 48700, currency: "USD", capability: "PURCHASE", boundedPayload: { lotId: "42", maximumCents: 48700 } } }, db);
    await resolveOwnerDecision(userId, decision.id, "BUY", db);
    const action = await db.agentActionRequest.findUniqueOrThrow({ where: { decisionId: decision.id } });
    expect(action.state).toBe("AWAITING_EXECUTION"); expect(action.executedAt).toBeNull(); expect(JSON.parse(action.boundedPayload)).toEqual({ lotId: "42", maximumCents: 48700 });
    expect((await db.agentWorkItem.findUniqueOrThrow({ where: { id: item.id } })).state).toBe("AWAITING_EXECUTION");
  });
});

describe("runner authentication and leases", () => {
  it("authenticates a signed request once and rejects replay", async () => {
    process.env.RYANOS_RUNNER_HMAC_KEYS = JSON.stringify({ "runner-test": "x".repeat(32) }); const body = JSON.stringify({ capabilities: [] }); const timestamp = new Date().toISOString();
    const headers = { "x-ryanos-key-id": "runner-test", "x-ryanos-timestamp": timestamp, "x-ryanos-request-id": "nonce-once", "x-ryanos-signature": runnerSignature({ method: "POST", path: "/api/runner/claim", timestamp, requestId: "nonce-once", body, secret: "x".repeat(32) }) };
    const request = new Request("http://localhost/api/runner/claim", { method: "POST", body, headers });
    await expect(authenticateRunnerRequest(request, body, db)).resolves.toMatchObject({ id: runner.id });
    await expect(authenticateRunnerRequest(request, body, db)).rejects.toThrow("replay");
  });
  it("atomically claims only once, heartbeats, and accepts duplicate result idempotently", async () => {
    const item = await work("claim-race");
    const [a, b] = await Promise.all([claimRunnerWork(runner, { capabilities: ["CODEX_IMPLEMENTATION"], version: "test" }, db), claimRunnerWork(runner, { capabilities: ["CODEX_IMPLEMENTATION"], version: "test" }, db)]);
    const claim = a ?? b; expect([a, b].filter(Boolean)).toHaveLength(1); expect(claim?.workItemId).toBe(item.id);
    await expect(heartbeatRunnerWork(runner, item.id, claim!.claimToken, db)).resolves.toHaveProperty("leaseExpiresAt");
    const result = { status: "SUCCEEDED" as const, summary: "Implemented", filesChanged: ["safe.ts"], testsRun: ["npm test"], testResults: "passed", unresolvedIssues: [], evidence: "diff + tests", acceptanceCriteriaSatisfied: true, recommendedQaAction: "PASS" as const, externalThreadId: "thread-1" };
    expect((await submitRunnerResult(runner, item.id, claim!.claimToken, result, db)).state).toBe("READY_FOR_REVIEW");
    expect((await submitRunnerResult(runner, item.id, claim!.claimToken, result, db)).duplicate).toBe(true);
    expect((await db.agentProjectConfig.findUniqueOrThrow({ where: { projectId } })).nextAgentReviewAt).not.toBeNull();
    const continuationServices: OrchestrationServices = { projectManager: { async chooseNextWork() { return { disposition: "CREATE_WORK", title: "Next valuable internal step", objective: "Continue after verified PASS", expectedValue: "Automatic project movement", acceptanceCriteria: "Bounded work is queued", agentRole: "CODE_WORKER", actionCategory: "REVERSIBLE_REPOSITORY_WORK", priority: "HIGH", maxAttempts: 2, plannedBottleneck: "Next verified internal blocker", requiredCapability: "CODEX_IMPLEMENTATION", sandboxPolicy: "WORKSPACE_WRITE", networkPolicy: "OFF" }; } }, worker: { async execute() { throw new Error("Live-internal work must wait for the runner"); } }, verifier: { async verify() { throw new Error("unused"); } } };
    const continuation = await runAgentOrchestrationCycle(new Date(Date.now() + 1000), { userId, projectIds: [projectId], db, services: continuationServices });
    expect(continuation.projects[0]?.outcome).toBe("QUEUED_FOR_RUNNER");
    expect(await db.agentWorkItem.count({ where: { projectId, title: "Next valuable internal step", state: "QUEUED" } })).toBe(1);
    await db.agentWorkItem.updateMany({ where: { projectId, state: "QUEUED" }, data: { state: "PARKED" } });
  });
  it("denies unregistered capabilities and malformed model plans", async () => {
    await expect(claimRunnerWork(runner, { capabilities: ["SEND_EMAIL"], version: "test" }, db)).rejects.toThrow("not registered");
    expect(pmOutputSchema.safeParse({ disposition: "CREATE_WORK", requiredCapability: "UNRESTRICTED_SHELL" }).success).toBe(false);
  });
  it("recovers an expired lease without creating a duplicate work item", async () => {
    const item = await work("expired-lease"); const first = await claimRunnerWork(runner, { capabilities: ["CODEX_IMPLEMENTATION"], version: "test" }, db);
    await db.agentWorkItem.update({ where: { id: item.id }, data: { leaseExpiresAt: new Date(Date.now() - 1000) } });
    const recovered = await claimRunnerWork(runner, { capabilities: ["CODEX_IMPLEMENTATION"], version: "test" }, db);
    expect(recovered?.workItemId).toBe(item.id); expect(recovered?.claimToken).not.toBe(first?.claimToken); expect(recovered?.attempt).toBe(2);
    await db.agentWorkItem.update({ where: { id: item.id }, data: { state: "PARKED", claimToken: null, leaseExpiresAt: null } });
  });
  it("honors the runner kill switch without failing queued work", async () => {
    const item = await work("kill-switch"); const prior = process.env.FEATURE_RUNNER_EXECUTION; process.env.FEATURE_RUNNER_EXECUTION = "false";
    try { expect(await claimRunnerWork(runner, { capabilities: ["CODEX_IMPLEMENTATION"], version: "test" }, db)).toBeNull(); }
    finally { prior === undefined ? delete process.env.FEATURE_RUNNER_EXECUTION : process.env.FEATURE_RUNNER_EXECUTION = prior; }
    expect((await db.agentWorkItem.findUniqueOrThrow({ where: { id: item.id } })).state).toBe("QUEUED");
    await db.agentWorkItem.update({ where: { id: item.id }, data: { state: "PARKED" } });
  });
  it("persists bounded QA repair and escalation outcomes", async () => {
    const repair = await work("qa-repair"); const repairClaim = await claimRunnerWork(runner, { capabilities: ["CODEX_IMPLEMENTATION"], version: "test" }, db);
    const base = { status: "SUCCEEDED" as const, summary: "Needs repair", filesChanged: ["a.ts"], testsRun: ["npm test"], testResults: "failed", unresolvedIssues: ["test failed"], evidence: "test output", acceptanceCriteriaSatisfied: false };
    expect((await submitRunnerResult(runner, repair.id, repairClaim!.claimToken, { ...base, recommendedQaAction: "REPAIR", qaFeedback: "Fix the failing test" }, db)).state).toBe("RETRY");
    await db.agentWorkItem.update({ where: { id: repair.id }, data: { state: "PARKED" } });
    const escalate = await work("qa-escalate"); const escalateClaim = await claimRunnerWork(runner, { capabilities: ["CODEX_IMPLEMENTATION"], version: "test" }, db);
    expect((await submitRunnerResult(runner, escalate.id, escalateClaim!.claimToken, { ...base, recommendedQaAction: "ESCALATE", qaFeedback: "Owner judgment required" }, db)).state).toBe("NEEDS_RYAN");
    expect(await db.agentDecision.count({ where: { originatingWorkItemId: escalate.id, status: "PENDING" } })).toBe(1);
  });
});

describe("safe planning outcomes", () => {
  it("expires stale transaction-specific authorization", async () => {
    const item = await work("expired-authorization", "NEEDS_RYAN");
    const decision = await createOwnerDecision({ userId, projectId, workItemId: item.id, idempotencyKey: "expired-auth-decision", plan: { category: "SEND_EMAIL_OR_MESSAGE", question: "Send this exact message?", context: "Expired package", recommendedChoice: "APPROVE", availableChoices: ["APPROVE", "PASS"], expectedUpside: "Conversation", risk: "External representation", capability: "SEND_EMAIL", authorizationExpiresAt: new Date(Date.now() - 1000) } }, db);
    await expect(resolveOwnerDecision(userId, decision.id, "APPROVE", db)).rejects.toThrow("expired");
    expect((await db.agentActionRequest.findUniqueOrThrow({ where: { decisionId: decision.id } })).state).toBe("EXPIRED");
  });
  it("lets a PM choose WAIT without inventing work", async () => {
    const domain = await db.executionDomain.findFirstOrThrow({ where: { userId } }); const project = await db.executionProject.create({ data: { userId, domainId: domain.id, name: "Wait Project" } });
    await db.agentProjectConfig.create({ data: { userId, projectId: project.id, operatingMode: "LIVE_INTERNAL", objective: "Wait safely", projectManagerInstructions: "No make-work", autonomyPolicy: "Bounded", escalationPolicy: "Selective", nextAgentReviewAt: new Date() } });
    const services: OrchestrationServices = { projectManager: { async chooseNextWork() { return { disposition: "WAIT", title: "No work", objective: "Wait", expectedValue: "Avoid waste", acceptanceCriteria: "No item", agentRole: "PM", actionCategory: "RESEARCH_READ_ONLY", priority: "LOW", maxAttempts: 1, plannedBottleneck: "No valuable action now" }; } }, worker: { async execute() { throw new Error("unused"); } }, verifier: { async verify() { throw new Error("unused"); } } };
    const result = await runAgentOrchestrationCycle(new Date(Date.now() + 1000), { userId, projectIds: [project.id], db, services });
    expect(result.projects[0]?.outcome).toBe("WAITING"); expect(await db.agentWorkItem.count({ where: { projectId: project.id } })).toBe(0);
  });
});
