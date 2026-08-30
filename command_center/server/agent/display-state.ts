import type { AgentWorkState } from "@prisma/client";
import { activeAgentWorkStates } from "@/lib/agent-state-machine";
import {
  rykasTruthResultSchema,
  type RykasTruthResult
} from "@/lib/rykas-truth-contract";
import { signalCareResearchContextSchema } from "@/server/agent/signalcare-research-service";

const staleAfterMs = 7 * 24 * 60 * 60 * 1000;
const signalCareQualificationFailure =
  "SignalCare qualification returned inadequate provider provenance";

export type AgentProjectDisplayHealth =
  | "PAUSED"
  | "ON_TRACK"
  | "WAITING"
  | "NEEDS_ATTENTION"
  | "BLOCKED";

export type AgentProjectDisplayInput = {
  projectId: string;
  profile: string;
  enabled: boolean;
  pausedAt: Date | null;
  health: string;
  currentBottleneck: string | null;
  maxConcurrentWorkItems: number;
  lastAgentReviewAt: Date | null;
  nextAgentReviewAt: Date | null;
  project: {
    name: string;
    agentWorkItems: Array<{
      id: string;
      title: string;
      state: AgentWorkState;
      requiredCapability: string;
      operationalContext: string | null;
      blocker: string | null;
      resultSummary: string | null;
      attemptCount: number;
      maxAttempts: number;
      createdAt: Date;
      updatedAt: Date;
      completedAt: Date | null;
      runs: Array<{
        id: string;
        runType: string;
        status: string;
        operationalResultSummary: string | null;
        structuredOutcome: string | null;
        startedAt: Date;
        completedAt: Date | null;
      }>;
    }>;
    agentDecisions: Array<{
      id: string;
      status: string;
      question: string;
      selectedChoice: string | null;
      category: string;
      context: string;
      createdAt: Date;
      updatedAt: Date;
      resolvedAt: Date | null;
    }>;
    agentEvents: Array<{
      id: string;
      type: string;
      summary: string;
      metadata: string | null;
      createdAt: Date;
    }>;
  };
};

export type AgentProjectDisplayState = {
  projectId: string;
  projectName: string;
  profile: string;
  paused: boolean;
  displayHealth: AgentProjectDisplayHealth;
  displayBottleneck: string;
  displayLatestOutcome: string;
  ownerAttentionRequired: boolean;
  pendingOwnerDecisionCount: number;
  nextReviewState: "PAUSED" | "DUE" | "SCHEDULED" | "NOT_SCHEDULED";
  nextReviewAt: Date | null;
  machineWorkState: {
    activeCount: number;
    currentSummary: string;
    wipViolation: boolean;
    currentRetryFailureCount: number;
  };
  supportingState: null | {
    kind: "RYKAS_TRUTH";
    poLedgerStatus: string;
    poTruthCurrent: boolean;
    safeInventoryCapital: number | null;
    safeBuyingCapacity: number | null;
    coreRestockNeeds: number | null;
    debtPlanStatus: string | null;
    financialHealth: string | null;
    poCertifiedAt: string | null;
    openCommitments: number | null;
  };
};

type OutcomeCandidate = {
  at: Date;
  priority: number;
  summary: string;
};

type TimedRykasTruth = { at: Date; truth: RykasTruthResult };
type SignalCareQualificationExhaustion = {
  target: string;
  at: Date;
  attempts: number;
};

function timestamp(value: Date | null | undefined, fallback: Date) {
  return value ?? fallback;
}

function parseJson(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function eventMetadata(value: string | null) {
  const parsed = parseJson(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
}

function concise(value: string, fallback: string) {
  const normalized = value.replaceAll("\\n", " ").replace(/\s+/g, " ").trim();
  if (!normalized || normalized.startsWith("{") || normalized.startsWith("["))
    return fallback;
  return normalized.length > 520
    ? `${normalized.slice(0, 517).trimEnd()}…`
    : normalized;
}

export function containsOwnerDecisionLanguage(
  value: string | null | undefined
) {
  if (!value) return false;
  return [
    /owner[- ](?:approved|approval|decision|authorization|review)/i,
    /(?:awaiting|needs?|requires?|blocked on) (?:an? )?(?:ryan|owner)(?:'s)?(?: approval| decision| authorization| review)?/i,
    /(?:ryan|owner) (?:must|needs to|has to) (?:approve|decide|review|authorize)/i,
    /blocked on (?:an? )?(?:unrecorded )?.*decision/i,
    /qualified prospect needs .*outreach/i
  ].some((pattern) => pattern.test(value));
}

function parseSignalCareContext(value: string | null) {
  const parsed = parseJson(value);
  const result = signalCareResearchContextSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

function latestRykasTruth(
  input: AgentProjectDisplayInput
): TimedRykasTruth | null {
  const matches: TimedRykasTruth[] = [];
  for (const item of input.project.agentWorkItems) {
    for (const run of item.runs) {
      if (run.runType !== "RYKAS_TRUTH_READ" || run.status !== "SUCCEEDED")
        continue;
      const parsed = rykasTruthResultSchema.safeParse(
        parseJson(run.structuredOutcome)
      );
      if (parsed.success) {
        matches.push({
          at: timestamp(
            run.completedAt,
            timestamp(item.completedAt, run.startedAt)
          ),
          truth: parsed.data
        });
      }
    }
  }
  return (
    matches.sort((left, right) => right.at.getTime() - left.at.getTime())[0] ??
    null
  );
}

function signalCareExhaustion(
  input: AgentProjectDisplayInput
): SignalCareQualificationExhaustion | null {
  const failures = new Map<string, Array<{ name: string; at: Date }>>();
  const successes = new Map<string, Date>();
  const terminalPasses = new Map<string, Date>();
  for (const event of input.project.agentEvents) {
    if (event.type !== "SIGNALCARE_QUALIFICATION_EXHAUSTED") continue;
    try {
      const metadata = JSON.parse(event.metadata ?? "{}") as {
        outcome?: unknown;
        targetProspect?: unknown;
      };
      if (
        metadata.outcome === "PASS_INSUFFICIENT_EVIDENCE" &&
        typeof metadata.targetProspect === "string"
      ) {
        terminalPasses.set(
          metadata.targetProspect.trim().toLowerCase(),
          event.createdAt
        );
      }
    } catch {
      // Invalid audit metadata cannot supersede deterministic work history.
    }
  }
  for (const item of input.project.agentWorkItems) {
    if (item.requiredCapability !== "SIGNALCARE_PUBLIC_WEB_RESEARCH") continue;
    const context = parseSignalCareContext(item.operationalContext);
    if (!context || context.researchMode !== "QUALIFY_EXISTING_PROSPECT")
      continue;
    const key = context.targetProspect.trim().toLowerCase();
    const at = timestamp(item.completedAt, item.updatedAt);
    if (
      item.state === "FAILED" &&
      item.blocker?.includes(signalCareQualificationFailure)
    ) {
      failures.set(key, [
        ...(failures.get(key) ?? []),
        { name: context.targetProspect, at }
      ]);
    }
    if (item.state === "DONE") {
      const previous = successes.get(key);
      if (!previous || previous < at) successes.set(key, at);
    }
  }

  const exhausted = [...failures.entries()]
    .map(([key, attempts]) => {
      const ordered = attempts.sort(
        (left, right) => right.at.getTime() - left.at.getTime()
      );
      const newestFailureAt = ordered[0]?.at;
      if (
        attempts.length < 2 ||
        !newestFailureAt ||
        (successes.get(key)?.getTime() ?? 0) > newestFailureAt.getTime() ||
        (terminalPasses.get(key)?.getTime() ?? 0) >= newestFailureAt.getTime()
      ) {
        return null;
      }
      return {
        target: ordered[0]!.name,
        at: newestFailureAt,
        attempts: attempts.length
      };
    })
    .filter((value): value is SignalCareQualificationExhaustion =>
      Boolean(value)
    )
    .sort((left, right) => right.at.getTime() - left.at.getTime());

  return exhausted[0] ?? null;
}

function newestCurrentWorkTimestamp(
  input: AgentProjectDisplayInput,
  states: AgentWorkState[]
) {
  return input.project.agentWorkItems
    .filter((item) => states.includes(item.state))
    .reduce(
      (latest, item) =>
        Math.max(latest, timestamp(item.completedAt, item.updatedAt).getTime()),
      0
    );
}

function latestMeaningfulOutcome(
  input: AgentProjectDisplayInput,
  rykas: ReturnType<typeof latestRykasTruth>,
  signalCare: ReturnType<typeof signalCareExhaustion>
) {
  const candidates: OutcomeCandidate[] = [];
  if (rykas) {
    candidates.push({
      at: rykas.at,
      priority: 100,
      summary: `Read-only Rykas ${rykas.truth.operation} completed.`
    });
  }
  if (signalCare) {
    candidates.push({
      at: signalCare.at,
      priority: 100,
      summary: `Qualification follow-up exhausted; ${signalCare.target} is not outreach-ready.`
    });
  }
  for (const decision of input.project.agentDecisions) {
    if (decision.status === "RESOLVED" && decision.resolvedAt) {
      candidates.push({
        at: decision.resolvedAt,
        priority: 95,
        summary: concise(
          `Owner decision resolved: ${decision.question}${decision.selectedChoice ? ` — ${decision.selectedChoice.replaceAll("_", " ")}` : ""}.`,
          "Owner decision resolved."
        )
      });
    }
  }
  const meaningfulEventTypes = new Set([
    "OWNER_DECISION_RESOLVED",
    "QA_PASSED",
    "QA_FAILED",
    "SIGNALCARE_DISCOVERY_NO_MATCH",
    "SIGNALCARE_QUALIFICATION_EXHAUSTED",
    "RYKAS_TRUTH_READ",
    "RYKAS_PURCHASE_CANDIDATE_READY",
    "RYKAS_DATA_BLOCKED",
    "RYKAS_DATA_STALE",
    "POLICY_BLOCKED_ACTION"
  ]);
  for (const event of input.project.agentEvents) {
    if (!meaningfulEventTypes.has(event.type)) continue;
    candidates.push({
      at: event.createdAt,
      priority: event.type === "OWNER_DECISION_RESOLVED" ? 90 : 70,
      summary: concise(
        event.summary,
        "A state-changing agent event was recorded."
      )
    });
  }
  for (const item of input.project.agentWorkItems) {
    if (item.state === "DONE" && item.resultSummary) {
      candidates.push({
        at: timestamp(item.completedAt, item.updatedAt),
        priority: 80,
        summary: concise(item.resultSummary, `${item.title} completed.`)
      });
    } else if (item.state === "FAILED") {
      candidates.push({
        at: timestamp(item.completedAt, item.updatedAt),
        priority: 40,
        summary: concise(
          item.blocker ?? item.resultSummary ?? `${item.title} failed.`,
          `${item.title} failed.`
        )
      });
    }
  }
  return (
    candidates.sort((left, right) => {
      const time = right.at.getTime() - left.at.getTime();
      return time || right.priority - left.priority;
    })[0]?.summary ?? "No completed outcome yet."
  );
}

export function deriveAgentProjectDisplayState(
  input: AgentProjectDisplayInput,
  now = new Date()
): AgentProjectDisplayState {
  const paused = !input.enabled || Boolean(input.pausedAt);
  const pendingDecisions = input.project.agentDecisions.filter(
    (decision) => decision.status === "PENDING"
  );
  const ownerAttentionRequired = pendingDecisions.length > 0;
  const activeWork = input.project.agentWorkItems.filter((item) =>
    activeAgentWorkStates.includes(item.state)
  );
  const rykas = input.profile === "RYKAS_GM" ? latestRykasTruth(input) : null;
  const signalCare =
    input.profile === "SIGNALCARE_GM" ? signalCareExhaustion(input) : null;
  const latestSuccessAt = newestCurrentWorkTimestamp(input, [
    "DONE",
    "READY_FOR_REVIEW"
  ]);
  const latestFailureAt = newestCurrentWorkTimestamp(input, ["FAILED"]);
  const newerSuccessSupersedesFailure =
    latestSuccessAt > 0 && latestSuccessAt > latestFailureAt;
  const currentFailed = input.project.agentWorkItems.filter(
    (item) =>
      item.state === "FAILED" &&
      timestamp(item.completedAt, item.updatedAt).getTime() > latestSuccessAt
  );
  const currentRetryFailureCount =
    input.project.agentWorkItems.filter((item) => item.state === "RETRY")
      .length + currentFailed.length;
  const latestOutcome = latestMeaningfulOutcome(input, rykas, signalCare);
  const wipViolation =
    !paused && activeWork.length > input.maxConcurrentWorkItems;
  const reviewDue =
    !paused && (!input.nextAgentReviewAt || input.nextAgentReviewAt <= now);
  const reviewStale =
    !paused &&
    (!input.lastAgentReviewAt ||
      now.getTime() - input.lastAgentReviewAt.getTime() > staleAfterMs);

  let supportingState: AgentProjectDisplayState["supportingState"] = null;
  let displayHealth: AgentProjectDisplayHealth = paused ? "PAUSED" : "ON_TRACK";
  let displayBottleneck =
    input.currentBottleneck?.trim() || "No current blocker is recorded.";

  if (paused) {
    displayBottleneck =
      "Intentionally paused; no active review or machine work is requested.";
  } else if (rykas) {
    const capital = rykas.truth.data.capital;
    const financial = rykas.truth.data.financialSnapshot;
    const capitalPlan = financial?.capitalPlan ?? rykas.truth.data.capitalPlan;
    if (capital || financial || capitalPlan) {
      supportingState = {
        kind: "RYKAS_TRUTH",
        poLedgerStatus: capital?.poLedgerStatus ?? "UNKNOWN",
        poTruthCurrent: capital?.poTruthCurrent ?? !financial?.missingInputs.includes("PO_COMMITMENTS"),
        safeInventoryCapital: capital?.safeInventoryCapital ?? null,
        safeBuyingCapacity: capitalPlan?.safeBuyingCapacity ?? null,
        coreRestockNeeds: financial?.replenishment.candidateCount ?? null,
        debtPlanStatus: typeof financial?.debtAdvice.status === "string" ? financial.debtAdvice.status : null,
        financialHealth: financial?.financialHealth.status ?? null,
        poCertifiedAt: capital?.poCertifiedAt ?? null,
        openCommitments: capitalPlan?.committedCapital ?? capital?.openCommitments ?? null
      };
    }
    if (financial && (financial.status === "BLOCKED" || capitalPlan?.status === "BLOCKED")) {
      displayHealth = "NEEDS_ATTENTION";
      displayBottleneck = financial.missingInputs.length
        ? `Financial truth needs one consolidated update: ${financial.missingInputs.join(", ")}.`
        : "Rykas financial truth requires reconciliation before buying decisions.";
    } else if (
      !financial && (
      !capital ||
      !capital.reliable ||
      !capital.poTruthCurrent ||
      capital.safeInventoryCapital === null
      )
    ) {
      displayHealth = "NEEDS_ATTENTION";
      displayBottleneck =
        "PO/capital truth requires reconciliation before buying decisions.";
    } else if (rykas.truth.stale || rykas.truth.data.blockers.length > 0) {
      displayHealth = "NEEDS_ATTENTION";
      displayBottleneck = concise(
        rykas.truth.data.blockers[0]?.summary ??
          "Rykas truth requires refresh before the next buying decision.",
        "Rykas truth requires refresh before the next buying decision."
      );
    } else {
      displayHealth = activeWork.length ? "ON_TRACK" : "WAITING";
      displayBottleneck = rykas.truth.data.purchaseCandidates.length
        ? "A purchase candidate fits current deterministic capital gates and is ready for bounded owner review; no purchase has occurred."
        : capitalPlan && capitalPlan.safeBuyingCapacity === 0
          ? "No discretionary buying capacity is available; debt reduction or holding cash should be considered."
          : "No PO/capital reconciliation blocker is present in the latest Rykas truth.";
    }
  } else if (signalCare) {
    displayHealth = "NEEDS_ATTENTION";
    displayBottleneck = `Public evidence remains inadequate after two bounded qualification attempts for ${signalCare.target}.`;
  } else if (wipViolation) {
    displayHealth = "NEEDS_ATTENTION";
    displayBottleneck = `Machine work exceeds the deterministic WIP limit (${activeWork.length}/${input.maxConcurrentWorkItems}).`;
  } else if (ownerAttentionRequired) {
    displayHealth = "NEEDS_ATTENTION";
    if (!containsOwnerDecisionLanguage(displayBottleneck)) {
      displayBottleneck = `${pendingDecisions.length} owner decision${pendingDecisions.length === 1 ? "" : "s"} awaiting review.`;
    }
  } else if (activeWork.length > 0) {
    displayHealth = "ON_TRACK";
  } else if (currentFailed.length > 0) {
    displayHealth = "NEEDS_ATTENTION";
    displayBottleneck = concise(
      currentFailed.sort(
        (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()
      )[0]?.blocker ?? "The latest machine work failed.",
      "The latest machine work failed."
    );
  } else if (newerSuccessSupersedesFailure) {
    displayHealth = reviewDue || reviewStale ? "NEEDS_ATTENTION" : "WAITING";
    if (input.health === "BLOCKED") {
      displayBottleneck =
        "The latest bounded work completed successfully; awaiting the next scheduled review.";
    }
  } else if (reviewDue || reviewStale) {
    displayHealth = "NEEDS_ATTENTION";
    if (!input.currentBottleneck?.trim()) {
      displayBottleneck = reviewDue
        ? "The next bounded project review is due."
        : "The active project review is stale.";
    }
  } else if (["NEEDS_ATTENTION", "BLOCKED"].includes(input.health)) {
    displayHealth = containsOwnerDecisionLanguage(displayBottleneck)
      ? "WAITING"
      : (input.health as "NEEDS_ATTENTION" | "BLOCKED");
  } else if (input.health === "WAITING") {
    displayHealth = "WAITING";
  }

  if (
    !ownerAttentionRequired &&
    containsOwnerDecisionLanguage(displayBottleneck)
  ) {
    displayBottleneck = activeWork.length
      ? "Current bounded machine work is in progress."
      : displayHealth === "BLOCKED"
        ? "A non-owner operational blocker requires reconciliation."
        : "The project is waiting for its next bounded review.";
    if (displayHealth === "BLOCKED") displayHealth = "NEEDS_ATTENTION";
  }

  const nextReviewState = paused
    ? "PAUSED"
    : !input.nextAgentReviewAt
      ? "NOT_SCHEDULED"
      : input.nextAgentReviewAt <= now
        ? "DUE"
        : "SCHEDULED";

  return {
    projectId: input.projectId,
    projectName: input.project.name,
    profile: input.profile,
    paused,
    displayHealth,
    displayBottleneck,
    displayLatestOutcome: latestOutcome,
    ownerAttentionRequired,
    pendingOwnerDecisionCount: pendingDecisions.length,
    nextReviewState,
    nextReviewAt: input.nextAgentReviewAt,
    machineWorkState: {
      activeCount: paused ? 0 : activeWork.length,
      currentSummary: paused
        ? "Paused — no machine work requested."
        : activeWork.length
          ? `${activeWork[0]!.title}${activeWork.length > 1 ? ` (+${activeWork.length - 1} more)` : ""}`
          : "No active machine work.",
      wipViolation,
      currentRetryFailureCount: paused ? 0 : currentRetryFailureCount
    },
    supportingState
  };
}

export function deriveAgentPortfolioDisplay(
  projects: AgentProjectDisplayState[],
  inputs: AgentProjectDisplayInput[],
  now = new Date()
) {
  const active = projects.filter((project) => !project.paused);
  const inputByProjectId = new Map(
    inputs.map((input) => [input.projectId, input])
  );
  const stalledProjectIds = active
    .filter((project) => {
      const reviewedAt = inputByProjectId.get(
        project.projectId
      )?.lastAgentReviewAt;
      return !reviewedAt || now.getTime() - reviewedAt.getTime() > staleAfterMs;
    })
    .map((project) => project.projectId);
  const projectsNeedingPmReview = active
    .filter(
      (project) =>
        project.nextReviewState === "DUE" ||
        project.nextReviewState === "NOT_SCHEDULED"
    )
    .map((project) => project.projectId);
  const attention = active.filter(
    (project) =>
      ["NEEDS_ATTENTION", "BLOCKED"].includes(project.displayHealth) ||
      project.ownerAttentionRequired ||
      project.machineWorkState.wipViolation
  );
  const blocked = attention.filter(
    (project) => project.displayHealth === "BLOCKED"
  );
  const ownerDecisionCount = active.reduce(
    (sum, project) => sum + project.pendingOwnerDecisionCount,
    0
  );
  const pausedNames = projects
    .filter((project) => project.paused)
    .map((project) => project.projectName);
  const attentionFacts = attention
    .slice(0, 3)
    .map((project) => `${project.projectName}: ${project.displayBottleneck}`);
  const attentionSummary = attentionFacts.length
    ? `${attentionFacts.join(" ")}${pausedNames.length ? ` Paused by design: ${pausedNames.join(", ")}.` : ""}`
    : `${active.length} active project${active.length === 1 ? " is" : "s are"} operating within current WIP and owner-decision state.${pausedNames.length ? ` Paused by design: ${pausedNames.join(", ")}.` : ""}`;

  return {
    generatedAt: now,
    status: (blocked.length
      ? "BLOCKED"
      : attention.length
        ? "NEEDS_ATTENTION"
        : "HEALTHY") as "HEALTHY" | "NEEDS_ATTENTION" | "BLOCKED",
    movingProjectIds: active
      .filter((project) => project.machineWorkState.activeCount > 0)
      .map((project) => project.projectId),
    stalledProjectIds,
    wipViolationProjectIds: active
      .filter((project) => project.machineWorkState.wipViolation)
      .map((project) => project.projectId),
    projectsNeedingPmReview,
    attentionSummary,
    ownerDecisionCount,
    projectsRequiringAttention: attention.length,
    activeProjectCount: active.length,
    activeWorkCount: active.reduce(
      (sum, project) => sum + project.machineWorkState.activeCount,
      0
    ),
    currentRetryFailureCount: active.reduce(
      (sum, project) => sum + project.machineWorkState.currentRetryFailureCount,
      0
    )
  };
}
