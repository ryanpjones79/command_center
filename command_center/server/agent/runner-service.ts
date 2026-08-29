import { randomUUID } from "node:crypto";
import type { AgentRunner, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { assertPhase2Capability } from "@/lib/agent-capabilities";
import { evaluateAgentPolicy } from "@/lib/agent-policy";
import { prisma } from "@/lib/prisma";
import { recordAgentEvent } from "@/server/agent/event-service";
import { createOwnerDecision } from "@/server/agent/work-service";

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
  modelIdentifier: z.string().max(200).optional()
});
export type RunnerResult = z.infer<typeof runnerResultSchema>;

export async function claimRunnerWork(runner: AgentRunner, input: { capabilities: string[]; version: string }, db: PrismaClient = prisma, now = new Date()) {
  if (process.env.FEATURE_RUNNER_EXECUTION === "false") return null;
  const capabilities = input.capabilities.map(assertPhase2Capability);
  await db.agentWorkItem.updateMany({ where: { userId: runner.userId, state: { in: ["PLANNING", "RUNNING"] }, leaseExpiresAt: { lt: now } },
    data: { state: "RETRY", claimToken: null, leaseExpiresAt: null, heartbeatAt: null, nextEligibleRunAt: now, blocker: "Expired runner lease recovered; retry is eligible." } });
  await db.agentRunner.update({ where: { id: runner.id }, data: { status: "ONLINE", version: input.version, capabilities: JSON.stringify(capabilities), lastHeartbeatAt: now } });
  const candidates = await db.agentWorkItem.findMany({
    where: { userId: runner.userId, state: { in: ["QUEUED", "RETRY"] }, requiredCapability: { in: capabilities },
      OR: [{ nextEligibleRunAt: null }, { nextEligibleRunAt: { lte: now } }],
      project: { agentConfig: { is: { enabled: true, pausedAt: null, operatingMode: "LIVE_INTERNAL" } } } },
    include: { project: { include: { agentConfig: true } } }, orderBy: [{ priority: "desc" }, { createdAt: "asc" }], take: 20
  });
  for (const item of candidates) {
    if (!item.workspaceIdentifier) continue;
    assertPhase2Capability(item.requiredCapability);
    const policy = evaluateAgentPolicy({ category: item.actionCategory as never, projectProfile: item.project.agentConfig?.profile });
    if (policy !== "ALLOW") continue;
    const claimToken = randomUUID();
    const leaseExpiresAt = new Date(now.getTime() + leaseMs);
    const claimed = await db.agentWorkItem.updateMany({ where: { id: item.id, state: item.state, OR: [{ claimToken: null }, { leaseExpiresAt: { lt: now } }] },
      data: { state: "PLANNING", claimToken, leaseExpiresAt, heartbeatAt: now, executorIdentifier: runner.keyId } });
    if (claimed.count !== 1) continue;
    await db.agentWorkItem.update({ where: { id: item.id }, data: { state: "RUNNING", attemptCount: { increment: 1 }, startedAt: item.startedAt ?? now } });
    const run = await db.agentRun.create({ data: { userId: item.userId, projectId: item.projectId, workItemId: item.id,
      idempotencyKey: `runner:${item.id}:${item.attemptCount + 1}`, role: item.agentRole, runType: "LOCAL_CODEX", status: "RUNNING",
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
    summary: nextState === "READY_FOR_REVIEW" ? "Independent local QA passed; branch is ready for owner review and was not merged." : result.qaFeedback ?? result.summary }, db);
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
