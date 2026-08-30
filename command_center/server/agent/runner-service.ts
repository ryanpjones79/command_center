import { randomUUID } from "node:crypto";
import type { AgentRunner, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { assertLocalRunnerCapability } from "@/lib/agent-capabilities";
import { evaluateAgentPolicy } from "@/lib/agent-policy";
import { prisma } from "@/lib/prisma";
import { recordAgentEvent } from "@/server/agent/event-service";
import { reclassifySignalCareProspectResearch } from "@/server/agent/signalcare-research-service";
import { createOwnerDecision } from "@/server/agent/work-service";
import { RYKAS_READ_CAPABILITY, rykasTruthResultSchema, serializeRykasReadRequest } from "@/lib/rykas-truth-contract";
import { RYKAS_OWNER_DATA_CAPABILITY, rykasOwnerFinancialUpdateResultSchema } from "@/lib/rykas-owner-financial-contract";

const leaseMs = 5 * 60 * 1000;
export const runnerResultSchema = z.object({
  status: z.enum(["SUCCEEDED", "FAILED"]), summary: z.string().min(1).max(8000),
  filesChanged: z.array(z.string()).max(500).default([]), testsRun: z.array(z.string()).max(100).default([]),
  testResults: z.string().max(20000).default(""), commitSha: z.string().max(80).nullable().optional(),
  branch: z.string().max(500).nullable().optional(), worktree: z.string().max(2000).nullable().optional(),
  unresolvedIssues: z.array(z.string()).max(100).default([]), evidence: z.string().max(30000),
  acceptanceCriteriaSatisfied: z.boolean(), recommendedQaAction: z.enum(["PASS", "REPAIR", "ESCALATE"]),
  qaFeedback: z.string().max(10000).optional(), externalThreadId: z.string().max(500).optional(),
  externalRunId: z.string().max(500).optional(), providerIdentifier: z.string().max(100).optional(),
  modelIdentifier: z.string().max(200).optional(), rykasTruthResult: rykasTruthResultSchema.optional(),
  rykasOwnerFinancialUpdateResult: rykasOwnerFinancialUpdateResultSchema.optional()
});
export type RunnerResult = z.infer<typeof runnerResultSchema>;

export async function claimRunnerWork(runner: AgentRunner, input: { capabilities: string[]; version: string }, db: PrismaClient = prisma, now = new Date()) {
  if (process.env.FEATURE_RUNNER_EXECUTION !== "true") return null;
  const capabilities = input.capabilities.map(assertLocalRunnerCapability);
  const signalCareConfigs = await db.agentProjectConfig.findMany({
    where: { userId: runner.userId, profile: "SIGNALCARE_GM" }
  });
  for (const config of signalCareConfigs) {
    await reclassifySignalCareProspectResearch(config, db);
  }
  await db.agentWorkItem.updateMany({ where: { userId: runner.userId, state: { in: ["PLANNING", "RUNNING"] }, leaseExpiresAt: { lt: now } },
    data: { state: "RETRY", claimToken: null, leaseExpiresAt: null, heartbeatAt: null, nextEligibleRunAt: now, blocker: "Expired runner lease recovered; retry is eligible." } });
  await db.agentRunner.update({ where: { id: runner.id }, data: { status: "ONLINE", version: input.version, capabilities: JSON.stringify(capabilities), lastHeartbeatAt: now } });
  const candidates = await db.agentWorkItem.findMany({
    where: { userId: runner.userId, state: { in: ["QUEUED", "RETRY"] }, requiredCapability: { in: capabilities },
      AND: [{ OR: [{ nextEligibleRunAt: null }, { nextEligibleRunAt: { lte: now } }] },
        { OR: [{ dependsOnWorkItemId: null }, { dependsOnWorkItem: { is: { integrationStatus: "INTEGRATED" } } }] }],
      project: { agentConfig: { is: { enabled: true, pausedAt: null, operatingMode: "LIVE_INTERNAL" } } },
    },
    include: { project: { include: { agentConfig: true } } }, orderBy: [{ priority: "desc" }, { createdAt: "asc" }], take: 20
  });
  for (const item of candidates) {
    if (
      item.project.agentConfig?.profile === "SIGNALCARE_GM" &&
      item.actionCategory === "RESEARCH_READ_ONLY"
    ) {
      continue;
    }
    if (!item.workspaceIdentifier) continue;
    assertLocalRunnerCapability(item.requiredCapability);
    if ([RYKAS_READ_CAPABILITY, RYKAS_OWNER_DATA_CAPABILITY].includes(item.requiredCapability as never) && item.project.agentConfig?.profile !== "RYKAS_GM") continue;
    const policy = evaluateAgentPolicy({ category: item.actionCategory as never, projectProfile: item.project.agentConfig?.profile });
    if (policy !== "ALLOW") continue;
    const claimToken = randomUUID();
    const leaseExpiresAt = new Date(now.getTime() + leaseMs);
    const claimed = await db.agentWorkItem.updateMany({ where: { id: item.id, state: item.state, OR: [{ claimToken: null }, { leaseExpiresAt: { lt: now } }] },
      data: { state: "PLANNING", claimToken, leaseExpiresAt, heartbeatAt: now, executorIdentifier: runner.keyId } });
    if (claimed.count !== 1) continue;
    await db.agentWorkItem.update({ where: { id: item.id }, data: { state: "RUNNING", attemptCount: { increment: 1 }, startedAt: item.startedAt ?? now } });
    const run = await db.agentRun.create({ data: { userId: item.userId, projectId: item.projectId, workItemId: item.id,
      idempotencyKey: `runner:${item.id}:${item.attemptCount + 1}`, role: item.agentRole, runType: item.requiredCapability === RYKAS_READ_CAPABILITY ? "RYKAS_TRUTH_READ" : item.requiredCapability === RYKAS_OWNER_DATA_CAPABILITY ? "RYKAS_OWNER_DATA_UPDATE" : "LOCAL_CODEX", status: "RUNNING",
      executorIdentifier: runner.keyId, workspaceIdentifier: item.workspaceIdentifier, repositoryIdentifier: item.repositoryIdentifier } });
    await db.agentRunner.update({ where: { id: runner.id }, data: { currentWorkItemId: item.id } });
    await recordAgentEvent({ userId: item.userId, projectId: item.projectId, workItemId: item.id, runId: run.id, type: "WORK_DISPATCHED", summary: `${item.title} claimed by registered local runner.` }, db);
    return { workItemId: item.id, projectId: item.projectId, runId: run.id, claimToken, leaseExpiresAt: leaseExpiresAt.toISOString(),
      workerType: item.requiredCapability, objective: item.objective, expectedValue: item.expectedValue,
      acceptanceCriteria: item.acceptanceCriteria, projectObjective: item.project.agentConfig?.objective ?? "",
      currentBottleneck: item.project.agentConfig?.currentBottleneck ?? "", workspaceIdentifier: item.workspaceIdentifier,
      allowedCapability: item.requiredCapability, sandboxPolicy: item.sandboxPolicy, networkPolicy: item.networkPolicy,
      operationalContext: item.operationalContext, attempt: item.attemptCount + 1, maxAttempts: item.maxAttempts,
      externalThreadId: item.externalThreadId };
  }
  return null;
}

async function claimedWork(runner: AgentRunner, workItemId: string, claimToken: string, db: PrismaClient) {
  const item = await db.agentWorkItem.findFirst({ where: { id: workItemId, userId: runner.userId, claimToken, executorIdentifier: runner.keyId } });
  if (!item) throw new Error("Claim not found for this runner.");
  return item;
}

export async function heartbeatRunnerWork(runner: AgentRunner, workItemId: string, claimToken: string, db: PrismaClient = prisma, now = new Date()) {
  const item = await claimedWork(runner, workItemId, claimToken, db);
  if (item.leaseExpiresAt && item.leaseExpiresAt < now) throw new Error("Claim lease has expired.");
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  await db.agentWorkItem.update({ where: { id: item.id }, data: { heartbeatAt: now, leaseExpiresAt } });
  await db.agentRunner.update({ where: { id: runner.id }, data: { status: "ONLINE", lastHeartbeatAt: now, currentWorkItemId: item.id } });
  return { leaseExpiresAt: leaseExpiresAt.toISOString() };
}

export async function submitRunnerResult(runner: AgentRunner, workItemId: string, claimToken: string, raw: unknown, db: PrismaClient = prisma, now = new Date()) {
  const result = runnerResultSchema.parse(raw);
  const item = await db.agentWorkItem.findFirst({ where: { id: workItemId, userId: runner.userId }, include: { runs: { orderBy: { startedAt: "desc" }, take: 1 } } });
  if (!item) throw new Error("Work item not found for this runner.");
  const run = item.runs[0];
  if (run?.status === "SUCCEEDED") return { duplicate: true, state: item.state };
  if (item.claimToken !== claimToken || item.executorIdentifier !== runner.keyId) throw new Error("Claim not found for this runner.");
  if (item.requiredCapability === RYKAS_OWNER_DATA_CAPABILITY && result.status === "SUCCEEDED") {
    if (result.providerIdentifier !== "rykas-local-owner-data" || !result.rykasOwnerFinancialUpdateResult) throw new Error("Rykas owner-data work requires a schema-valid deterministic adapter result.");
    const saved = rykasOwnerFinancialUpdateResultSchema.parse(result.rykasOwnerFinancialUpdateResult);
    await db.$transaction([
      db.agentRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", providerIdentifier: result.providerIdentifier, executorIdentifier: runner.keyId, operationalResultSummary: result.summary, evidence: result.evidence, structuredOutcome: JSON.stringify(saved), testOutcome: result.testResults, completedAt: now } }),
      db.agentWorkItem.update({ where: { id: item.id }, data: { state: "DONE", resultSummary: result.summary, evidenceSummary: result.evidence, integrationStatus: "NOT_REQUIRED", blocker: null, claimToken: null, leaseExpiresAt: null, heartbeatAt: null, completedAt: now } }),
      db.agentRunner.update({ where: { id: runner.id }, data: { currentWorkItemId: null, lastHeartbeatAt: now, lastSuccessfulRunAt: now, recentFailure: null } }),
      db.agentProjectConfig.update({ where: { projectId: item.projectId }, data: { nextAgentReviewAt: now } })
    ]);
    const readRequest = serializeRykasReadRequest({ version: 1, operation: "FINANCIAL_SNAPSHOT", input: {} });
    await db.agentWorkItem.upsert({ where: { projectId_idempotencyKey: { projectId: item.projectId, idempotencyKey: `rykas-financial-recheck:${item.id}` } }, update: {}, create: { userId: item.userId, projectId: item.projectId, idempotencyKey: `rykas-financial-recheck:${item.id}`, title: "Recheck Rykas financial truth", objective: "Recalculate the deterministic financial checklist and capital plan after the bounded owner-data save.", expectedValue: "Return a current or explicitly blocked capital plan from Rykas truth.", acceptanceCriteria: "The local adapter returns FINANCIAL_SNAPSHOT; missing values remain null and no purchase, payment, or commitment occurs.", agentRole: "RYKAS_CFO_CAPITAL_STEWARD", actionCategory: "RESEARCH_READ_ONLY", requiredCapability: RYKAS_READ_CAPABILITY, sandboxPolicy: "READ_ONLY", networkPolicy: "LOCALHOST_ONLY", operationalContext: readRequest, workspaceIdentifier: "rykas-repo", priority: "HIGH", maxAttempts: 2 } });
    await recordAgentEvent({ userId: item.userId, projectId: item.projectId, workItemId: item.id, runId: run.id, idempotencyKey: `rykas-owner-data-saved:${run.id}`, type: "RYKAS_OWNER_DATA_SAVED", summary: "Bounded owner financial facts were saved to Rykas manual truth and a fresh read was queued.", metadata: { writes: saved.writes, purchaseExecuted: false, debtPaymentExecuted: false, financialCommitmentCreated: false } }, db);
    return { duplicate: false, state: "DONE" as const };
  }
  if (item.requiredCapability === RYKAS_READ_CAPABILITY && result.status === "SUCCEEDED") {
    if (result.providerIdentifier !== "rykas-local-truth" || !result.rykasTruthResult) throw new Error("Rykas truth work requires a schema-valid deterministic adapter result.");
    const truth = rykasTruthResultSchema.parse(result.rykasTruthResult);
    await db.$transaction([
      db.agentRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", providerIdentifier: result.providerIdentifier, executorIdentifier: runner.keyId, operationalResultSummary: result.summary, evidence: result.evidence, structuredOutcome: JSON.stringify(truth), testOutcome: result.testResults, completedAt: now } }),
      db.agentWorkItem.update({ where: { id: item.id }, data: { state: "DONE", resultSummary: result.summary, evidenceSummary: result.evidence, integrationStatus: "NOT_REQUIRED", blocker: truth.data.blockers.length ? truth.data.blockers.map((entry) => entry.summary).join(" ").slice(0, 8000) : null, claimToken: null, leaseExpiresAt: null, heartbeatAt: null, completedAt: now } }),
      db.agentRunner.update({ where: { id: runner.id }, data: { currentWorkItemId: null, lastHeartbeatAt: now, lastSuccessfulRunAt: now, recentFailure: null } }),
      db.agentProjectConfig.update({ where: { projectId: item.projectId }, data: { nextAgentReviewAt: now } })
    ]);
    await recordAgentEvent({ userId: item.userId, projectId: item.projectId, workItemId: item.id, runId: run.id, idempotencyKey: `rykas-truth-read:${run.id}`, type: "RYKAS_TRUTH_READ", summary: `${truth.operation} read existing Rykas truth through the bounded local adapter.`, metadata: { observedAt: truth.observedAt, authoritativeSource: truth.authoritativeSource, sourceUpdatedAt: truth.sourceUpdatedAt, freshness: truth.freshness, purchaseExecuted: false } }, db);
    for (const opportunity of [...truth.data.opportunities, ...truth.data.purchaseCandidates].filter((value, index, all) => all.findIndex((candidate) => candidate.opportunityId === value.opportunityId) === index)) await recordAgentEvent({ userId: item.userId, projectId: item.projectId, workItemId: item.id, runId: run.id, idempotencyKey: `rykas-opportunity:${run.id}:${opportunity.opportunityId}`, type: "RYKAS_OPPORTUNITY_OBSERVED", summary: `${opportunity.opportunityId} observed in Rykas state ${opportunity.actionState}.`, metadata: { opportunityId: opportunity.opportunityId, actionState: opportunity.actionState, freshness: opportunity.freshness.classification, missingEvidence: opportunity.missingEvidence } }, db);
    for (const candidate of truth.data.purchaseCandidates) await recordAgentEvent({ userId: item.userId, projectId: item.projectId, workItemId: item.id, runId: run.id, idempotencyKey: `rykas-purchase-ready:${run.id}:${candidate.opportunityId}`, type: "RYKAS_PURCHASE_CANDIDATE_READY", summary: `${candidate.opportunityId} is purchase-decision-ready in persisted Rykas truth; no purchase was authorized or executed.`, metadata: { opportunityId: candidate.opportunityId, purchaseAuthorized: false, purchaseExecuted: false } }, db);
    if (truth.stale) await recordAgentEvent({ userId: item.userId, projectId: item.projectId, workItemId: item.id, runId: run.id, idempotencyKey: `rykas-stale:${run.id}`, type: "RYKAS_DATA_STALE", summary: "Rykas returned stale evidence; BUY must not be recommended until the authoritative evidence is refreshed." }, db);
    if (truth.data.blockers.length) await recordAgentEvent({ userId: item.userId, projectId: item.projectId, workItemId: item.id, runId: run.id, idempotencyKey: `rykas-blocked:${run.id}`, type: "RYKAS_DATA_BLOCKED", summary: `${truth.data.blockers.length} bounded Rykas blocker(s) were observed.`, metadata: { blockers: truth.data.blockers.map((entry) => ({ code: entry.code, opportunityId: entry.opportunityId })) } }, db);
    return { duplicate: false, state: "DONE" as const };
  }
  if (item.requiredCapability !== RYKAS_READ_CAPABILITY && result.rykasTruthResult) throw new Error("Rykas truth results are not accepted for other capabilities.");
  if (item.requiredCapability !== RYKAS_OWNER_DATA_CAPABILITY && result.rykasOwnerFinancialUpdateResult) throw new Error("Rykas owner-data results are not accepted for other capabilities.");
  const structured = JSON.stringify(result);
  await db.agentRun.update({ where: { id: run.id }, data: { status: result.status, providerIdentifier: result.providerIdentifier ?? "openai",
    modelIdentifier: result.modelIdentifier, externalThreadId: result.externalThreadId, externalRunId: result.externalRunId,
    operationalResultSummary: result.summary, evidence: result.evidence, structuredOutcome: structured, commitSha: result.commitSha,
    testOutcome: result.testResults, qaFeedback: result.qaFeedback, error: result.status === "FAILED" ? result.summary : null, completedAt: now } });
  const exhausted = item.attemptCount >= item.maxAttempts;
  const nextState = result.status === "FAILED" || result.recommendedQaAction === "REPAIR"
    ? (exhausted ? "FAILED" : "RETRY")
    : result.recommendedQaAction === "ESCALATE" ? "NEEDS_RYAN" : "READY_FOR_REVIEW";
  await db.agentWorkItem.update({ where: { id: item.id }, data: { state: nextState, resultSummary: result.summary, evidenceSummary: result.evidence,
    externalThreadId: result.externalThreadId, externalRunId: result.externalRunId, repositoryIdentifier: result.branch ?? item.repositoryIdentifier,
    blocker: nextState === "RETRY" || nextState === "FAILED" ? result.qaFeedback ?? result.summary : null,
    nextEligibleRunAt: nextState === "RETRY" ? now : null, claimToken: null, leaseExpiresAt: null, heartbeatAt: null,
    integrationStatus: nextState === "READY_FOR_REVIEW" ? "PENDING_REVIEW" : item.integrationStatus,
    completedAt: ["FAILED", "READY_FOR_REVIEW"].includes(nextState) ? now : null } });
  await db.agentRunner.update({ where: { id: runner.id }, data: { currentWorkItemId: null, lastHeartbeatAt: now,
    lastSuccessfulRunAt: nextState === "READY_FOR_REVIEW" ? now : runner.lastSuccessfulRunAt,
    recentFailure: nextState === "FAILED" ? result.summary : null } });
  await db.agentProjectConfig.update({ where: { projectId: item.projectId }, data: { nextAgentReviewAt: now } });
  if (nextState === "NEEDS_RYAN") {
    await createOwnerDecision({ userId: item.userId, projectId: item.projectId, workItemId: item.id, runId: run.id,
      idempotencyKey: `runner-qa-escalation:${item.id}:${item.attemptCount}`, plan: { category: "BINDING_COMMITMENT",
        question: `Review the verified blocker for ${item.title}?`, context: result.qaFeedback ?? result.summary,
        recommendedChoice: "REVIEW DETAILS", availableChoices: ["REVIEW DETAILS", "REVISE", "PASS"], expectedUpside: item.expectedValue,
        risk: "Independent verification found an issue requiring owner judgment.", createsActionRequest: false } }, db);
  }
  await recordAgentEvent({ userId: item.userId, projectId: item.projectId, workItemId: item.id, runId: run.id,
    type: nextState === "READY_FOR_REVIEW" ? "QA_PASSED" : nextState === "NEEDS_RYAN" ? "OWNER_ESCALATION_CREATED" : "QA_FAILED",
    summary: nextState === "READY_FOR_REVIEW" ? "Independent local QA passed; branch is ready for owner review and was not merged." : result.qaFeedback ?? result.summary,
    metadata: nextState === "READY_FOR_REVIEW" ? { movementKind: "CODE_READY_FOR_REVIEW", integrationStatus: "PENDING_REVIEW" } : undefined }, db);
  if (item.requiredCapability === RYKAS_READ_CAPABILITY) await recordAgentEvent({ userId: item.userId, projectId: item.projectId, workItemId: item.id, runId: run.id, idempotencyKey: `rykas-read-failed:${run.id}`, type: "RYKAS_DATA_BLOCKED", summary: "The bounded Rykas truth read failed closed; no substitute values were created.", metadata: { retryEligible: nextState === "RETRY", purchaseExecuted: false } }, db);
  return { duplicate: false, state: nextState };
}

export async function releaseRunnerWork(runner: AgentRunner, workItemId: string, claimToken: string, reason: string, db: PrismaClient = prisma, now = new Date()) {
  const item = await claimedWork(runner, workItemId, claimToken, db);
  const nextState = item.attemptCount >= item.maxAttempts ? "FAILED" : "RETRY";
  await db.agentWorkItem.update({ where: { id: item.id }, data: { state: nextState, claimToken: null, leaseExpiresAt: null, heartbeatAt: null,
    blocker: reason, nextEligibleRunAt: nextState === "RETRY" ? now : null } });
  await db.agentRunner.update({ where: { id: runner.id }, data: { currentWorkItemId: null, recentFailure: reason, lastHeartbeatAt: now } });
  return { state: nextState };
}
