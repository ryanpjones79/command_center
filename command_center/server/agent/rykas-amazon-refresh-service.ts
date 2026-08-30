import type { PrismaClient } from "@prisma/client";
import { activeAgentWorkStates } from "@/lib/agent-state-machine";
import { RYKAS_AMAZON_TRUTH_REFRESH_CAPABILITY, serializeRykasAmazonTruthRefreshRequest, type RykasAmazonTruthRefreshResult } from "@/lib/rykas-amazon-truth-contract";
import { RYKAS_READ_CAPABILITY, serializeRykasReadRequest, type RykasTruthResult } from "@/lib/rykas-truth-contract";
import { recordAgentEvent } from "@/server/agent/event-service";

const SUCCESS_COOLDOWN_MS = 4 * 60 * 60_000;
const FAILURE_BACKOFF_MS = 30 * 60_000;

export function financialSnapshotNeedsAmazonRefresh(truth: RykasTruthResult) {
  if (truth.operation !== "FINANCIAL_SNAPSHOT") return false;
  const snapshot = truth.data.financialSnapshot;
  return Boolean(snapshot?.checklist.some((item) => item.inputKey === "AMAZON_SALES_INVENTORY" && item.status !== "CURRENT"));
}

export function amazonRefreshRetryDelayMs(attempt: number) {
  return Math.min(4 * 60 * 60_000, FAILURE_BACKOFF_MS * 2 ** Math.max(0, attempt - 1));
}

export async function queueAmazonTruthRefreshIfStale(input: { userId: string; projectId: string; truth: RykasTruthResult }, db: PrismaClient, now = new Date()) {
  if (!financialSnapshotNeedsAmazonRefresh(input.truth) || process.env.FEATURE_RYKAS_AMAZON_TRUTH_REFRESH !== "true") return { queued: false, reason: "NOT_REQUIRED" as const };
  const active = await db.agentWorkItem.findFirst({ where: { userId: input.userId, projectId: input.projectId, requiredCapability: RYKAS_AMAZON_TRUTH_REFRESH_CAPABILITY, state: { in: activeAgentWorkStates } } });
  if (active) return { queued: false, reason: "ALREADY_ACTIVE" as const, workItemId: active.id };
  const latest = await db.agentRun.findFirst({ where: { userId: input.userId, projectId: input.projectId, workItem: { requiredCapability: RYKAS_AMAZON_TRUTH_REFRESH_CAPABILITY } }, orderBy: { completedAt: "desc" } });
  if (latest?.completedAt) {
    const interval = latest.status === "SUCCEEDED" ? SUCCESS_COOLDOWN_MS : FAILURE_BACKOFF_MS;
    if (now.getTime() - latest.completedAt.getTime() < interval) return { queued: false, reason: latest.status === "SUCCEEDED" ? "COOLDOWN" as const : "BACKOFF" as const };
  }
  const bucket = Math.floor(now.getTime() / SUCCESS_COOLDOWN_MS);
  const work = await db.agentWorkItem.upsert({ where: { projectId_idempotencyKey: { projectId: input.projectId, idempotencyKey: `rykas-amazon-truth-refresh:${bucket}` } }, update: {}, create: {
    userId: input.userId, projectId: input.projectId, idempotencyKey: `rykas-amazon-truth-refresh:${bucket}`, title: "Refresh Amazon system truth", objective: "Refresh only authoritative Amazon orders, settlement financials, and inventory data through the fixed local Rykas workflow.", expectedValue: "Current Amazon system truth for deterministic Capital Steward decisions.", acceptanceCriteria: "Authoritative SQL confirms current orders, financials, and inventory; owner financial truth, PO certification, purchases, listings, prices, and payments remain unchanged.", agentRole: "RYKAS_AMAZON_TRUTH_REFRESHER", actionCategory: "INTERNAL_DATA_REFRESH", requiredCapability: RYKAS_AMAZON_TRUTH_REFRESH_CAPABILITY, sandboxPolicy: "WORKSPACE_WRITE", networkPolicy: "LOCALHOST_ONLY", operationalContext: serializeRykasAmazonTruthRefreshRequest(), workspaceIdentifier: "rykas-repo", priority: "HIGH", maxAttempts: 3
  } });
  await recordAgentEvent({ userId: input.userId, projectId: input.projectId, workItemId: work.id, idempotencyKey: `rykas-amazon-refresh-queued:${work.id}`, type: "RYKAS_AMAZON_TRUTH_REFRESH_QUEUED", summary: "Amazon truth is stale; the bounded local refresh was queued automatically.", metadata: { capability: RYKAS_AMAZON_TRUTH_REFRESH_CAPABILITY, ownerDecisionRequired: false, purchaseExecuted: false } }, db);
  return { queued: true, reason: "STALE" as const, workItemId: work.id };
}

export async function queueFinancialSnapshotAfterAmazonRefresh(input: { userId: string; projectId: string; refreshWorkItemId: string; result: RykasAmazonTruthRefreshResult }, db: PrismaClient, now = new Date()) {
  const request = serializeRykasReadRequest({ version: 1, operation: "FINANCIAL_SNAPSHOT", input: {} });
  const work = await db.agentWorkItem.upsert({ where: { projectId_idempotencyKey: { projectId: input.projectId, idempotencyKey: `rykas-financial-recheck:amazon:${input.refreshWorkItemId}` } }, update: {}, create: {
    userId: input.userId, projectId: input.projectId, idempotencyKey: `rykas-financial-recheck:amazon:${input.refreshWorkItemId}`, parentWorkItemId: input.refreshWorkItemId, title: "Recheck Rykas financial truth after Amazon refresh", objective: "Read the deterministic financial snapshot after authoritative Amazon system truth becomes current.", expectedValue: "Capital Steward recalculates from current Amazon freshness without changing owner truth.", acceptanceCriteria: "A fresh FINANCIAL_SNAPSHOT is read and RYKAS_GM is scheduled to reevaluate; no purchase, payment, or listing action occurs.", agentRole: "RYKAS_CFO_CAPITAL_STEWARD", actionCategory: "RESEARCH_READ_ONLY", requiredCapability: RYKAS_READ_CAPABILITY, sandboxPolicy: "READ_ONLY", networkPolicy: "LOCALHOST_ONLY", operationalContext: request, workspaceIdentifier: "rykas-repo", priority: "HIGH", maxAttempts: 2
  } });
  await db.agentProjectConfig.update({ where: { projectId: input.projectId }, data: { nextAgentReviewAt: now, health: "ON_TRACK", currentBottleneck: "Amazon truth is current; Capital Steward is recalculating." } });
  await recordAgentEvent({ userId: input.userId, projectId: input.projectId, workItemId: input.refreshWorkItemId, idempotencyKey: `rykas-amazon-refresh-current:${input.refreshWorkItemId}`, type: "RYKAS_AMAZON_TRUTH_CURRENT", summary: "Amazon truth is current; a fresh financial snapshot was queued automatically.", metadata: { ordersThrough: input.result.ordersThrough, financialsThrough: input.result.financialsThrough, inventoryThrough: input.result.inventoryThrough, observedAt: input.result.observedAt, ownerFinancialTruthChanged: false, poCertificationChanged: false, purchaseExecuted: false, listingChanged: false } }, db);
  return work;
}
