import { execFileSync } from "node:child_process";
import { closeSync, existsSync, openSync, rmSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deriveAmazonTruthDisplay } from "@/lib/rykas-amazon-truth-display";
import { RYKAS_AMAZON_TRUTH_REFRESH_CAPABILITY, rykasAmazonTruthRefreshRequestSchema, rykasAmazonTruthRefreshResultSchema } from "@/lib/rykas-amazon-truth-contract";
import { RYKAS_READ_CAPABILITY, rykasTruthResultSchema, serializeRykasReadRequest } from "@/lib/rykas-truth-contract";
import { amazonRefreshRetryDelayMs, queueAmazonTruthRefreshIfStale } from "@/server/agent/rykas-amazon-refresh-service";
import { claimRunnerWork, submitRunnerResult } from "@/server/agent/runner-service";
import { financialSnapshotV11Fixture } from "../../ryanos-agent-runner/tests/fixtures/financial-snapshot-v1-1";

const databasePath = path.join(process.cwd(), `.rykas-amazon-refresh-${process.pid}.db`);
const databaseUrl = `file:${databasePath.replaceAll("\\", "/")}`;
let db: PrismaClient; let userId: string; let projectId: string; let runner: Awaited<ReturnType<PrismaClient["agentRunner"]["create"]>>;

beforeAll(async () => {
  process.env.FEATURE_RUNNER_EXECUTION = "true";
  process.env.FEATURE_RYKAS_AMAZON_TRUTH_REFRESH = "true";
  closeSync(openSync(databasePath, "w"));
  const prismaCli = path.join(process.cwd(), "node_modules", "prisma", "build", "index.js");
  execFileSync(process.execPath, [prismaCli, "db", "push", "--skip-generate", "--schema", path.join(process.cwd(), "prisma", "schema.prisma")], { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe" });
  db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const user = await db.user.create({ data: { email: "amazon-refresh@example.com", passwordHash: "test" } }); userId = user.id;
  const domain = await db.executionDomain.create({ data: { userId, name: "Rykas", slug: "rykas" } });
  const project = await db.executionProject.create({ data: { userId, domainId: domain.id, name: "Rykas" } }); projectId = project.id;
  await db.agentProjectConfig.create({ data: { userId, projectId, profile: "RYKAS_GM", operatingMode: "LIVE_INTERNAL", enabled: true, objective: "Increase realized profit safely.", projectManagerInstructions: "Use Rykas truth.", autonomyPolicy: "Bounded internal refreshes only.", escalationPolicy: "Consequential actions require Ryan.", workspaceIdentifier: "rykas-repo", maxConcurrentWorkItems: 2 } });
  runner = await db.agentRunner.create({ data: { userId, keyId: `amazon-refresh-${process.pid}`, name: "Amazon refresh test runner" } });
}, 60_000);

afterAll(async () => { await db?.$disconnect(); for (const suffix of ["", "-journal", "-wal", "-shm"]) if (existsSync(`${databasePath}${suffix}`)) rmSync(`${databasePath}${suffix}`); });

function truth(current: boolean) {
  const snapshot = JSON.parse(JSON.stringify(financialSnapshotV11Fixture));
  const amazon = snapshot.checklist.find((item: { inputKey: string }) => item.inputKey === "AMAZON_SALES_INVENTORY")!;
  amazon.status = current ? "CURRENT" : "STALE";
  amazon.reason = current ? null : "Amazon source truth is stale.";
  snapshot.missingInputs = current ? snapshot.missingInputs.filter((item: string) => item !== "AMAZON_SALES_INVENTORY") : [...new Set<string>([...snapshot.missingInputs, "AMAZON_SALES_INVENTORY"])];
  return rykasTruthResultSchema.parse({ schemaVersion: "RYKAS_TRUTH_READ_V1", operation: "FINANCIAL_SNAPSHOT", readOnly: true, purchaseAuthorized: false, purchaseExecuted: false, observedAt: "2026-08-30T15:00:00.000Z", authoritativeSource: "Rykas SQL Server database rykas via loopback Command Center marts", sourceUpdatedAt: "2026-08-21T00:00:00.000Z", freshness: current ? "CURRENT" : "STALE", stale: !current, data: { actionSummary: [], capital: null, opportunities: [], purchaseCandidates: [], blockers: current ? [] : [{ id: "amazon-stale", opportunityId: null, stage: "SYSTEM", code: "FINANCIAL_TRUTH_BLOCKED", summary: "Amazon source truth is stale.", sourceUpdatedAt: "2026-08-21T00:00:00.000Z", stale: true }], detail: null, financialSnapshot: snapshot, capitalPlan: null, replenishmentCandidates: null, capitalReleaseCandidates: null, saleEventEvaluation: null } });
}

const refreshResult = rykasAmazonTruthRefreshResultSchema.parse({ schemaVersion: "RYKAS_AMAZON_TRUTH_REFRESH_V1", status: "CURRENT", executionState: "COMPLETED", failureCode: null, message: "Core Amazon truth is current.", ordersThrough: "2026-08-30", financialsThrough: "2026-08-25", inventoryThrough: "2026-08-30", observedAt: "2026-08-30T15:13:13.256Z", remainingStaleAreas: [], downloadedReports: ["GET_FLAT_FILE_ALL_ORDERS_DATA_BY_LAST_UPDATE_GENERAL", "GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2", "GET_FBA_INVENTORY_PLANNING_DATA"], loadedSources: ["dbo.OrderHistory", "dbo.PaymentTransactionsV2", "dbo.FbaInventoryPlanning"], ownerFinancialTruthChanged: false, poCertificationChanged: false, purchaseExecuted: false, listingChanged: false, priceChanged: false, orderCreated: false, paymentExecuted: false, startedAt: "2026-08-30T15:11:46.206Z", completedAt: "2026-08-30T15:13:13.257Z" });

describe("Rykas Amazon truth refresh orchestration", () => {
  it("accepts only the fixed request and shows safe status", () => {
    expect(rykasAmazonTruthRefreshRequestSchema.safeParse({ version: 1, operation: "AMAZON_TRUTH_REFRESH" }).success).toBe(true);
    expect(rykasAmazonTruthRefreshRequestSchema.safeParse({ version: 1, operation: "AMAZON_TRUTH_REFRESH", command: "whoami" }).success).toBe(false);
    expect(deriveAmazonTruthDisplay([{ requiredCapability: RYKAS_AMAZON_TRUTH_REFRESH_CAPABILITY, state: "RUNNING" }], [])).toMatchObject({ status: "REFRESHING" });
    expect(deriveAmazonTruthDisplay([], [{ type: "RYKAS_AMAZON_TRUTH_CURRENT", createdAt: new Date(), metadata: JSON.stringify(refreshResult) }])).toMatchObject({ status: "CURRENT", ordersThrough: "2026-08-30", financialsThrough: "2026-08-25", inventoryThrough: "2026-08-30" });
  });

  it("queues stale refresh automatically, then rereads finance without NEED RYAN", async () => {
    const read = await db.agentWorkItem.create({ data: { userId, projectId, idempotencyKey: "initial-stale-financial-read", title: "Read financial snapshot", objective: "Read current truth.", expectedValue: "Current checklist.", acceptanceCriteria: "Bounded read.", agentRole: "RYKAS_CFO_CAPITAL_STEWARD", actionCategory: "RESEARCH_READ_ONLY", requiredCapability: RYKAS_READ_CAPABILITY, sandboxPolicy: "READ_ONLY", networkPolicy: "LOCALHOST_ONLY", operationalContext: serializeRykasReadRequest({ version: 1, operation: "FINANCIAL_SNAPSHOT", input: {} }), workspaceIdentifier: "rykas-repo", priority: "HIGH", maxAttempts: 2 } });
    const readClaim = await claimRunnerWork(runner, { capabilities: [RYKAS_READ_CAPABILITY], version: "test" }, db);
    await submitRunnerResult(runner, read.id, readClaim!.claimToken, { status: "SUCCEEDED", summary: "Bounded financial read.", filesChanged: [], testsRun: ["schema"], testResults: "passed", unresolvedIssues: ["AMAZON_SALES_INVENTORY"], evidence: "Safe summary", acceptanceCriteriaSatisfied: true, recommendedQaAction: "PASS", providerIdentifier: "rykas-local-truth", rykasTruthResult: truth(false) }, db, new Date("2026-08-30T15:00:00.000Z"));
    const refresh = await db.agentWorkItem.findFirstOrThrow({ where: { projectId, requiredCapability: RYKAS_AMAZON_TRUTH_REFRESH_CAPABILITY } });
    expect(JSON.parse(refresh.operationalContext!)).toEqual({ version: 1, operation: "AMAZON_TRUTH_REFRESH" });
    expect(await db.agentDecision.count({ where: { projectId } })).toBe(0);
    const refreshClaim = await claimRunnerWork(runner, { capabilities: [RYKAS_AMAZON_TRUTH_REFRESH_CAPABILITY], version: "test" }, db, new Date("2026-08-30T15:01:00.000Z"));
    await submitRunnerResult(runner, refresh.id, refreshClaim!.claimToken, { status: "SUCCEEDED", summary: "Amazon system truth is current.", filesChanged: [], testsRun: ["SQL freshness"], testResults: "current", unresolvedIssues: [], evidence: "Safe timestamps only", acceptanceCriteriaSatisfied: true, recommendedQaAction: "PASS", providerIdentifier: "rykas-local-amazon-truth-refresh", rykasAmazonTruthRefreshResult: refreshResult }, db, new Date("2026-08-30T15:03:00.000Z"));
    expect((await db.agentWorkItem.findUniqueOrThrow({ where: { id: refresh.id } })).state).toBe("DONE");
    expect(await db.agentWorkItem.count({ where: { projectId, requiredCapability: RYKAS_READ_CAPABILITY, title: { contains: "after Amazon refresh" } } })).toBe(1);
    expect(await db.agentDecision.count({ where: { projectId } })).toBe(0);
    expect(await db.agentEvent.count({ where: { projectId, type: "RYKAS_AMAZON_TRUTH_CURRENT" } })).toBe(1);
    expect((await queueAmazonTruthRefreshIfStale({ userId, projectId, truth: truth(false) }, db, new Date("2026-08-30T16:00:00.000Z"))).reason).toBe("COOLDOWN");
    expect((await queueAmazonTruthRefreshIfStale({ userId, projectId, truth: truth(true) }, db, new Date("2026-08-30T20:00:00.000Z"))).reason).toBe("NOT_REQUIRED");
  });

  it("uses bounded exponential backoff", () => {
    expect(amazonRefreshRetryDelayMs(1)).toBe(30 * 60_000);
    expect(amazonRefreshRetryDelayMs(2)).toBe(60 * 60_000);
    expect(amazonRefreshRetryDelayMs(99)).toBe(4 * 60 * 60_000);
  });
});
