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
import { collectProjectEvidence, executeProjectTool } from "@/server/agent/project-tools";
import { markAgentWorkIntegrated } from "@/server/agent/integration-service";
import { rykasTruthResultSchema } from "@/lib/rykas-truth-contract";
import { DeterministicProjectManagerAgent } from "@/server/agent/mock-agents";

const databasePath = path.join(process.cwd(), `.agent-hq-phase2-${process.pid}.db`);
let db: PrismaClient; let userId: string; let projectId: string; let runner: Awaited<ReturnType<PrismaClient["agentRunner"]["create"]>>;
beforeAll(async () => {
  process.env.FEATURE_RUNNER_EXECUTION = "true";
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

describe("integration dependencies and project truth tools", () => {
  it("allows independent work, blocks dependent work, and releases it after integration", async () => {
    await db.agentWorkItem.updateMany({ where: { projectId, state: { in: ["QUEUED", "RETRY"] } }, data: { state: "PARKED" } });
    const base = await db.agentWorkItem.create({ data: { userId, projectId, idempotencyKey: "review-base", title: "Verified base", objective: "Base", expectedValue: "Code", acceptanceCriteria: "Verified", agentRole: "CODE_WORKER", actionCategory: "REVERSIBLE_REPOSITORY_WORK", requiredCapability: "CODEX_IMPLEMENTATION", workspaceIdentifier: "test-repo", state: "READY_FOR_REVIEW", integrationStatus: "PENDING_REVIEW" } });
    const dependent = await db.agentWorkItem.create({ data: { userId, projectId, idempotencyKey: "dependent", title: "Dependent work", objective: "Requires base", expectedValue: "Follow-on", acceptanceCriteria: "Uses integrated base", agentRole: "CODE_WORKER", actionCategory: "REVERSIBLE_REPOSITORY_WORK", requiredCapability: "CODEX_IMPLEMENTATION", workspaceIdentifier: "test-repo", dependsOnWorkItemId: base.id } });
    const independent = await db.agentWorkItem.create({ data: { userId, projectId, idempotencyKey: "independent", title: "Independent work", objective: "Independent", expectedValue: "Parallel movement", acceptanceCriteria: "No dependency", agentRole: "CODE_WORKER", actionCategory: "REVERSIBLE_REPOSITORY_WORK", requiredCapability: "CODEX_IMPLEMENTATION", workspaceIdentifier: "test-repo", priority: "HIGH" } });
    const first = await claimRunnerWork(runner, { capabilities: ["CODEX_IMPLEMENTATION"], version: "test" }, db); expect(first?.workItemId).toBe(independent.id);
    await db.agentWorkItem.update({ where: { id: independent.id }, data: { state: "PARKED", claimToken: null, leaseExpiresAt: null } });
    expect(await claimRunnerWork(runner, { capabilities: ["CODEX_IMPLEMENTATION"], version: "test" }, db)).toBeNull();
    await markAgentWorkIntegrated(userId, base.id, "abc123", db);
    expect((await claimRunnerWork(runner, { capabilities: ["CODEX_IMPLEMENTATION"], version: "test" }, db))?.workItemId).toBe(dependent.id);
  });
  it("validates registered project tools, outputs, policy, and call limits", async () => {
    await db.agentProjectConfig.update({ where: { projectId }, data: { profile: "SIGNALCARE_GM" } });
    await db.queueItem.create({ data: { userId, title: "Research Acme", lane: "signalcare", recipient: "Acme Dental", nextAction: "Verify fit" } });
    const signal = await executeProjectTool({ userId, projectId, profile: "SIGNALCARE_GM" }, "signalcare.pipeline.snapshot", {}, db) as { prospects: unknown[] }; expect(signal.prospects).toHaveLength(1);
    await expect(executeProjectTool({ userId, projectId, profile: "SIGNALCARE_GM" }, "unknown.sql", { sql: "DROP TABLE" }, db)).rejects.toThrow("DENY");
    await expect(executeProjectTool({ userId, projectId, profile: "SIGNALCARE_GM" }, "signalcare.pipeline.snapshot", { sql: "SELECT *" }, db)).rejects.toThrow();
    await expect(collectProjectEvidence({ userId, projectId, profile: "SIGNALCARE_GM" }, ["signalcare.pipeline.snapshot", "signalcare.pipeline.snapshot"], db, 1)).rejects.toThrow("limit");
    await db.agentProjectConfig.update({ where: { projectId }, data: { profile: "RYKAS_GM" } });
    await db.rykasDay.create({ data: { userId, date: new Date(), backlogAfter: 12, listedCount: 2 } });
    const rykas = await executeProjectTool({ userId, projectId, profile: "RYKAS_GM" }, "rykas.operations.snapshot", {}, db) as { sourcingAllowed: boolean }; expect(rykas.sourcingAllowed).toBe(false);
    await db.agentProjectConfig.update({ where: { projectId }, data: { profile: "CCHCS_PM" } });
    await expect(executeProjectTool({ userId, projectId, profile: "CCHCS_PM" }, "signalcare.pipeline.snapshot", {}, db)).rejects.toThrow("eligible");
    expect(await db.agentEvent.count({ where: { projectId, type: { in: ["PROJECT_TOOL_EXECUTED", "WORK_INTEGRATED"] } } })).toBeGreaterThanOrEqual(3);
  });
});

describe("Rykas real-truth read boundary", () => {
  it("queues one durable read, accepts only bounded read-only evidence, and reuses it without duplicate work", async () => {
    await db.agentWorkItem.updateMany({ where: { projectId, state: { notIn: ["DONE", "FAILED", "PARKED"] } }, data: { state: "PARKED", claimToken: null, leaseExpiresAt: null } });
    await db.agentProjectConfig.update({ where: { projectId }, data: { profile: "RYKAS_GM", workspaceIdentifier: "rykas-repo", maxConcurrentWorkItems: 1 } });
    const prior = process.env.FEATURE_RYKAS_TRUTH_READ; process.env.FEATURE_RYKAS_TRUTH_READ = "true";
    try {
      await expect(executeProjectTool({ userId, projectId, profile: "RYKAS_GM" }, "rykas.sourcing.opportunities", { view: "TOP", limit: 5, sql: "SELECT *" }, db)).rejects.toThrow();
      await expect(executeProjectTool({ userId, projectId, profile: "RYKAS_GM" }, "rykas.sourcing.opportunity_detail", { opportunityId: "US:B000000001", shell: "whoami" }, db)).rejects.toThrow();
      const pending = await executeProjectTool({ userId, projectId, profile: "RYKAS_GM" }, "rykas.operations.snapshot", {}, db) as { truthStatus: string; readWorkItemId: string | null };
      expect(pending.truthStatus).toBe("PENDING"); expect(pending.readWorkItemId).toBeTruthy();
      expect(await db.agentWorkItem.count({ where: { projectId, requiredCapability: "RYKAS_OPERATIONS_READ" } })).toBe(1);
      const claim = await claimRunnerWork(runner, { capabilities: ["RYKAS_OPERATIONS_READ"], version: "test" }, db);
      expect(claim).toMatchObject({ workItemId: pending.readWorkItemId, allowedCapability: "RYKAS_OPERATIONS_READ", workspaceIdentifier: "rykas-repo", networkPolicy: "LOCALHOST_ONLY" });
      const truth = rykasTruthResultSchema.parse({ schemaVersion: "RYKAS_TRUTH_READ_V1", operation: "OPERATIONS_SNAPSHOT", readOnly: true, purchaseAuthorized: false, purchaseExecuted: false, observedAt: new Date().toISOString(), authoritativeSource: "Rykas SQL Server database rykas via loopback Command Center marts", sourceUpdatedAt: "2026-08-20T00:00:00.000Z", freshness: "STALE", stale: true, data: { actionSummary: [{ action: "PRICE CHECK", count: 1, topOpportunityScore: 98 }], capital: { reliable: false, status: "BLOCKED", reason: "PO truth stale", actionRequired: "Confirm PO ledger status", asOf: "2026-08-29", openCommitments: 0, purchaseOrderRows: 0, openPurchaseOrderLines: 0, poLedgerStatus: "NOT VERIFIED", poCertificationState: "NOT VERIFIED", poCertifiedAt: "2026-08-20T00:00:00.000Z", poTruthCurrent: false, safeInventoryCapital: null }, opportunities: [], purchaseCandidates: [], blockers: [{ id: "capital-po-truth", opportunityId: null, stage: "PURCHASE_DECISION", code: "CAPITAL_OR_PO_TRUTH_BLOCKED", summary: "Confirm PO ledger status", sourceUpdatedAt: "2026-08-20T00:00:00.000Z", stale: true }], detail: null } });
      const submitted = await submitRunnerResult(runner, claim!.workItemId, claim!.claimToken, { status: "SUCCEEDED", summary: "Bounded read", filesChanged: [], testsRun: ["schema"], testResults: "passed", unresolvedIssues: [], evidence: "read only", acceptanceCriteriaSatisfied: true, recommendedQaAction: "PASS", providerIdentifier: "rykas-local-truth", rykasTruthResult: truth }, db);
      expect(submitted.state).toBe("DONE");
      const ready = await executeProjectTool({ userId, projectId, profile: "RYKAS_GM" }, "rykas.operations.snapshot", {}, db) as { truthStatus: string; stale: boolean; realTruth: { purchaseExecuted: boolean } };
      expect(ready).toMatchObject({ truthStatus: "READY", stale: true, realTruth: { purchaseExecuted: false } });
      await executeProjectTool({ userId, projectId, profile: "RYKAS_GM" }, "rykas.operations.snapshot", {}, db);
      expect(await db.agentWorkItem.count({ where: { projectId, requiredCapability: "RYKAS_OPERATIONS_READ" } })).toBe(1);
      expect(await db.agentEvent.count({ where: { projectId, type: "RYKAS_TRUTH_READ" } })).toBe(1);
      expect(await db.agentEvent.count({ where: { projectId, type: "RYKAS_DATA_STALE" } })).toBe(1);
    } finally { prior === undefined ? delete process.env.FEATURE_RYKAS_TRUTH_READ : process.env.FEATURE_RYKAS_TRUTH_READ = prior; }
  });
  it("denies Rykas truth tools to SignalCare and CCHCS", async () => {
    await db.agentProjectConfig.update({ where: { projectId }, data: { profile: "SIGNALCARE_GM" } });
    await expect(executeProjectTool({ userId, projectId, profile: "SIGNALCARE_GM" }, "rykas.operations.blockers", { limit: 5 }, db)).rejects.toThrow("eligible");
    await db.agentProjectConfig.update({ where: { projectId }, data: { profile: "CCHCS_PM" } });
    await expect(executeProjectTool({ userId, projectId, profile: "CCHCS_PM" }, "rykas.purchase.candidates", { limit: 5 }, db)).rejects.toThrow("eligible");
  });
  it("turns only a real purchase-ready row into an authorization-only bounded decision", async () => {
    const candidate = { opportunityId: "US:B000000001", asin: "B000000001", vendorSku: "SKU-1", brand: "Brand", title: "Real candidate", supplier: "Supplier", discoverySource: "Rykas", discoveryStrategy: "existing", currentBuyBox: 20, buyBox90: 19, observedOrReferenceCost: 10, maxLandedCost: 11, idealLandedCost: 9, profitPerUnit: 4, expectedProfit: 48, expectedMonthlyContribution: 24, roi: 0.4, margin: 0.2, estimatedMonthlyUnits: 6, units30: 6, units90: 18, sellerCount: 3, amazonOos90: 50, opportunityScore: 91, decision: "BUY", actionState: "BUY NOW", recommendationStatus: "BUY_RECOMMENDATION", recommendedUnits: 12, recommendedCases: 1, expectedSpend: 120, eligibilityStatus: "ELIGIBLE", requiredAction: "NONE", sourceStatus: "CURRENT_VERIFIED_SOURCE", reasonCodes: [], missingEvidence: [], blockers: [], freshness: { observedAt: "2026-08-29T12:00:00.000Z", authoritativeSource: "Rykas SQL", sourceUpdatedAt: "2026-08-29T11:00:00.000Z", classification: "CURRENT", stale: false } };
    const plan = await new DeterministicProjectManagerAgent().chooseNextWork({ profile: "RYKAS_GM", projectId, projectName: "Rykas", objective: "Profit", primaryKpi: null, currentBottleneck: "Decision", instructions: "Use truth", autonomyPolicy: "Read", escalationPolicy: "Purchases", existingWorkTitles: [], operatingMode: "LIVE_INTERNAL", toolEvidence: [{ toolId: "rykas.operations.snapshot", summary: "ready", output: { sourcingAllowed: true, realTruth: { stale: false, purchaseExecuted: false, data: { purchaseCandidates: [candidate], opportunities: [candidate], blockers: [] } } } }] });
    expect(plan.ownerNeeded).toBe(true); expect(plan.ownerDecision).toMatchObject({ category: "PURCHASE_INVENTORY", availableChoices: ["BUY", "NEEDS_MORE_RESEARCH", "PASS"], boundedPayload: { opportunityId: "US:B000000001", purchaseExecuted: false } });
    expect(plan.ownerDecision?.context).toContain('"expectedProfit":48');
  });
});
