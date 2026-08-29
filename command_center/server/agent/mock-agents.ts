import type {
  AgentVerifier,
  AgentWorker,
  AgentWorkPlan,
  ChiefPortfolioAgent,
  ProjectManagerAgent
} from "@/server/agent/contracts";

const staleAfterMs = 7 * 24 * 60 * 60 * 1000;

export class DeterministicChiefPortfolioAgent implements ChiefPortfolioAgent {
  async inspectPortfolio(projects: Parameters<ChiefPortfolioAgent["inspectPortfolio"]>[0], now: Date) {
    const stalledProjectIds = projects
      .filter(
        (project) =>
          !project.lastAgentReviewAt || now.getTime() - project.lastAgentReviewAt.getTime() > staleAfterMs
      )
      .map((project) => project.projectId);
    const wipViolationProjectIds = projects
      .filter((project) => project.activeWorkCount > project.maxConcurrentWorkItems)
      .map((project) => project.projectId);
    const projectsNeedingPmReview = projects
      .filter((project) => !project.nextAgentReviewAt || project.nextAgentReviewAt <= now)
      .map((project) => project.projectId);
    const movingProjectIds = projects
      .filter((project) => !stalledProjectIds.includes(project.projectId) && project.activeWorkCount > 0)
      .map((project) => project.projectId);
    const blocked = projects.some((project) => project.health === "BLOCKED");
    const needsAttention =
      blocked || stalledProjectIds.length > 0 || wipViolationProjectIds.length > 0 || projects.some((p) => p.pendingDecisionCount > 0);

    return {
      generatedAt: now,
      status: blocked ? "BLOCKED" as const : needsAttention ? "NEEDS_ATTENTION" as const : "HEALTHY" as const,
      movingProjectIds,
      stalledProjectIds,
      wipViolationProjectIds,
      projectsNeedingPmReview,
      attentionSummary: needsAttention
        ? `${stalledProjectIds.length} stalled, ${wipViolationProjectIds.length} over WIP, ${projects.reduce((sum, p) => sum + p.pendingDecisionCount, 0)} owner decisions.`
        : "Portfolio is moving within policy and WIP limits."
    };
  }
}

const plansByProfile: Record<string, AgentWorkPlan> = {
  CCHCS_PM: {
    title: "Prepare a bounded CCHCS methodology decision brief",
    objective: "Clarify one material methodology interpretation without exposing sensitive data.",
    expectedValue: "Unblocks an executive-quality deliverable while preserving Ryan's approval boundary.",
    acceptanceCriteria:
      "State the interpretation, evidence, operational impact, and decision needed; contain no PHI or patient identifiers.",
    agentRole: "CCHCS_ANALYST",
    actionCategory: "CCHCS_PROJECT_MANAGEMENT",
    priority: "HIGH",
    maxAttempts: 2,
    plannedBottleneck: "Material methodology interpretation awaiting owner approval",
    ownerDecisionAfterQa: {
      category: "CCHCS_METHODOLOGY_DECISION",
      question: "Approve the methodology interpretation before executive delivery?",
      context: "A PHI-free decision brief has been prepared and independently checked.",
      recommendedChoice: "APPROVE",
      availableChoices: ["APPROVE", "REVISE", "REVIEW DETAILS"],
      expectedUpside: "Keeps the CCHCS deliverable moving without delegating a material professional judgment.",
      risk: "An incorrect interpretation could affect executive reporting or professional commitments.",
      capability: "CCHCS_METHODOLOGY_DECISION",
      boundedPayload: { artifact: "PHI-free methodology decision brief", authorization: "interpretation approval only" }
    }
  },
  SIGNALCARE_GM: {
    title: "Research CarolinasDentist as a qualified SignalCare prospect",
    objective: "Produce a concise qualification and outreach premise tied to a real commercial need.",
    expectedValue: "Advances customer acquisition rather than routine website optimization.",
    acceptanceCriteria:
      "Document fit, evidence, likely pain, contact path, and a bounded draft outreach premise without sending it.",
    agentRole: "SIGNALCARE_RESEARCHER",
    actionCategory: "RESEARCH_READ_ONLY",
    priority: "HIGH",
    maxAttempts: 3,
    plannedBottleneck: "Qualified prospect needs owner-approved outreach",
    ownerDecisionAfterQa: {
      category: "SEND_EMAIL_OR_MESSAGE",
      question: "Approve outreach to CarolinasDentist?",
      context: "Prospect fit and a bounded outreach premise were researched; no message has been sent.",
      recommendedChoice: "APPROVE",
      availableChoices: ["APPROVE", "MORE RESEARCH", "PASS"],
      expectedUpside: "Creates a credible path to a paid SignalCare conversation.",
      risk: "External communication represents Ryan and may create expectations.",
      capability: "SEND_EMAIL",
      boundedPayload: { recipientOrganization: "CarolinasDentist", package: "exact reviewed outreach package" }
    }
  },
  RYKAS_GM: {
    title: "Verify one Rykas inventory opportunity",
    objective: "Validate economics and inventory-turn evidence for a bounded purchase candidate.",
    expectedValue: "Moves toward realized profit instead of more sourcing-dashboard refinement.",
    acceptanceCriteria:
      "Document source evidence, expected margin, downside, inventory-turn rationale, and a capped purchase amount.",
    agentRole: "RYKAS_SOURCING_ANALYST",
    actionCategory: "RESEARCH_READ_ONLY",
    priority: "HIGH",
    maxAttempts: 3,
    plannedBottleneck: "Verified opportunity needs a purchase decision",
    ownerDecisionAfterQa: {
      category: "PURCHASE_INVENTORY",
      question: "Approve inventory purchase up to $487?",
      context: "A bounded opportunity was verified against current economic guardrails; no purchase has been made.",
      recommendedChoice: "BUY",
      availableChoices: ["BUY", "REDUCE", "PASS"],
      expectedUpside: "Adds inventory with a credible path to realized monthly net profit and healthy turns.",
      risk: "Capital may be tied up or lost if demand or economics are wrong.",
      amountCents: 48700,
      currency: "USD",
      capability: "PURCHASE",
      boundedPayload: { candidate: "verified inventory opportunity", maximumCents: 48700, currency: "USD" }
    }
  }
};

export class DeterministicProjectManagerAgent implements ProjectManagerAgent {
  async chooseNextWork(context: Parameters<ProjectManagerAgent["chooseNextWork"]>[0]) {
    if (context.operatingMode === "LIVE_INTERNAL" && context.toolEvidence?.length) {
      const output = context.toolEvidence[0]?.output as Record<string, unknown>;
      if (context.profile === "SIGNALCARE_GM") {
        const prospects = (output.prospects as Array<{ name: string; evidence: string | null; stale: boolean }> | undefined) ?? [];
        if (!prospects.length) return { ...plansByProfile.SIGNALCARE_GM, disposition: "WAIT" as const, plannedBottleneck: "No qualified prospect is currently recorded; PM will not invent pipeline work." };
        const target = prospects.find((p) => !p.evidence || p.stale) ?? prospects[0]!;
        return { ...plansByProfile.SIGNALCARE_GM, title: `Resolve qualification evidence for ${target.name}`, objective: `Resolve the highest-value missing or stale acquisition evidence for ${target.name} without sending outreach.`, ownerDecisionAfterQa: undefined };
      }
      if (context.profile === "RYKAS_GM" && output.sourcingAllowed === false) return { ...plansByProfile.RYKAS_GM, title: "Resolve the Rykas listing backlog before sourcing", objective: "Identify and resolve the highest-value listing or inventory-flow blocker.", actionCategory: "RESEARCH_READ_ONLY" as const, ownerDecisionAfterQa: undefined };
      if (context.profile === "CCHCS_PM" && (Number(output.overdueCount) > 0 || Number(output.waitingCount) > 0)) return { ...plansByProfile.CCHCS_PM, title: "Reconcile overdue and waiting CCHCS commitments", objective: "Produce a PHI-free prioritized follow-up plan for current stalled commitments.", ownerDecisionAfterQa: undefined };
    }
    return (
      plansByProfile[context.profile] ?? {
        title: `Review the current bottleneck for ${context.projectName}`,
        objective: "Create one bounded, reversible step toward the project objective.",
        expectedValue: "Restores visible project movement without expanding scope.",
        acceptanceCriteria: "Produce a concise operational result and evidence for independent QA.",
        agentRole: "PROJECT_WORKER",
        actionCategory: "RESEARCH_READ_ONLY",
        priority: "MEDIUM",
        maxAttempts: 3,
        plannedBottleneck: context.currentBottleneck ?? "Current bottleneck needs evidence"
      }
    );
  }
}

export class DeterministicMockWorker implements AgentWorker {
  async execute(input: Parameters<AgentWorker["execute"]>[0]) {
    return {
      operationalResultSummary: `Completed bounded mock execution for: ${input.title}`,
      evidence: `Acceptance criteria checked: ${input.acceptanceCriteria}`,
      structuredOutcome: {
        phase: "phase-1-mock",
        attempt: input.attempt,
        acceptanceCriteriaSatisfied: true,
        externalActionTaken: false,
        containsHiddenReasoning: false
      },
      providerIdentifier: "deterministic-mock",
      executorIdentifier: "ryanos-phase1-mock-worker",
      externalRunId: `mock-${input.workItemId}-${input.attempt}`,
      testOutcome: "PASS"
    };
  }
}

export class DeterministicQaVerifier implements AgentVerifier {
  async verify(input: Parameters<AgentVerifier["verify"]>[0]) {
    const forced = input.result.structuredOutcome.forceQaOutcome;
    if (forced === "REPAIR") {
      return {
        outcome: "REPAIR" as const,
        feedback: "Repair the bounded acceptance-criteria gap before completion.",
        evidence: "Mock QA detected an intentionally forced repair condition."
      };
    }
    if (forced === "ESCALATE") {
      return {
        outcome: "ESCALATE" as const,
        feedback: "Owner judgment is genuinely required.",
        evidence: "Mock QA detected an intentionally forced escalation condition."
      };
    }
    return {
      outcome: "PASS" as const,
      feedback: "Independent mock QA verified the operational result against the acceptance criteria.",
      evidence: input.result.evidence
    };
  }
}
