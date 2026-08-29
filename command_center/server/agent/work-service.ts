import type { AgentWorkState, PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { assertAgentWorkTransition } from "@/lib/agent-state-machine";
import { evaluateAgentPolicy, type AgentActionCategory } from "@/lib/agent-policy";
import { prisma } from "@/lib/prisma";
import type { OwnerDecisionPlan } from "@/server/agent/contracts";
import { recordAgentEvent } from "@/server/agent/event-service";
import {
  evaluateSignalCareOutreachReadiness,
  parseSignalCareDecisionTarget,
  signalCareOutreachDecisionChoices
} from "@/server/agent/signalcare-outreach-policy";

type TransitionInput = {
  blocker?: string | null;
  resultSummary?: string | null;
  evidenceSummary?: string | null;
  nextEligibleRunAt?: Date | null;
};

export async function transitionAgentWorkItem(
  userId: string,
  workItemId: string,
  nextState: AgentWorkState,
  input: TransitionInput = {},
  db: PrismaClient = prisma
) {
  const current = await db.agentWorkItem.findFirst({ where: { id: workItemId, userId } });
  if (!current) throw new Error("AgentWorkItem not found for this user.");
  assertAgentWorkTransition(current.state, nextState);
  const now = new Date();

  return db.agentWorkItem.update({
    where: { id: current.id },
    data: {
      state: nextState,
      blocker: input.blocker === undefined ? current.blocker : input.blocker,
      resultSummary: input.resultSummary === undefined ? current.resultSummary : input.resultSummary,
      evidenceSummary:
        input.evidenceSummary === undefined ? current.evidenceSummary : input.evidenceSummary,
      nextEligibleRunAt:
        input.nextEligibleRunAt === undefined ? current.nextEligibleRunAt : input.nextEligibleRunAt,
      startedAt: nextState === "RUNNING" ? current.startedAt ?? now : current.startedAt,
      completedAt: ["DONE", "READY_FOR_REVIEW", "FAILED", "PARKED"].includes(nextState) ? now : null
    }
  });
}

export async function createOwnerDecision(
  input: {
    userId: string;
    projectId: string;
    workItemId?: string | null;
    runId?: string | null;
    idempotencyKey: string;
    profile?: string | null;
    plan: OwnerDecisionPlan;
  },
  db: PrismaClient = prisma
) {
  let plan = input.plan;
  const policy = evaluateAgentPolicy({
    category: plan.category,
    projectProfile: input.profile,
    amountCents: plan.amountCents
  });
  if (policy === "ALLOW") throw new Error("Owner decision cannot be used to gate an ALLOW action.");
  if (policy === "DENY") throw new Error("Denied actions cannot be converted into owner approvals.");

  if (
    input.profile === "SIGNALCARE_GM" &&
    plan.category === "SEND_EMAIL_OR_MESSAGE"
  ) {
    if (plan.targetEntity?.type !== "SIGNALCARE_PROSPECT") {
      throw new Error(
        "SignalCare outreach requires a typed target prospect."
      );
    }
    const readiness = await evaluateSignalCareOutreachReadiness(
      input.userId,
      input.projectId,
      plan.targetEntity,
      db
    );
    if (!readiness.ready) {
      throw new Error(
        `SignalCare outreach is not ready: ${readiness.reasons.join(" ")}`
      );
    }
    plan = {
      ...plan,
      question: `Approve first outreach to ${readiness.target.name}?`,
      context: `${plan.context}\n\nEvidence-backed internal outreach package:\n${JSON.stringify(readiness.package)}`,
      recommendedChoice: "APPROVE",
      availableChoices: [...signalCareOutreachDecisionChoices],
      capability: "SEND_EMAIL_OR_MESSAGE",
      boundedPayload: {
        targetEntity: readiness.target,
        qualificationActionId: readiness.qualificationActionId,
        outreachPackage: readiness.package,
        externalOutreachPerformed: false
      }
    };
  }

  const decision = await db.agentDecision.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    update: {},
    create: {
      userId: input.userId,
      projectId: input.projectId,
      originatingWorkItemId: input.workItemId ?? null,
      originatingRunId: input.runId ?? null,
      idempotencyKey: input.idempotencyKey,
      category: plan.category,
      question: plan.question,
      context: plan.context,
      recommendedChoice: plan.recommendedChoice,
      availableChoices: JSON.stringify(plan.availableChoices),
      expectedUpside: plan.expectedUpside,
      risk: plan.risk,
      amountCents: plan.amountCents ?? null,
      currency: plan.currency ?? null
    }
  });

  if (input.workItemId && plan.createsActionRequest !== false) {
    const boundedPayload = plan.boundedPayload ?? {
      question: plan.question,
      context: plan.context,
      amountCents: plan.amountCents ?? null,
      currency: plan.currency ?? null
    };
    const serializedPayload = JSON.stringify(boundedPayload);
    const actionFingerprint = createHash("sha256")
      .update(`${input.userId}:${input.projectId}:${input.idempotencyKey}:${serializedPayload}`)
      .digest("hex");
    await db.agentActionRequest.upsert({
      where: { idempotencyKey: `action:${input.idempotencyKey}` },
      update: { decisionId: decision.id },
      create: {
        userId: input.userId,
        projectId: input.projectId,
        workItemId: input.workItemId,
        originatingRunId: input.runId ?? null,
        decisionId: decision.id,
        idempotencyKey: `action:${input.idempotencyKey}`,
        actionFingerprint,
        category: plan.category,
        capability: plan.capability ?? plan.category,
        state: "AWAITING_OWNER_APPROVAL",
        boundedPayload: serializedPayload,
        authorizationBounds: JSON.stringify({
          oneTime: true,
          actionFingerprint,
          amountCents: plan.amountCents ?? null,
          currency: plan.currency ?? null
        }),
        amountCents: plan.amountCents ?? null,
        currency: plan.currency ?? null,
        expiresAt: plan.authorizationExpiresAt ?? null
      }
    });
  }

  await recordAgentEvent(
    {
      userId: input.userId,
      projectId: input.projectId,
      workItemId: input.workItemId,
      runId: input.runId,
      decisionId: decision.id,
      idempotencyKey: `decision-created:${decision.id}`,
      type: "OWNER_ESCALATION_CREATED",
      summary: plan.question,
      metadata: { category: plan.category, policy, movementKind:
        plan.category === "SEND_EMAIL_OR_MESSAGE" ? "SIGNALCARE_OUTREACH_DECISION_READY" :
        plan.category === "PURCHASE_INVENTORY" ? "RYKAS_PURCHASE_DECISION_READY" :
        plan.category.startsWith("CCHCS_") ? "CCHCS_OWNER_DECISION_READY" : undefined }
    },
    db
  );
  return decision;
}

function resolutionState(choice: string): AgentWorkState {
  const normalized = choice.trim().toUpperCase().replace(/[_-]+/g, " ");
  if (["APPROVE", "BUY"].includes(normalized)) return "AWAITING_EXECUTION";
  if (["PASS", "CANCEL", "CANCELLED", "DECLINE", "REJECT"].includes(normalized)) return "PARKED";
  if (["MORE RESEARCH", "NEEDS MORE RESEARCH", "REVISE", "REVIEW DETAILS", "REDUCE"].includes(normalized)) return "QUEUED";
  throw new Error("Selected owner choice has no safe deterministic resolution mapping.");
}

export async function resolveOwnerDecision(
  userId: string,
  decisionId: string,
  selectedChoice: string,
  db: PrismaClient = prisma
) {
  const decision = await db.agentDecision.findFirst({
    where: { id: decisionId, userId },
    include: { originatingWorkItem: true, actionRequest: true }
  });
  if (!decision) throw new Error("AgentDecision not found for this user.");
  if (decision.status !== "PENDING") return decision;

  const choices = JSON.parse(decision.availableChoices) as string[];
  const canonicalChoice = choices.find(
    (choice) => choice.toUpperCase() === selectedChoice.trim().toUpperCase()
  );
  if (!canonicalChoice) throw new Error("Selected choice is not available for this decision.");
  const nextState = resolutionState(canonicalChoice);

  if (decision.actionRequest?.expiresAt && decision.actionRequest.expiresAt <= new Date()) {
    await db.agentActionRequest.update({
      where: { id: decision.actionRequest.id },
      data: { state: "EXPIRED" }
    });
    throw new Error("This transaction-specific authorization request has expired.");
  }

  if (
    nextState === "AWAITING_EXECUTION" &&
    decision.category === "SEND_EMAIL_OR_MESSAGE"
  ) {
    const config = await db.agentProjectConfig.findUnique({
      where: { projectId: decision.projectId }
    });
    if (config?.profile === "SIGNALCARE_GM") {
      const target = parseSignalCareDecisionTarget(
        decision.actionRequest?.boundedPayload
      );
      if (!target) {
        throw new Error(
          "SignalCare outreach authorization has no typed target prospect."
        );
      }
      const readiness = await evaluateSignalCareOutreachReadiness(
        userId,
        decision.projectId,
        target,
        db
      );
      if (!readiness.ready) {
        throw new Error(
          `SignalCare outreach is no longer ready: ${readiness.reasons.join(" ")}`
        );
      }
    }
  }
  const resultingAction =
    nextState === "AWAITING_EXECUTION"
      ? "Transaction-specific owner authorization recorded. The action is awaiting an eligible executor; nothing external has occurred."
      : nextState === "QUEUED"
        ? "Work returned to the bounded queue for revision or additional research."
        : "Work parked by owner decision.";

  const resolved = await db.agentDecision.update({
    where: { id: decision.id },
    data: {
      status: "RESOLVED",
      selectedChoice: canonicalChoice,
      resultingAction,
      resolvedAt: new Date()
    }
  });

  if (decision.actionRequest) {
    await db.agentActionRequest.update({
      where: { id: decision.actionRequest.id },
      data:
        nextState === "AWAITING_EXECUTION"
          ? { state: "AWAITING_EXECUTION", authorizedAt: new Date() }
          : nextState === "QUEUED"
            ? { state: "PROPOSED", decisionId: null }
            : { state: "CANCELLED", cancelledAt: new Date() }
    });
  }

  if (decision.originatingWorkItem && decision.originatingWorkItem.state === "NEEDS_RYAN") {
    await transitionAgentWorkItem(userId, decision.originatingWorkItem.id, nextState, {
      blocker: null,
      nextEligibleRunAt: nextState === "QUEUED" ? new Date() : null
    }, db);
  }

  await recordAgentEvent(
    {
      userId,
      projectId: decision.projectId,
      workItemId: decision.originatingWorkItemId,
      runId: decision.originatingRunId,
      decisionId: decision.id,
      idempotencyKey: `decision-resolved:${decision.id}`,
      type: "OWNER_DECISION_RESOLVED",
      summary: `${decision.question} — ${canonicalChoice}`,
      metadata: { selectedChoice: canonicalChoice, resultingAction }
    },
    db
  );
  return resolved;
}

export async function setAgentProjectPaused(
  userId: string,
  projectId: string,
  paused: boolean,
  db: PrismaClient = prisma
) {
  const config = await db.agentProjectConfig.findFirst({ where: { projectId, userId } });
  if (!config) throw new Error("AgentProjectConfig not found for this user.");
  const updated = await db.agentProjectConfig.update({
    where: { id: config.id },
    data: {
      enabled: !paused,
      pausedAt: paused ? new Date() : null,
      nextAgentReviewAt: paused ? config.nextAgentReviewAt : new Date(),
      leaseToken: null,
      leaseExpiresAt: null
    }
  });
  await recordAgentEvent(
    {
      userId,
      projectId,
      type: paused ? "PROJECT_PAUSED" : "PROJECT_RESUMED",
      summary: paused ? "Agent PM paused by owner." : "Agent PM resumed by owner."
    },
    db
  );
  return updated;
}

export function isOwnerGatedCategory(category: AgentActionCategory) {
  return evaluateAgentPolicy({ category }) === "REQUIRE_OWNER_APPROVAL";
}
