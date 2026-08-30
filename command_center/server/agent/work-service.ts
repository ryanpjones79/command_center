import type { AgentWorkState, PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { SIGNALCARE_WEB_RESEARCH_CAPABILITY } from "@/lib/agent-capabilities";
import { assertAgentWorkTransition } from "@/lib/agent-state-machine";
import { evaluateAgentPolicy, type AgentActionCategory } from "@/lib/agent-policy";
import { prisma } from "@/lib/prisma";
import {
  parseRykasTruthReconciliation,
  rykasTruthReconciliationDecision,
  rykasTruthReconciliationSchema,
  RYKAS_TRUTH_RECONCILIATION_KIND
} from "@/lib/rykas-owner-data-contract";
import {
  RYKAS_READ_CAPABILITY,
  serializeRykasReadRequest
} from "@/lib/rykas-truth-contract";
import { RYKAS_OWNER_DATA_CAPABILITY, rykasOwnerFinancialUpdateSchema, serializeRykasOwnerFinancialUpdate } from "@/lib/rykas-owner-financial-contract";
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

export async function submitRykasOwnerFinancialUpdate(
  userId: string,
  decisionId: string,
  rawUpdate: unknown,
  db: PrismaClient = prisma
) {
  const update = rykasOwnerFinancialUpdateSchema.parse(rawUpdate);
  const decision = await loadDecisionForResolution(userId, decisionId, db);
  if (!decision || decision.status !== "PENDING") throw new Error("Pending Rykas financial truth decision not found.");
  if (!parseRykasTruthReconciliation(decision.context)) throw new Error("Decision is not a Rykas financial truth update.");
  if (decision.actionRequest) throw new Error("Financial data maintenance must not create an action request.");
  const work = decision.originatingWorkItem;
  if (!work) throw new Error("Rykas financial truth work was not found.");
  const serializedUpdate = serializeRykasOwnerFinancialUpdate(update);
  if (work.requiredCapability === RYKAS_OWNER_DATA_CAPABILITY && work.operationalContext) {
    if (work.operationalContext !== serializedUpdate) {
      throw new Error("A Rykas financial truth update is already processing. Retry the preserved submission or wait for it to finish.");
    }
    return { queued: true, workItemId: work.id };
  }
  if (work.state !== "NEEDS_RYAN") throw new Error("Rykas financial truth work is not awaiting owner input.");
  const now = new Date();
  await db.agentDecision.update({ where: { id: decision.id }, data: { status: "PENDING", selectedChoice: null, resultingAction: "PROCESSING: bounded owner facts are queued for the Rykas manual truth layer. The form remains pending until Rykas confirms SAVED.", resolvedAt: null } });
  await transitionAgentWorkItem(userId, work.id, "QUEUED", { blocker: null, nextEligibleRunAt: now }, db);
  await db.agentWorkItem.update({ where: { id: work.id }, data: { title: "Save Rykas financial truth update", objective: "Persist only the owner-confirmed financial facts into the existing Rykas manual truth layer.", expectedValue: "Refresh the deterministic financial checklist without copying authoritative truth into RyanOS.", acceptanceCriteria: "The local Rykas API accepts the strict bounded payload, returns a schema-valid save receipt, and performs no purchase, payment, or financial commitment.", agentRole: "RYKAS_OWNER_DATA_STEWARD", actionCategory: "RESEARCH_READ_ONLY", requiredCapability: RYKAS_OWNER_DATA_CAPABILITY, sandboxPolicy: "WORKSPACE_WRITE", networkPolicy: "LOCALHOST_ONLY", operationalContext: serializedUpdate, workspaceIdentifier: "rykas-repo", attemptCount: 0, maxAttempts: 2, resultSummary: null, evidenceSummary: null, completedAt: null } });
  await recordAgentEvent({ userId, projectId: decision.projectId, workItemId: work.id, idempotencyKey: `rykas-owner-data-queued:${decision.id}`, type: "RYKAS_OWNER_DATA_UPDATE_QUEUED", summary: "Consolidated owner financial facts queued for the bounded Rykas manual truth update.", metadata: { purchaseAuthorized: false, purchaseExecuted: false, debtPaymentAuthorized: false, debtPaymentExecuted: false } }, db);
  return { queued: true, workItemId: work.id };
}

export async function retryRykasOwnerFinancialUpdate(
  userId: string,
  decisionId: string,
  db: PrismaClient = prisma
) {
  const decision = await loadDecisionForResolution(userId, decisionId, db);
  const recoverablePrematureResolution = decision?.status === "RESOLVED" && decision.selectedChoice === "UPDATED_AND_RECHECK" &&
    decision.originatingWorkItem?.requiredCapability === RYKAS_OWNER_DATA_CAPABILITY && ["FAILED", "RETRY"].includes(decision.originatingWorkItem.state);
  if (!decision || (decision.status !== "PENDING" && !recoverablePrematureResolution)) throw new Error("Pending Rykas financial truth decision not found.");
  if (!parseRykasTruthReconciliation(decision.context)) throw new Error("Decision is not a Rykas financial truth update.");
  if (decision.actionRequest) throw new Error("Financial data maintenance must not create an action request.");
  const work = decision.originatingWorkItem;
  if (!work || work.requiredCapability !== RYKAS_OWNER_DATA_CAPABILITY || !work.operationalContext) {
    throw new Error("No preserved Rykas financial truth submission is available to retry.");
  }
  rykasOwnerFinancialUpdateSchema.parse(JSON.parse(work.operationalContext));
  if (recoverablePrematureResolution) {
    await db.agentDecision.update({ where: { id: decision.id }, data: { status: "PENDING", selectedChoice: null, resultingAction: "NEEDS ATTENTION: the earlier save was not confirmed. The exact owner submission is preserved for retry.", resolvedAt: null } });
  }
  if (work.state === "FAILED") {
    // This narrowly scoped recovery is permitted only after the owner-update capability and payload are revalidated above.
    await db.agentWorkItem.update({ where: { id: work.id }, data: { state: "RETRY", blocker: "Retry requested with the preserved owner submission.", nextEligibleRunAt: new Date(), completedAt: null } });
  } else if (work.state === "PARKED") {
    await transitionAgentWorkItem(userId, work.id, "QUEUED", { blocker: "Retry requested with the preserved owner submission.", nextEligibleRunAt: new Date() }, db);
  } else if (!["QUEUED", "RETRY"].includes(work.state)) {
    throw new Error("The Rykas financial truth update is already processing.");
  }
  await db.agentWorkItem.update({ where: { id: work.id }, data: { maxAttempts: Math.max(work.maxAttempts, work.attemptCount + 1), claimToken: null, leaseExpiresAt: null, heartbeatAt: null, completedAt: null, nextEligibleRunAt: new Date(), resultSummary: null, evidenceSummary: null } });
  await db.agentDecision.update({ where: { id: decision.id }, data: { resultingAction: "PROCESSING: retrying the preserved bounded owner update. No form re-entry or financial action is required." } });
  await recordAgentEvent({ userId, projectId: decision.projectId, workItemId: work.id, type: "RYKAS_OWNER_DATA_RETRY_QUEUED", summary: "The exact preserved owner financial truth payload was queued for retry.", metadata: { payloadPreserved: true, purchaseExecuted: false, debtPaymentExecuted: false, financialCommitmentCreated: false } }, db);
  return { queued: true, workItemId: work.id };
}

export async function recoverPrematurelyResolvedRykasOwnerUpdates(
  userId: string,
  db: PrismaClient = prisma,
  now = new Date()
) {
  const candidates = await db.agentDecision.findMany({
    where: { userId, status: "RESOLVED", selectedChoice: "UPDATED_AND_RECHECK" },
    include: { originatingWorkItem: true, actionRequest: true }
  });
  let recovered = 0;
  for (const decision of candidates) {
    const work = decision.originatingWorkItem;
    if (decision.actionRequest || !work || work.requiredCapability !== RYKAS_OWNER_DATA_CAPABILITY || !["FAILED", "RETRY"].includes(work.state) || !work.operationalContext) continue;
    if (!parseRykasTruthReconciliation(decision.context)) continue;
    try {
      rykasOwnerFinancialUpdateSchema.parse(JSON.parse(work.operationalContext));
    } catch {
      continue;
    }
    await db.agentDecision.update({ where: { id: decision.id }, data: { status: "PENDING", selectedChoice: null, resultingAction: "NEEDS ATTENTION: the earlier Rykas save was not confirmed. The exact bounded submission is preserved for retry without owner re-entry.", resolvedAt: null } });
    await db.agentProjectConfig.updateMany({ where: { userId, projectId: decision.projectId, profile: "RYKAS_GM" }, data: { health: "NEEDS_ATTENTION", currentBottleneck: "A prior owner financial update needs a safe retry using its preserved submission.", nextAgentReviewAt: now } });
    await recordAgentEvent({ userId, projectId: decision.projectId, workItemId: work.id, decisionId: decision.id, idempotencyKey: `rykas-premature-resolution-recovered:${decision.id}`, type: "RYKAS_OWNER_DATA_SAVE_FAILED", summary: "A prematurely resolved owner financial update was reopened because no confirmed SAVED receipt exists. Its exact submission remains available for retry.", metadata: { payloadPreserved: true, purchaseExecuted: false, debtPaymentExecuted: false, financialCommitmentCreated: false } }, db);
    recovered += 1;
  }
  return { recovered };
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
  const ownerDataRequest = plan.ownerDataRequest
    ? rykasTruthReconciliationSchema.parse(plan.ownerDataRequest)
    : null;
  if (ownerDataRequest) {
    const config = await db.agentProjectConfig.findFirst({
      where: { userId: input.userId, projectId: input.projectId }
    });
    if ((input.profile ?? config?.profile) !== "RYKAS_GM") {
      throw new Error("Rykas owner-data decisions are eligible only for RYKAS_GM.");
    }
    plan = rykasTruthReconciliationDecision(ownerDataRequest);
  }
  const policy = evaluateAgentPolicy({
    category: plan.category,
    projectProfile: input.profile,
    amountCents: plan.amountCents
  });
  if (policy === "ALLOW" && !ownerDataRequest)
    throw new Error("Owner decision cannot be used to gate an ALLOW action.");
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

  validateOwnerDecisionChoices(plan.availableChoices, plan.recommendedChoice);

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
        ownerDataRequest ? "RYKAS_TRUTH_RECONCILIATION_REQUIRED" :
        plan.category === "SEND_EMAIL_OR_MESSAGE" ? "SIGNALCARE_OUTREACH_DECISION_READY" :
        plan.category === "PURCHASE_INVENTORY" ? "RYKAS_PURCHASE_DECISION_READY" :
        plan.category.startsWith("CCHCS_") ? "CCHCS_OWNER_DECISION_READY" : undefined }
    },
    db
  );
  return decision;
}

export function resolutionState(choice: string): AgentWorkState {
  const normalized = choice.trim().toUpperCase().replace(/[_-]+/g, " ");
  if (["APPROVE", "BUY"].includes(normalized)) return "AWAITING_EXECUTION";
  if (["PASS", "CANCEL", "CANCELLED", "DECLINE", "REJECT", "REQUIRES RECONCILIATION", "CAPITAL UNKNOWN"].includes(normalized)) return "PARKED";
  if (["MORE RESEARCH", "NEEDS MORE RESEARCH", "REVISE", "REVIEW DETAILS", "REDUCE", "UPDATED AND RECHECK"].includes(normalized)) return "QUEUED";
  throw new Error("Selected owner choice has no safe deterministic resolution mapping.");
}

export function validateOwnerDecisionChoices(
  choices: string[],
  recommendedChoice?: string | null
) {
  if (choices.length < 2 || choices.length > 6)
    throw new Error("Owner decisions require between two and six choices.");
  const normalized = choices.map((choice) => choice.trim().toUpperCase());
  if (normalized.some((choice) => !choice) || new Set(normalized).size !== choices.length)
    throw new Error("Owner decision choices must be non-empty and unique.");
  for (const choice of choices) resolutionState(choice);
  if (
    recommendedChoice &&
    !normalized.includes(recommendedChoice.trim().toUpperCase())
  ) {
    throw new Error("The recommended owner choice must be available.");
  }
}

const rykasRecheckRequest = {
  version: 1,
  operation: "OPERATIONS_SNAPSHOT",
  input: { limit: 10 }
} as const;

async function resolveRykasTruthReconciliation(
  userId: string,
  decision: Awaited<ReturnType<typeof loadDecisionForResolution>>,
  canonicalChoice: string,
  db: PrismaClient
) {
  if (!decision) throw new Error("AgentDecision not found for this user.");
  const context = parseRykasTruthReconciliation(decision.context);
  if (!context) throw new Error("Rykas owner-data decision context is invalid.");
  const now = new Date();
  const nextState = resolutionState(canonicalChoice);
  const recheck = canonicalChoice === "UPDATED_AND_RECHECK";
  const blocker = recheck
    ? null
    : canonicalChoice === "REQUIRES_RECONCILIATION"
      ? "Owner reports that the authoritative Rykas PO/capital source requires reconciliation; buying remains blocked."
      : "Safe inventory capital remains unknown in Rykas; buying remains blocked.";
  const resultingAction = recheck
    ? "A fresh bounded Rykas truth read was queued. The owner click did not certify PO truth or set capital."
      : `${blocker} No purchase or financial action occurred.`;

  if (
    decision.actionRequest &&
    (decision.actionRequest.executionStartedAt ||
      decision.actionRequest.executedAt ||
      decision.actionRequest.verifiedAt ||
      ["EXECUTING", "VERIFYING", "COMPLETED"].includes(
        decision.actionRequest.state
      ))
  ) {
    throw new Error(
      "Rykas owner-data decisions cannot resolve an action request with execution evidence."
    );
  }

  const resolved = await db.agentDecision.update({
    where: { id: decision.id },
    data: {
      status: "RESOLVED",
      selectedChoice: canonicalChoice,
      resultingAction,
      resolvedAt: now
    }
  });
  if (decision.actionRequest) {
    await db.agentActionRequest.update({
      where: { id: decision.actionRequest.id },
      data: { state: "CANCELLED", cancelledAt: now }
    });
  }

  if (decision.originatingWorkItem?.state === "NEEDS_RYAN") {
    await transitionAgentWorkItem(
      userId,
      decision.originatingWorkItem.id,
      nextState,
      {
        blocker,
        nextEligibleRunAt: recheck ? now : null
      },
      db
    );
    if (recheck) {
      await db.agentWorkItem.update({
        where: { id: decision.originatingWorkItem.id },
        data: {
          title: "Recheck authoritative Rykas PO and capital truth",
          objective:
            "Reread the existing Rykas SQL-backed PO and safe-capital truth after the owner updated its authoritative source.",
          expectedValue:
            "Determine whether buying is unblocked without copying or certifying financial facts in RyanOS.",
          acceptanceCriteria:
            "The fixed local adapter returns a schema-valid OPERATIONS_SNAPSHOT; buying remains blocked when PO truth is stale or safe inventory capital is unknown.",
          agentRole: "RYKAS_TRUTH_READER",
          actionCategory: "RESEARCH_READ_ONLY",
          requiredCapability: RYKAS_READ_CAPABILITY,
          sandboxPolicy: "READ_ONLY",
          networkPolicy: "LOCALHOST_ONLY",
          operationalContext: serializeRykasReadRequest(rykasRecheckRequest),
          workspaceIdentifier: "rykas-repo",
          repositoryIdentifier: null,
          attemptCount: 0,
          maxAttempts: 2,
          resultSummary: null,
          evidenceSummary: null,
          executorIdentifier: null,
          providerIdentifier: null,
          externalThreadId: null,
          externalRunId: null,
          claimToken: null,
          leaseExpiresAt: null,
          heartbeatAt: null,
          completedAt: null
        }
      });
    }
  } else if (recheck) {
    await db.agentWorkItem.upsert({
      where: {
        projectId_idempotencyKey: {
          projectId: decision.projectId,
          idempotencyKey: `rykas-owner-recheck:${decision.id}`
        }
      },
      update: {},
      create: {
        userId,
        projectId: decision.projectId,
        idempotencyKey: `rykas-owner-recheck:${decision.id}`,
        title: "Recheck authoritative Rykas PO and capital truth",
        objective:
          "Reread the existing Rykas SQL-backed PO and safe-capital truth after the owner updated its authoritative source.",
        expectedValue:
          "Determine whether buying is unblocked without copying or certifying financial facts in RyanOS.",
        acceptanceCriteria:
          "The fixed local adapter returns a schema-valid OPERATIONS_SNAPSHOT; buying remains blocked when PO truth is stale or safe inventory capital is unknown.",
        agentRole: "RYKAS_TRUTH_READER",
        actionCategory: "RESEARCH_READ_ONLY",
        requiredCapability: RYKAS_READ_CAPABILITY,
        sandboxPolicy: "READ_ONLY",
        networkPolicy: "LOCALHOST_ONLY",
        operationalContext: serializeRykasReadRequest(rykasRecheckRequest),
        workspaceIdentifier: "rykas-repo",
        priority: "HIGH",
        maxAttempts: 2,
        nextEligibleRunAt: now
      }
    });
  }

  const parkedReviewAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  await db.agentProjectConfig.updateMany({
    where: { userId, projectId: decision.projectId, profile: "RYKAS_GM" },
    data: {
      health: recheck ? "NEEDS_ATTENTION" : "BLOCKED",
      currentBottleneck: recheck
        ? "Fresh authoritative Rykas PO/capital truth recheck queued."
        : blocker,
      nextAgentReviewAt: recheck ? now : parkedReviewAt
    }
  });
  await recordAgentEvent(
    {
      userId,
      projectId: decision.projectId,
      workItemId: decision.originatingWorkItemId,
      runId: decision.originatingRunId,
      decisionId: decision.id,
      idempotencyKey: `rykas-truth-reconciliation-resolved:${decision.id}`,
      type: "OWNER_DECISION_RESOLVED",
      summary: `${decision.question} — ${canonicalChoice}`,
      metadata: {
        decisionKind: RYKAS_TRUTH_RECONCILIATION_KIND,
        selectedChoice: canonicalChoice,
        freshReadQueued: recheck,
        ownerClickCertifiedTruth: false,
        purchaseAuthorized: false,
        purchaseExecuted: false
      }
    },
    db
  );
  return resolved;
}

function loadDecisionForResolution(
  userId: string,
  decisionId: string,
  db: PrismaClient
) {
  return db.agentDecision.findFirst({
    where: { id: decisionId, userId },
    include: { originatingWorkItem: true, actionRequest: true }
  });
}

export async function resolveOwnerDecision(
  userId: string,
  decisionId: string,
  selectedChoice: string,
  db: PrismaClient = prisma
) {
  const decision = await loadDecisionForResolution(userId, decisionId, db);
  if (!decision) throw new Error("AgentDecision not found for this user.");
  if (decision.status !== "PENDING") return decision;

  const choices = JSON.parse(decision.availableChoices) as string[];
  const canonicalChoice = choices.find(
    (choice) => choice.toUpperCase() === selectedChoice.trim().toUpperCase()
  );
  if (!canonicalChoice) throw new Error("Selected choice is not available for this decision.");
  if (parseRykasTruthReconciliation(decision.context)) {
    return resolveRykasTruthReconciliation(
      userId,
      decision,
      canonicalChoice,
      db
    );
  }
  const nextState = resolutionState(canonicalChoice);
  const signalCareConfig =
    decision.category === "SEND_EMAIL_OR_MESSAGE"
      ? await db.agentProjectConfig.findFirst({
          where: {
            userId,
            projectId: decision.projectId,
            profile: "SIGNALCARE_GM"
          }
        })
      : null;
  const signalCareTarget = signalCareConfig
    ? parseSignalCareDecisionTarget(decision.actionRequest?.boundedPayload)
    : null;

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
    if (signalCareConfig) {
      if (!signalCareTarget) {
        throw new Error(
          "SignalCare outreach authorization has no typed target prospect."
        );
      }
      const readiness = await evaluateSignalCareOutreachReadiness(
        userId,
        decision.projectId,
        signalCareTarget,
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

  if (signalCareConfig && signalCareTarget) {
    const queueItems = await db.queueItem.findMany({
      where: { userId, lane: { in: ["signalcare", "pipeline"] } }
    });
    const targetQueueItem = queueItems.find(
      (item) =>
        item.recipient.trim().toLowerCase() ===
        signalCareTarget.name.trim().toLowerCase()
    );
    if (targetQueueItem && canonicalChoice === "PASS") {
      await db.queueItem.update({
        where: { id: targetQueueItem.id },
        data: {
          status: "passed",
          nextAction: "Passed by owner; no outreach authorized or performed.",
          resolvedAt: new Date()
        }
      });
    }
    if (targetQueueItem && canonicalChoice === "NEEDS_MORE_RESEARCH") {
      await db.queueItem.update({
        where: { id: targetQueueItem.id },
        data: {
          status: "queued",
          nextAction:
            "Resolve the owner-requested evidence gap for this exact prospect.",
          resolvedAt: null
        }
      });
      if (decision.originatingWorkItemId) {
        await db.agentWorkItem.updateMany({
          where: {
            id: decision.originatingWorkItemId,
            userId,
            state: "QUEUED"
          },
          data: {
            title: `Resolve evidence gaps for ${signalCareTarget.name}`,
            objective: `Perform bounded public qualification follow-up for ${signalCareTarget.name}.`,
            actionCategory: "RESEARCH_READ_ONLY",
            requiredCapability: SIGNALCARE_WEB_RESEARCH_CAPABILITY,
            sandboxPolicy: "READ_ONLY",
            networkPolicy: "ALLOWLIST",
            operationalContext: JSON.stringify({
              researchMode: "QUALIFY_EXISTING_PROSPECT",
              targetProspect: signalCareTarget.name,
              instructions:
                "Resolve only the evidence gap requested by the owner; do not send outreach."
            }),
            nextEligibleRunAt: new Date()
          }
        });
      }
    }
    if (canonicalChoice === "NEEDS_MORE_RESEARCH") {
      await db.agentProjectConfig.update({
        where: { id: signalCareConfig.id },
        data: { nextAgentReviewAt: new Date() }
      });
    } else if (canonicalChoice === "PASS") {
      const [actionableProspects, activeWork, pendingDecisions] =
        await Promise.all([
          db.queueItem.count({
            where: {
              userId,
              lane: { in: ["signalcare", "pipeline"] },
              status: { notIn: ["done", "killed", "passed"] }
            }
          }),
          db.agentWorkItem.count({
            where: {
              userId,
              projectId: decision.projectId,
              state: {
                in: [
                  "QUEUED",
                  "PLANNING",
                  "RUNNING",
                  "VERIFYING",
                  "RETRY",
                  "NEEDS_RYAN",
                  "AWAITING_EXECUTION"
                ]
              }
            }
          }),
          db.agentDecision.count({
            where: {
              userId,
              projectId: decision.projectId,
              status: "PENDING"
            }
          })
        ]);
      if (actionableProspects === 0 && activeWork === 0 && pendingDecisions === 0) {
        await db.agentProjectConfig.update({
          where: { id: signalCareConfig.id },
          data: { nextAgentReviewAt: new Date() }
        });
      }
    }
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

export const BROKEN_RYKAS_OWNER_DATA_DECISION_ID =
  "cmtf0aqkm00evt20p5ucwikif";

export async function recoverBrokenRykasOwnerDataDecision(
  userId: string | undefined,
  db: PrismaClient = prisma,
  now = new Date()
) {
  const decision = await db.agentDecision.findFirst({
    where: {
      id: BROKEN_RYKAS_OWNER_DATA_DECISION_ID,
      ...(userId ? { userId } : {})
    },
    include: { originatingWorkItem: true, actionRequest: true }
  });
  if (!decision) return { recovered: false, reason: "NOT_FOUND" as const };

  const alreadyRecovered =
    decision.status === "CANCELLED" &&
    (!decision.originatingWorkItem ||
      decision.originatingWorkItem.state !== "NEEDS_RYAN") &&
    (!decision.actionRequest || decision.actionRequest.state === "CANCELLED");
  if (alreadyRecovered)
    return { recovered: false, reason: "ALREADY_RECOVERED" as const };

  if (
    decision.actionRequest &&
    (decision.actionRequest.executionStartedAt ||
      decision.actionRequest.executedAt ||
      decision.actionRequest.verifiedAt ||
      ["EXECUTING", "VERIFYING", "COMPLETED"].includes(
        decision.actionRequest.state
      ))
  ) {
    throw new Error(
      "The broken Rykas decision has execution evidence and cannot be recovered automatically."
    );
  }

  await db.agentDecision.update({
    where: { id: decision.id },
    data: {
      status: "CANCELLED",
      selectedChoice: null,
      resultingAction:
        "Superseded because its owner choices had no safe deterministic mapping. No authorization was recorded and no action occurred.",
      resolvedAt: now
    }
  });
  if (decision.actionRequest && decision.actionRequest.state !== "CANCELLED") {
    await db.agentActionRequest.update({
      where: { id: decision.actionRequest.id },
      data: {
        state: "CANCELLED",
        decisionId: null,
        cancelledAt: now
      }
    });
  }
  if (decision.originatingWorkItem?.state === "NEEDS_RYAN") {
    await transitionAgentWorkItem(
      decision.userId,
      decision.originatingWorkItem.id,
      "PARKED",
      {
        blocker:
          "Superseded broken Rykas PO/capital owner-data request; awaiting a fresh typed RyanOS review.",
        nextEligibleRunAt: null
      },
      db
    );
  }
  await db.agentProjectConfig.updateMany({
    where: {
      userId: decision.userId,
      projectId: decision.projectId,
      profile: "RYKAS_GM"
    },
    data: {
      health: "NEEDS_ATTENTION",
      currentBottleneck:
        "Broken PO/capital owner-data decision superseded; fresh Rykas review scheduled.",
      nextAgentReviewAt: now
    }
  });
  await recordAgentEvent(
    {
      userId: decision.userId,
      projectId: decision.projectId,
      workItemId: decision.originatingWorkItemId,
      runId: decision.originatingRunId,
      decisionId: decision.id,
      idempotencyKey: `rykas-broken-decision-recovered:${decision.id}`,
      type: "RYKAS_DATA_BLOCKED",
      summary:
        "Superseded the unsupported Rykas owner-data decision and scheduled a fresh review; no authorization or external action occurred.",
      metadata: {
        cancelledDecisionId: decision.id,
        authorizationRecorded: false,
        actionExecuted: false,
        purchaseExecuted: false
      }
    },
    db
  );
  return { recovered: true, reason: "RECOVERED" as const };
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
