import { randomUUID } from "node:crypto";
import type { AgentProjectConfig, AgentWorkItem, PrismaClient } from "@prisma/client";
import { executorForCapability } from "@/lib/agent-capabilities";
import { activeAgentWorkStates } from "@/lib/agent-state-machine";
import { evaluateAgentPolicy } from "@/lib/agent-policy";
import { prisma } from "@/lib/prisma";
import {
  RYKAS_READ_CAPABILITY,
  serializeRykasReadRequest
} from "@/lib/rykas-truth-contract";
import type {
  AgentVerifier,
  AgentWorker,
  AgentWorkPlan,
  ProjectManagerAgent
} from "@/server/agent/contracts";
import { recordAgentEvent } from "@/server/agent/event-service";
import {
  DeterministicMockWorker,
  DeterministicProjectManagerAgent,
  DeterministicQaVerifier
} from "@/server/agent/mock-agents";
import { ModelProjectManagerAgent } from "@/server/agent/model-agents";
import { collectProjectEvidence, defaultToolsForProfile } from "@/server/agent/project-tools";
import { evaluateSignalCareOutreachReadiness } from "@/server/agent/signalcare-outreach-policy";
import {
  executeSignalCareHostedResearch,
  OpenAiSignalCareResearchClient,
  parseSignalCareResearchContext,
  recoverFailedSignalCareProspectResearch,
  reclassifySignalCareProspectResearch,
  serializeSignalCareResearchContext,
  signalCareWebResearchEnabled,
  type SignalCareResearchClient
} from "@/server/agent/signalcare-research-service";
import {
  createOwnerDecision,
  recoverBrokenRykasOwnerDataDecision,
  transitionAgentWorkItem
} from "@/server/agent/work-service";

const reviewIntervalMs = 15 * 60 * 1000;
const retryDelayMs = 5 * 60 * 1000;
const leaseDurationMs = 5 * 60 * 1000;

function serializePlanOperationalContext(
  plan: AgentWorkPlan,
  capability: string,
  profile: string
) {
  if (capability === RYKAS_READ_CAPABILITY) {
    if (profile !== "RYKAS_GM")
      throw new Error("Rykas truth reads are eligible only for RYKAS_GM.");
    if (!plan.rykasReadRequest)
      throw new Error("RYKAS_OPERATIONS_READ requires a typed Rykas request.");
    return serializeRykasReadRequest(plan.rykasReadRequest);
  }
  if (plan.rykasReadRequest != null)
    throw new Error("Only RYKAS_OPERATIONS_READ may include a Rykas request.");
  if (capability === "SIGNALCARE_PUBLIC_WEB_RESEARCH")
    return serializeSignalCareResearchContext({
      researchMode: plan.researchMode ?? "DISCOVER_PROSPECTS",
      targetProspect: plan.targetProspect,
      instructions: plan.operationalContext
    });
  return plan.operationalContext;
}

export type OrchestrationServices = {
  projectManager: ProjectManagerAgent;
  worker: AgentWorker;
  verifier: AgentVerifier;
  signalCareResearchClient?: SignalCareResearchClient;
};

export type AgentCycleProjectResult = {
  projectId: string;
  projectName: string;
  outcome: "COMPLETED" | "QUEUED_FOR_RUNNER" | "WAITING" | "PARKED" | "NEEDS_RYAN" | "RETRY" | "FAILED" | "WIP_LIMIT" | "SKIPPED";
  workItemId?: string;
  decisionId?: string;
  detail: string;
};

export type AgentCycleResult = {
  startedAt: Date;
  completedAt: Date;
  dueProjectCount: number;
  claimedProjectCount: number;
  projects: AgentCycleProjectResult[];
};

const defaultServices: OrchestrationServices = {
  projectManager: new DeterministicProjectManagerAgent(),
  worker: new DeterministicMockWorker(),
  verifier: new DeterministicQaVerifier()
};

function addMs(value: Date, milliseconds: number) {
  return new Date(value.getTime() + milliseconds);
}

function nextReviewAt(now: Date, requestedMinutes?: number) {
  const minutes = Math.min(
    10080,
    Math.max(5, Math.floor(requestedMinutes ?? reviewIntervalMs / 60000))
  );
  return addMs(now, minutes * 60 * 1000);
}

function assertOwnerDecisionConsistency(plan: AgentWorkPlan) {
  if (plan.ownerNeeded === true && !plan.ownerDecision) {
    throw new Error("ownerNeeded=true requires a structured ownerDecision.");
  }
  if (plan.ownerNeeded !== true && plan.ownerDecision) {
    throw new Error("ownerNeeded=false requires ownerDecision=null.");
  }
}

async function recordModelPmDecision(
  config: AgentProjectConfig,
  dueAnchor: Date,
  plan: AgentWorkPlan,
  db: PrismaClient
) {
  return recordAgentEvent(
    {
      userId: config.userId,
      projectId: config.projectId,
      idempotencyKey: `pm-decision:${config.projectId}:${dueAnchor.toISOString()}`,
      type: "PM_DECISION_RECORDED",
      summary: `Model PM selected ${plan.disposition ?? "CREATE_WORK"}: ${plan.title}`,
      metadata: {
        disposition: plan.disposition ?? "CREATE_WORK",
        currentBottleneck: plan.plannedBottleneck,
        evidence: plan.evidence ?? null,
        title: plan.title,
        objective: plan.objective,
        expectedValue: plan.expectedValue,
        requiredCapability: plan.requiredCapability ?? null,
        researchMode: plan.researchMode ?? null,
        targetProspect: plan.targetProspect ?? null,
        nextReviewMinutes: plan.nextReviewMinutes ?? null,
        ownerNeeded: plan.ownerNeeded ?? false,
        ownerDecisionSummary: plan.ownerDecision
          ? {
              category: plan.ownerDecision.category,
              question: plan.ownerDecision.question,
              recommendedChoice: plan.ownerDecision.recommendedChoice,
              availableChoices: plan.ownerDecision.availableChoices,
              targetEntity: plan.ownerDecision.targetEntity ?? null
            }
          : null
      }
    },
    db
  );
}

function planFromPersistedWork(
  workItem: AgentWorkItem,
  currentBottleneck: string | null
): AgentWorkPlan {
  const signalCareContext =
    workItem.requiredCapability === "SIGNALCARE_PUBLIC_WEB_RESEARCH"
      ? parseSignalCareResearchContext(workItem.operationalContext)
      : null;
  return {
    disposition: "CREATE_WORK",
    title: workItem.title,
    objective: workItem.objective,
    expectedValue: workItem.expectedValue,
    acceptanceCriteria: workItem.acceptanceCriteria,
    agentRole: workItem.agentRole,
    actionCategory: workItem.actionCategory as AgentWorkPlan["actionCategory"],
    priority: workItem.priority,
    maxAttempts: workItem.maxAttempts,
    plannedBottleneck:
      currentBottleneck ?? "Resume existing eligible queued work.",
    requiredCapability: workItem.requiredCapability,
    sandboxPolicy: workItem.sandboxPolicy as AgentWorkPlan["sandboxPolicy"],
    networkPolicy: workItem.networkPolicy as AgentWorkPlan["networkPolicy"],
    operationalContext: workItem.operationalContext ?? undefined,
    dependsOnWorkItemId: workItem.dependsOnWorkItemId ?? undefined,
    researchMode: signalCareContext?.researchMode ?? null,
    targetProspect: signalCareContext?.targetProspect ?? null
  };
}

function signalCareQualificationPlan(
  targetProspect: string,
  originalPlan: AgentWorkPlan,
  readinessReasons: string[]
): AgentWorkPlan {
  return {
    disposition: "CREATE_WORK",
    title: `Qualify ${targetProspect} against the canonical SignalCare commercial profile`,
    objective: `Determine whether ${targetProspect} is a plausible customer for an approved SignalCare offer and prepare an internal outreach package only if public evidence supports it.`,
    expectedValue:
      "Replace premature outreach with evidence-backed customer qualification.",
    acceptanceCriteria:
      "Public provider-backed facts map the prospect to one approved SignalCare offer; the result is ADVANCE, NEED_MORE_RESEARCH, or PASS; no external communication occurs.",
    agentRole: "SIGNALCARE_RESEARCHER",
    actionCategory: "RESEARCH_READ_ONLY",
    priority: "HIGH",
    maxAttempts: Math.max(1, Math.min(3, originalPlan.maxAttempts)),
    plannedBottleneck: `Qualification is incomplete for ${targetProspect}.`,
    requiredCapability: "SIGNALCARE_PUBLIC_WEB_RESEARCH",
    sandboxPolicy: "READ_ONLY",
    networkPolicy: "ALLOWLIST",
    operationalContext: `Resolve deterministic outreach-readiness gaps: ${readinessReasons.join(" ")}`,
    evidence: originalPlan.evidence,
    nextReviewMinutes: originalPlan.nextReviewMinutes,
    ownerNeeded: false,
    ownerDecision: null,
    researchMode: "QUALIFY_EXISTING_PROSPECT",
    targetProspect
  };
}

async function releaseProjectClaim(
  configId: string,
  leaseToken: string,
  now: Date,
  data: Partial<Pick<AgentProjectConfig, "health" | "currentBottleneck" | "nextAgentReviewAt">>,
  db: PrismaClient
) {
  const { nextAgentReviewAt, ...configData } = data;
  await db.agentProjectConfig.updateMany({
    where: { id: configId, leaseToken },
    data: {
      ...configData,
      lastAgentReviewAt: now,
      nextAgentReviewAt: nextAgentReviewAt ?? addMs(now, reviewIntervalMs),
      leaseToken: null,
      leaseExpiresAt: null
    }
  });
}

async function failAndReleaseProjectClaim(
  configId: string,
  leaseToken: string,
  now: Date,
  db: PrismaClient
) {
  await db.agentProjectConfig.updateMany({
    where: { id: configId, leaseToken },
    data: {
      health: "BLOCKED",
      nextAgentReviewAt: addMs(now, retryDelayMs),
      leaseToken: null,
      leaseExpiresAt: null
    }
  });
}

async function processClaimedProject(
  config: AgentProjectConfig & { project: { id: string; name: string } },
  dueAnchor: Date,
  leaseToken: string,
  now: Date,
  services: OrchestrationServices,
  db: PrismaClient
): Promise<AgentCycleProjectResult> {
  const baseResult = { projectId: config.projectId, projectName: config.project.name };
  await recordAgentEvent(
    {
      userId: config.userId,
      projectId: config.projectId,
      idempotencyKey: `project-reviewed:${config.projectId}:${dueAnchor.toISOString()}`,
      type: "PROJECT_REVIEWED",
      summary: `${config.project.name} received a deterministic PM review.`
    },
    db
  );

  await reclassifySignalCareProspectResearch(config, db);
  await recoverFailedSignalCareProspectResearch(config, db);

  const eligibleExisting = await db.agentWorkItem.findFirst({
    where: {
      userId: config.userId,
      projectId: config.projectId,
      state: { in: ["QUEUED", "RETRY"] },
      AND: [
        { OR: [{ nextEligibleRunAt: null }, { nextEligibleRunAt: { lte: now } }] },
        {
          OR: [
            { dependsOnWorkItemId: null },
            { dependsOnWorkItem: { is: { integrationStatus: "INTEGRATED" } } }
          ]
        }
      ]
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }]
  });

  const activeCount = await db.agentWorkItem.count({
    where: { projectId: config.projectId, userId: config.userId, state: { in: activeAgentWorkStates } }
  });
  if (!eligibleExisting && activeCount >= config.maxConcurrentWorkItems) {
    await recordAgentEvent(
      {
        userId: config.userId,
        projectId: config.projectId,
        idempotencyKey: `wip-enforced:${config.projectId}:${dueAnchor.toISOString()}`,
        type: "WIP_LIMIT_ENFORCED",
        summary: `No new work created: ${activeCount}/${config.maxConcurrentWorkItems} active work items.`
      },
      db
    );
    await releaseProjectClaim(config.id, leaseToken, now, { health: "NEEDS_ATTENTION" }, db);
    return { ...baseResult, outcome: "WIP_LIMIT", detail: "Project WIP limit enforced." };
  }

  let plan: AgentWorkPlan;
  let workItem: AgentWorkItem;
  if (eligibleExisting) {
    workItem = eligibleExisting;
    plan = planFromPersistedWork(workItem, config.currentBottleneck);
  } else {
    const toolEvidence = await collectProjectEvidence({ userId: config.userId, projectId: config.projectId, profile: config.profile }, defaultToolsForProfile(config.profile), db);
    const rykasSnapshot = config.profile === "RYKAS_GM" ? toolEvidence.find((entry) => entry.toolId === "rykas.operations.snapshot")?.output as { truthStatus?: string; blockers?: string[] } | undefined : undefined;
    if (process.env.FEATURE_RYKAS_TRUTH_READ === "true" && rykasSnapshot?.truthStatus && rykasSnapshot.truthStatus !== "READY") {
      const detail = rykasSnapshot.blockers?.join(" ") || "Rykas truth is not ready.";
      await recordAgentEvent({ userId: config.userId, projectId: config.projectId, type: "WORK_WAITING", summary: `Rykas GM waited safely: ${detail}` }, db);
      await releaseProjectClaim(config.id, leaseToken, now, { health: rykasSnapshot.truthStatus === "BLOCKED" ? "BLOCKED" : "NEEDS_ATTENTION", currentBottleneck: detail, nextAgentReviewAt: nextReviewAt(now, 15) }, db);
      return { ...baseResult, outcome: "WAITING", detail };
    }
    plan = await services.projectManager.chooseNextWork({
      profile: config.profile,
      projectId: config.projectId,
      projectName: config.project.name,
      objective: config.objective,
      primaryKpi: config.primaryKpi,
      currentBottleneck: config.currentBottleneck,
      instructions: config.projectManagerInstructions,
      autonomyPolicy: config.autonomyPolicy,
      escalationPolicy: config.escalationPolicy,
      operatingMode: config.operatingMode,
      toolEvidence,
      existingWorkTitles: await db.agentWorkItem
        .findMany({ where: { projectId: config.projectId }, select: { title: true }, take: 20 })
        .then((items) => items.map((item) => item.title))
    });

    assertOwnerDecisionConsistency(plan);
    if (services.projectManager.adapterKind === "MODEL") {
      await recordModelPmDecision(config, dueAnchor, plan, db);
    }

    if (
      plan.ownerNeeded === true &&
      plan.ownerDecision?.category === "SEND_EMAIL_OR_MESSAGE" &&
      config.profile === "SIGNALCARE_GM"
    ) {
      const target = plan.ownerDecision.targetEntity;
      const readiness =
        target?.type === "SIGNALCARE_PROSPECT"
          ? await evaluateSignalCareOutreachReadiness(
              config.userId,
              config.projectId,
              target,
              db
            )
          : null;
      if (!readiness?.ready) {
        const reasons = readiness?.reasons ?? [
          "SignalCare outreach proposal has no typed target prospect."
        ];
        await recordAgentEvent(
          {
            userId: config.userId,
            projectId: config.projectId,
            idempotencyKey: `premature-outreach-suppressed:${config.projectId}:${dueAnchor.toISOString()}`,
            type: "PREMATURE_OWNER_ESCALATION_SUPPRESSED",
            summary:
              "A premature SignalCare outreach escalation was suppressed before any owner decision or action request was created.",
            metadata: {
              targetProspect: readiness?.target.name ?? target?.name ?? null,
              reasons,
              externalOutreachPerformed: false
            }
          },
          db
        );
        if (
          readiness?.queueItemId &&
          readiness.queueStatus !== "passed" &&
          target
        ) {
          plan = signalCareQualificationPlan(
            readiness.target.name,
            plan,
            reasons
          );
        } else {
          await releaseProjectClaim(
            config.id,
            leaseToken,
            now,
            {
              health: "NEEDS_ATTENTION",
              currentBottleneck: "SignalCare outreach target is not eligible for approval.",
              nextAgentReviewAt: nextReviewAt(now, plan.nextReviewMinutes)
            },
            db
          );
          return {
            ...baseResult,
            outcome: "WAITING",
            detail: `Outreach escalation suppressed: ${reasons.join(" ")}`
          };
        }
      }
    }

    if (plan.ownerNeeded === true && plan.ownerDecision) {
      let proposedAction = await db.agentWorkItem.upsert({
        where: {
          projectId_idempotencyKey: {
            projectId: config.projectId,
            idempotencyKey: `pm-owner-work:${config.projectId}:${dueAnchor.toISOString()}`
          }
        },
        update: {},
        create: {
          userId: config.userId,
          projectId: config.projectId,
          idempotencyKey: `pm-owner-work:${config.projectId}:${dueAnchor.toISOString()}`,
          title: plan.title,
          objective: plan.objective,
          expectedValue: plan.expectedValue,
          acceptanceCriteria: plan.acceptanceCriteria,
          agentRole: plan.agentRole,
          actionCategory: plan.ownerDecision.category,
          requiredCapability: plan.requiredCapability ?? "REPOSITORY_READ",
          sandboxPolicy: "READ_ONLY",
          networkPolicy: "OFF",
          operationalContext: serializePlanOperationalContext(
            plan,
            plan.requiredCapability ?? "REPOSITORY_READ",
            config.profile
          ),
          priority: plan.priority,
          maxAttempts: plan.maxAttempts
        }
      });
      if (proposedAction.state === "QUEUED") {
        proposedAction = await transitionAgentWorkItem(
          config.userId,
          proposedAction.id,
          "PLANNING",
          {},
          db
        );
      }
      const decision = await createOwnerDecision(
        {
          userId: config.userId,
          projectId: config.projectId,
          workItemId: proposedAction.id,
          idempotencyKey: `pm-owner-decision:${config.projectId}:${dueAnchor.toISOString()}`,
          profile: config.profile,
          plan: plan.ownerDecision
        },
        db
      );
      if (proposedAction.state === "PLANNING") {
        await transitionAgentWorkItem(
          config.userId,
          proposedAction.id,
          "NEEDS_RYAN",
          {
            blocker: plan.ownerDecision.ownerDataRequest
              ? "Owner must update the authoritative Rykas source before a fresh read; no authorization is requested."
              : "Owner authorization required before external execution."
          },
          db
        );
      }
      await releaseProjectClaim(
        config.id,
        leaseToken,
        now,
        {
          health: "NEEDS_ATTENTION",
          currentBottleneck: plan.plannedBottleneck,
          nextAgentReviewAt: nextReviewAt(now, plan.nextReviewMinutes)
        },
        db
      );
      return {
        ...baseResult,
        outcome: "NEEDS_RYAN",
        workItemId: proposedAction.id,
        decisionId: decision.id,
        detail: decision.question
      };
    }

    if (plan.disposition === "WAIT" || plan.disposition === "PARK") {
      await recordAgentEvent({ userId: config.userId, projectId: config.projectId,
        idempotencyKey: `pm-${plan.disposition.toLowerCase()}:${config.projectId}:${dueAnchor.toISOString()}`,
        type: plan.disposition === "WAIT" ? "WORK_WAITING" : "WORK_PARKED",
        summary: plan.disposition === "WAIT" ? "PM found no valuable bounded action and chose to wait." : "PM deliberately parked low-value work." }, db);
      await releaseProjectClaim(config.id, leaseToken, now, { health: plan.disposition === "WAIT" ? "ON_TRACK" : "NEEDS_ATTENTION", currentBottleneck: plan.plannedBottleneck,
        nextAgentReviewAt: nextReviewAt(now, plan.nextReviewMinutes) }, db);
      return { ...baseResult, outcome: plan.disposition === "WAIT" ? "WAITING" : "PARKED", detail: "No make-work item was created." };
    }

    const plannedCapability = plan.requiredCapability ??
      (plan.actionCategory === "REVERSIBLE_REPOSITORY_WORK"
        ? "CODEX_IMPLEMENTATION"
        : "REPOSITORY_READ");
    const workKey = `pm:${config.projectId}:${dueAnchor.toISOString()}`;
    workItem = await db.agentWorkItem.upsert({
      where: { projectId_idempotencyKey: { projectId: config.projectId, idempotencyKey: workKey } },
      update: {},
      create: {
        userId: config.userId,
        projectId: config.projectId,
        idempotencyKey: workKey,
        title: plan.title,
        objective: plan.objective,
        expectedValue: plan.expectedValue,
        acceptanceCriteria: plan.acceptanceCriteria,
        agentRole: plan.agentRole,
        actionCategory: plan.actionCategory,
        requiredCapability: plannedCapability,
        sandboxPolicy: plan.sandboxPolicy ?? (plan.actionCategory === "REVERSIBLE_REPOSITORY_WORK" ? "WORKSPACE_WRITE" : "READ_ONLY"),
        networkPolicy: plan.networkPolicy ?? "OFF",
        operationalContext: serializePlanOperationalContext(
          plan,
          plannedCapability,
          config.profile
        ),
        dependsOnWorkItemId: plan.dependsOnWorkItemId,
        priority: plan.priority,
        maxAttempts: plan.maxAttempts,
        workspaceIdentifier:
          executorForCapability(plannedCapability) === "LOCAL_RUNNER"
            ? config.workspaceIdentifier
            : null
      }
    });

  }

  if (!["QUEUED", "RETRY", "PLANNING", "RUNNING", "VERIFYING"].includes(workItem.state)) {
    await releaseProjectClaim(config.id, leaseToken, now, {}, db);
    return {
      ...baseResult,
      outcome: "SKIPPED",
      workItemId: workItem.id,
      detail: `Idempotent cycle found existing ${workItem.state} work; no duplicate created.`
    };
  }

  if (config.operatingMode === "LIVE_INTERNAL" && (workItem.state === "QUEUED" || workItem.state === "RETRY")) {
    const executor = executorForCapability(workItem.requiredCapability);
    if (executor === "CONTROL_PLANE") {
      if (!signalCareWebResearchEnabled()) {
        await db.agentWorkItem.update({ where: { id: workItem.id }, data: {
          blocker: "Hosted SignalCare web research is disabled; work is safely waiting for an eligible executor."
        } });
        await recordAgentEvent({ userId: config.userId, projectId: config.projectId, workItemId: workItem.id,
          idempotencyKey: `hosted-research-disabled:${workItem.id}:${workItem.attemptCount + 1}`, type: "WORK_WAITING_FOR_EXECUTOR",
          summary: "SignalCare prospect discovery is waiting because its hosted research kill switch is off." }, db);
        await releaseProjectClaim(config.id, leaseToken, now, { health: "NEEDS_ATTENTION", currentBottleneck: plan.plannedBottleneck }, db);
        return { ...baseResult, outcome: "WAITING", workItemId: workItem.id, detail: "Hosted SignalCare research is disabled; no local runner claim is permitted." };
      }
      const research = await executeSignalCareHostedResearch({ userId: config.userId, projectId: config.projectId,
        workItemId: workItem.id, objective: workItem.objective },
        services.signalCareResearchClient ?? new OpenAiSignalCareResearchClient(), db, now);
      if (research.outcome === "COMPLETED") {
        const noQualifiedCandidates =
          "discoveryOutcome" in research &&
          research.discoveryOutcome === "NO_QUALIFIED_CANDIDATES";
        const configuredNextReviewAt = noQualifiedCandidates
          ? await db.agentProjectConfig
              .findUnique({
                where: { projectId: config.projectId },
                select: { nextAgentReviewAt: true }
              })
              .then((project) => project?.nextAgentReviewAt ?? now)
          : now;
        await releaseProjectClaim(config.id, leaseToken, now, { health: "ON_TRACK", currentBottleneck: plan.plannedBottleneck, nextAgentReviewAt: configuredNextReviewAt }, db);
        return { ...baseResult, outcome: "COMPLETED", workItemId: workItem.id,
          detail: "detail" in research && typeof research.detail === "string"
            ? research.detail
            : research.qualifiedProspect
            ? `${research.qualifiedProspect} advanced to ${research.pipelineStatus}; PM is due to reevaluate.`
            : research.skippedBecauseProspectsExist ? "Existing prospects suppressed repeated discovery; PM is due to reevaluate." : `${research.created.length} evidence-backed prospect(s) entered the pipeline; PM is due to reevaluate.` };
      }
      await releaseProjectClaim(config.id, leaseToken, now, {
        health: research.outcome === "FAILED" ? "BLOCKED" : "NEEDS_ATTENTION",
        currentBottleneck: plan.plannedBottleneck,
        nextAgentReviewAt:
          research.outcome === "PARKED"
            ? now
            : research.outcome === "RETRY"
              ? addMs(now, retryDelayMs)
              : addMs(now, reviewIntervalMs)
      }, db);
      return { ...baseResult, outcome: research.outcome, workItemId: workItem.id,
        detail: research.error ?? "Hosted SignalCare research did not complete." };
    }
    if (executor === "LOCAL_RUNNER") {
      await recordAgentEvent({ userId: config.userId, projectId: config.projectId, workItemId: workItem.id,
        idempotencyKey: `runner-queued:${workItem.id}:${workItem.attemptCount + 1}`, type: "WORK_QUEUED_FOR_RUNNER",
        summary: `${workItem.title} is queued for a registered outbound local runner.` }, db);
      await releaseProjectClaim(config.id, leaseToken, now, { health: "ON_TRACK", currentBottleneck: plan.plannedBottleneck }, db);
      return { ...baseResult, outcome: "QUEUED_FOR_RUNNER", workItemId: workItem.id, detail: "Awaiting outbound runner claim." };
    }
    await db.agentWorkItem.update({ where: { id: workItem.id }, data: {
      blocker: `No registered executor supports ${workItem.requiredCapability}; work remains queued.`
    } });
    await recordAgentEvent({ userId: config.userId, projectId: config.projectId, workItemId: workItem.id,
      idempotencyKey: `executor-unavailable:${workItem.id}:${workItem.attemptCount + 1}`, type: "WORK_WAITING_FOR_EXECUTOR",
      summary: `No registered executor supports ${workItem.requiredCapability}; no dispatch occurred.` }, db);
    await releaseProjectClaim(config.id, leaseToken, now, { health: "NEEDS_ATTENTION", currentBottleneck: plan.plannedBottleneck }, db);
    return { ...baseResult, outcome: "WAITING", workItemId: workItem.id, detail: "No eligible executor is registered for this capability." };
  }

  let current: AgentWorkItem = workItem;
  if (current.state === "QUEUED" || current.state === "RETRY") {
    current = await transitionAgentWorkItem(config.userId, current.id, "PLANNING", {}, db);
    await recordAgentEvent(
      {
        userId: config.userId,
        projectId: config.projectId,
        workItemId: current.id,
        idempotencyKey: `work-selected:${current.id}:${current.attemptCount + 1}`,
        type: "WORK_SELECTED",
        summary: `${current.title} selected within WIP limits.`
      },
      db
    );
  }

  const policy = evaluateAgentPolicy({
    category: current.actionCategory as never,
    projectProfile: config.profile,
    amountCents: null,
    spendingThresholdCents: config.spendingThresholdCents
  });

  if (policy === "DENY") {
    await transitionAgentWorkItem(config.userId, current.id, "FAILED", {
      blocker: "Deterministic policy denied the action."
    }, db);
    await recordAgentEvent(
      {
        userId: config.userId,
        projectId: config.projectId,
        workItemId: current.id,
        idempotencyKey: `policy-denied:${current.id}`,
        type: "POLICY_BLOCKED_ACTION",
        summary: `Policy denied ${current.actionCategory}; no action was executed.`
      },
      db
    );
    await releaseProjectClaim(config.id, leaseToken, now, { health: "BLOCKED" }, db);
    return { ...baseResult, outcome: "FAILED", workItemId: current.id, detail: "Policy denied action." };
  }

  if (policy === "REQUIRE_OWNER_APPROVAL") {
    const decision = await createOwnerDecision(
      {
        userId: config.userId,
        projectId: config.projectId,
        workItemId: current.id,
        idempotencyKey: `pre-action:${current.id}`,
        profile: config.profile,
        plan: {
          category: current.actionCategory as never,
          question: `Approve ${current.title}?`,
          context: current.objective,
          recommendedChoice: "APPROVE",
          availableChoices: ["APPROVE", "MORE RESEARCH", "PASS"],
          expectedUpside: current.expectedValue,
          risk: "This action is owner-gated by deterministic policy."
        }
      },
      db
    );
    await transitionAgentWorkItem(config.userId, current.id, "NEEDS_RYAN", {
      blocker: "Owner approval required before execution."
    }, db);
    await releaseProjectClaim(config.id, leaseToken, now, { health: "NEEDS_ATTENTION" }, db);
    return {
      ...baseResult,
      outcome: "NEEDS_RYAN",
      workItemId: current.id,
      decisionId: decision.id,
      detail: "Deterministic policy created a pre-action owner decision."
    };
  }

  const attempt = current.attemptCount + 1;
  if (current.state === "PLANNING") {
    current = await transitionAgentWorkItem(config.userId, current.id, "RUNNING", {}, db);
    current = await db.agentWorkItem.update({
      where: { id: current.id },
      data: { attemptCount: attempt, executorIdentifier: "ryanos-phase1-mock-worker" }
    });
  }

  const runKey = `worker:${current.id}:${attempt}`;
  const priorRun =
    attempt > 1
      ? await db.agentRun.findFirst({
          where: { workItemId: current.id, runType: "MOCK_WORKER" },
          orderBy: { startedAt: "desc" }
        })
      : null;
  let run = await db.agentRun.upsert({
    where: { idempotencyKey: runKey },
    update: {},
    create: {
      userId: config.userId,
      projectId: config.projectId,
      workItemId: current.id,
      retryOfRunId: priorRun?.id ?? null,
      idempotencyKey: runKey,
      role: plan.agentRole,
      runType: "MOCK_WORKER",
      status: "RUNNING",
      providerIdentifier: "deterministic-mock",
      executorIdentifier: "ryanos-phase1-mock-worker",
      workspaceIdentifier: current.workspaceIdentifier
    }
  });

  await recordAgentEvent(
    {
      userId: config.userId,
      projectId: config.projectId,
      workItemId: current.id,
      runId: run.id,
      idempotencyKey: `work-dispatched:${run.id}`,
      type: "WORK_DISPATCHED",
      summary: `${current.title} dispatched to the deterministic mock worker.`
    },
    db
  );

  let workerResult;
  try {
    workerResult = await services.worker.execute({
      ...plan,
      workItemId: current.id,
      attempt,
      workspaceIdentifier: current.workspaceIdentifier
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown worker error";
    await db.agentRun.update({
      where: { id: run.id },
      data: { status: "FAILED", error: message, completedAt: new Date() }
    });
    if (attempt < current.maxAttempts) {
      await transitionAgentWorkItem(config.userId, current.id, "RETRY", {
        blocker: message,
        nextEligibleRunAt: addMs(now, retryDelayMs)
      }, db);
      await recordAgentEvent({
        userId: config.userId,
        projectId: config.projectId,
        workItemId: current.id,
        runId: run.id,
        type: "RETRY_CREATED",
        summary: `Attempt ${attempt} failed; bounded retry scheduled.`
      }, db);
      await releaseProjectClaim(config.id, leaseToken, now, { health: "NEEDS_ATTENTION" }, db);
      return { ...baseResult, outcome: "RETRY", workItemId: current.id, detail: message };
    }
    await transitionAgentWorkItem(config.userId, current.id, "FAILED", { blocker: message }, db);
    await releaseProjectClaim(config.id, leaseToken, now, { health: "BLOCKED" }, db);
    return { ...baseResult, outcome: "FAILED", workItemId: current.id, detail: "Maximum attempts exhausted." };
  }

  run = await db.agentRun.update({
    where: { id: run.id },
    data: {
      status: "SUCCEEDED",
      providerIdentifier: workerResult.providerIdentifier,
      executorIdentifier: workerResult.executorIdentifier,
      externalThreadId: workerResult.externalThreadId ?? null,
      externalRunId: workerResult.externalRunId ?? null,
      operationalResultSummary: workerResult.operationalResultSummary,
      evidence: workerResult.evidence,
      structuredOutcome: JSON.stringify(workerResult.structuredOutcome),
      testOutcome: workerResult.testOutcome ?? null,
      completedAt: new Date()
    }
  });
  if (current.state === "RUNNING") {
    current = await transitionAgentWorkItem(config.userId, current.id, "VERIFYING", {
      resultSummary: workerResult.operationalResultSummary,
      evidenceSummary: workerResult.evidence,
      blocker: null
    }, db);
  }
  await recordAgentEvent({
    userId: config.userId,
    projectId: config.projectId,
    workItemId: current.id,
    runId: run.id,
    idempotencyKey: `work-completed:${run.id}`,
    type: "WORK_COMPLETED",
    summary: workerResult.operationalResultSummary
  }, db);

  const qaKey = `qa:${current.id}:${attempt}`;
  let qaRun = await db.agentRun.upsert({
    where: { idempotencyKey: qaKey },
    update: {},
    create: {
      userId: config.userId,
      projectId: config.projectId,
      workItemId: current.id,
      idempotencyKey: qaKey,
      role: "INDEPENDENT_QA",
      runType: "MOCK_QA",
      status: "RUNNING",
      providerIdentifier: "deterministic-mock",
      executorIdentifier: "ryanos-phase1-mock-qa"
    }
  });
  const verification = await services.verifier.verify({
    plan,
    result: workerResult,
    attempt,
    maxAttempts: current.maxAttempts
  });
  qaRun = await db.agentRun.update({
    where: { id: qaRun.id },
    data: {
      status: "SUCCEEDED",
      operationalResultSummary: verification.outcome,
      evidence: verification.evidence,
      qaFeedback: verification.feedback,
      structuredOutcome: JSON.stringify({ outcome: verification.outcome }),
      completedAt: new Date()
    }
  });

  if (verification.outcome === "REPAIR") {
    if (attempt < current.maxAttempts) {
      await transitionAgentWorkItem(config.userId, current.id, "RETRY", {
        blocker: verification.feedback,
        nextEligibleRunAt: addMs(now, retryDelayMs)
      }, db);
      await recordAgentEvent({
        userId: config.userId,
        projectId: config.projectId,
        workItemId: current.id,
        runId: qaRun.id,
        idempotencyKey: `qa-repair:${qaRun.id}`,
        type: "QA_FAILED",
        summary: `QA requested bounded repair; attempt ${attempt}/${current.maxAttempts}.`
      }, db);
      await releaseProjectClaim(config.id, leaseToken, now, { health: "NEEDS_ATTENTION" }, db);
      return { ...baseResult, outcome: "RETRY", workItemId: current.id, detail: verification.feedback };
    }
    await transitionAgentWorkItem(config.userId, current.id, "FAILED", {
      blocker: "Maximum QA repair attempts exhausted."
    }, db);
    await recordAgentEvent({
      userId: config.userId,
      projectId: config.projectId,
      workItemId: current.id,
      runId: qaRun.id,
      idempotencyKey: `max-retries:${current.id}`,
      type: "MAX_RETRIES_EXHAUSTED",
      summary: `QA repair stopped after ${current.maxAttempts} attempts.`
    }, db);
    await releaseProjectClaim(config.id, leaseToken, now, { health: "BLOCKED" }, db);
    return { ...baseResult, outcome: "FAILED", workItemId: current.id, detail: "Maximum retries exhausted." };
  }

  if (verification.outcome === "ESCALATE" || plan.ownerDecisionAfterQa) {
    const decisionPlan = verification.escalation ?? plan.ownerDecisionAfterQa ?? {
      category: "BINDING_COMMITMENT" as const,
      question: `Review the blocker for ${current.title}?`,
      context: verification.feedback,
      recommendedChoice: "REVIEW DETAILS",
      availableChoices: ["REVIEW DETAILS", "REVISE", "PASS"],
      expectedUpside: current.expectedValue,
      risk: "Independent QA determined owner judgment is required."
    };
    if (
      config.profile === "SIGNALCARE_GM" &&
      decisionPlan.category === "SEND_EMAIL_OR_MESSAGE"
    ) {
      const target = decisionPlan.targetEntity;
      const readiness =
        target?.type === "SIGNALCARE_PROSPECT"
          ? await evaluateSignalCareOutreachReadiness(
              config.userId,
              config.projectId,
              target,
              db
            )
          : null;
      if (!readiness?.ready) {
        await transitionAgentWorkItem(config.userId, current.id, "DONE", {
          blocker: null,
          resultSummary: workerResult.operationalResultSummary,
          evidenceSummary: verification.evidence
        }, db);
        await recordAgentEvent(
          {
            userId: config.userId,
            projectId: config.projectId,
            workItemId: current.id,
            runId: qaRun.id,
            idempotencyKey: `premature-qa-outreach-suppressed:${qaRun.id}`,
            type: "PREMATURE_OWNER_ESCALATION_SUPPRESSED",
            summary:
              "QA-complete internal work did not create an outreach decision because deterministic readiness requirements were not met.",
            metadata: {
              targetProspect: target?.name ?? null,
              reasons: readiness?.reasons ?? [
                "SignalCare outreach proposal has no typed target prospect."
              ],
              externalOutreachPerformed: false
            }
          },
          db
        );
        await releaseProjectClaim(
          config.id,
          leaseToken,
          now,
          {
            health: "NEEDS_ATTENTION",
            currentBottleneck:
              "SignalCare prospect qualification must precede outreach approval.",
            nextAgentReviewAt: now
          },
          db
        );
        return {
          ...baseResult,
          outcome: "COMPLETED",
          workItemId: current.id,
          detail:
            "Internal work completed; premature outreach escalation was suppressed."
        };
      }
    }
    const decision = await createOwnerDecision({
      userId: config.userId,
      projectId: config.projectId,
      workItemId: current.id,
      runId: qaRun.id,
      idempotencyKey: `qa-decision:${current.id}:${attempt}`,
      profile: config.profile,
      plan: decisionPlan
    }, db);
    await transitionAgentWorkItem(config.userId, current.id, "NEEDS_RYAN", {
      blocker: "Owner decision required after independent QA."
    }, db);
    await recordAgentEvent({
      userId: config.userId,
      projectId: config.projectId,
      workItemId: current.id,
      runId: qaRun.id,
      idempotencyKey: `qa-pass:${qaRun.id}`,
      type: "QA_PASSED",
      summary: "Independent QA passed the bounded work result; the consequential next action remains owner-gated."
    }, db);
    await releaseProjectClaim(config.id, leaseToken, now, {
      health: "NEEDS_ATTENTION",
      currentBottleneck: plan.plannedBottleneck
    }, db);
    return {
      ...baseResult,
      outcome: "NEEDS_RYAN",
      workItemId: current.id,
      decisionId: decision.id,
      detail: decision.question
    };
  }

  await transitionAgentWorkItem(config.userId, current.id, "DONE", {
    blocker: null,
    resultSummary: workerResult.operationalResultSummary,
    evidenceSummary: verification.evidence
  }, db);
  await recordAgentEvent({
    userId: config.userId,
    projectId: config.projectId,
    workItemId: current.id,
    runId: qaRun.id,
    idempotencyKey: `qa-pass:${qaRun.id}`,
    type: "QA_PASSED",
    summary: "Independent QA passed; work item completed."
  }, db);
  await releaseProjectClaim(config.id, leaseToken, now, {
    health: "ON_TRACK",
    currentBottleneck: plan.plannedBottleneck
  }, db);
  return { ...baseResult, outcome: "COMPLETED", workItemId: current.id, detail: "Work completed and verified." };
}

export async function runAgentOrchestrationCycle(
  now = new Date(),
  options: {
    userId?: string;
    projectIds?: string[];
    db?: PrismaClient;
    services?: OrchestrationServices;
  } = {}
): Promise<AgentCycleResult> {
  const db = options.db ?? prisma;
  await recoverBrokenRykasOwnerDataDecision(options.userId, db, now);
  const maxModelInvocations = Math.max(0, Number(process.env.AGENT_MAX_MODEL_INVOCATIONS_PER_CYCLE ?? 3));
  let modelInvocations = 0;
  const dueConfigs = await db.agentProjectConfig.findMany({
    where: {
      enabled: true,
      pausedAt: null,
      ...(options.userId ? { userId: options.userId } : {}),
      ...(options.projectIds ? { projectId: { in: options.projectIds } } : {}),
      OR: [{ nextAgentReviewAt: null }, { nextAgentReviewAt: { lte: now } }]
    },
    include: { project: { select: { id: true, name: true } } },
    orderBy: [{ nextAgentReviewAt: "asc" }, { projectId: "asc" }]
  });

  const results: AgentCycleProjectResult[] = [];
  let claimedProjectCount = 0;
  for (const config of dueConfigs) {
    const leaseToken = randomUUID();
    const claimed = await db.agentProjectConfig.updateMany({
      where: {
        id: config.id,
        enabled: true,
        pausedAt: null,
        OR: [{ leaseToken: null }, { leaseExpiresAt: { lt: now } }]
      },
      data: { leaseToken, leaseExpiresAt: addMs(now, leaseDurationMs) }
    });
    if (claimed.count !== 1) continue;
    claimedProjectCount += 1;
    const dueAnchor = config.nextAgentReviewAt ?? config.createdAt;
    try {
      const startOfDay = new Date(now); startOfDay.setUTCHours(0, 0, 0, 0);
      const dailyModelRuns = process.env.FEATURE_AGENT_MODELS === "true" ? await db.agentEvent.count({ where: { projectId: config.projectId, type: "PM_DECISION_RECORDED", createdAt: { gte: startOfDay } } }) : 0;
      const dailyLimit = Math.max(0, Number(process.env.AGENT_MAX_MODEL_RUNS_PER_PROJECT_DAY ?? 8));
      const services = options.services ?? {
        ...defaultServices,
        projectManager: process.env.FEATURE_AGENT_MODELS === "true" && modelInvocations < maxModelInvocations && dailyModelRuns < dailyLimit
          ? (modelInvocations++, new ModelProjectManagerAgent()) : defaultServices.projectManager
      };
      results.push(await processClaimedProject(config, dueAnchor, leaseToken, now, services, db));
    } catch (error) {
      await failAndReleaseProjectClaim(config.id, leaseToken, now, db);
      results.push({
        projectId: config.projectId,
        projectName: config.project.name,
        outcome: "FAILED",
        detail: error instanceof Error ? error.message : "Unknown orchestration failure"
      });
    }
  }

  return {
    startedAt: now,
    completedAt: new Date(),
    dueProjectCount: dueConfigs.length,
    claimedProjectCount,
    projects: results
  };
}
