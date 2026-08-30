import { prisma } from "@/lib/prisma";
import {
  deriveAgentPortfolioDisplay,
  deriveAgentProjectDisplayState
} from "@/server/agent/display-state";
import { ensureInitialAgentProjects } from "@/server/agent/setup-service";
import {
  reconcilePendingRykasOwnerDecisions,
  recoverBrokenRykasOwnerDataDecision,
  recoverPrematurelyResolvedRykasOwnerUpdates
} from "@/server/agent/work-service";

export function parseDecisionChoices(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((choice) => typeof choice === "string")
      ? parsed
      : [];
  } catch {
    return [];
  }
}

export async function getAgentHqData(userId: string, now = new Date()) {
  await ensureInitialAgentProjects(userId);
  await recoverBrokenRykasOwnerDataDecision(userId, prisma, now);
  await recoverPrematurelyResolvedRykasOwnerUpdates(userId, prisma, now);
  await reconcilePendingRykasOwnerDecisions(userId, prisma, now);
  const [configs, decisions, events, completedCount, runners, actions, signalCareQueue] = await Promise.all([
    prisma.agentProjectConfig.findMany({
      where: { userId },
      include: {
        project: {
          include: {
            agentWorkItems: {
              orderBy: [{ updatedAt: "desc" }],
              take: 30,
              include: { runs: { orderBy: { startedAt: "desc" }, take: 4 } }
            },
            agentDecisions: { orderBy: { updatedAt: "desc" } },
            agentEvents: { orderBy: { createdAt: "desc" }, take: 20 }
          }
        }
      },
      orderBy: { project: { name: "asc" } }
    }),
    prisma.agentDecision.findMany({
      where: { userId, status: "PENDING" },
      include: {
        project: { select: { name: true } },
        originatingWorkItem: { select: { title: true } },
        actionRequest: { select: { boundedPayload: true } }
      },
      orderBy: [{ createdAt: "asc" }]
    }),
    prisma.agentEvent.findMany({
      where: { userId },
      include: { project: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 24
    }),
    prisma.agentWorkItem.count({ where: { userId, state: "DONE" } }),
    prisma.agentRunner.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    prisma.agentActionRequest.findMany({ where: { userId, state: { in: ["AUTHORIZED", "AWAITING_EXECUTION", "EXECUTING", "VERIFYING"] } }, include: { project: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.queueItem.findMany({
      where: {
        userId,
        lane: { in: ["signalcare", "pipeline"] },
        status: { notIn: ["passed", "done", "killed"] }
      },
      select: { status: true }
    })
  ]);

  const displayStates = configs.map((config) =>
    deriveAgentProjectDisplayState(
      config.profile === "SIGNALCARE_GM"
        ? {
            ...config,
            signalCarePipeline: {
              qualified: signalCareQueue.filter((item) =>
                ["qualified", "outreach_ready"].includes(
                  item.status.trim().toLowerCase()
                )
              ).length,
              queued: signalCareQueue.filter(
                (item) => item.status.trim().toLowerCase() === "queued"
              ).length
            }
          }
        : config,
      now
    )
  );
  const portfolioDisplay = deriveAgentPortfolioDisplay(displayStates, configs, now);
  const displayByProjectId = new Map(
    displayStates.map((display) => [display.projectId, display])
  );
  const displayConfigs = configs.map((config) => ({
    ...config,
    displayState: displayByProjectId.get(config.projectId)!
  }));
  const chief = {
    generatedAt: portfolioDisplay.generatedAt,
    status: portfolioDisplay.status,
    movingProjectIds: portfolioDisplay.movingProjectIds,
    stalledProjectIds: portfolioDisplay.stalledProjectIds,
    wipViolationProjectIds: portfolioDisplay.wipViolationProjectIds,
    projectsNeedingPmReview: portfolioDisplay.projectsNeedingPmReview,
    attentionSummary: portfolioDisplay.attentionSummary
  };

  return {
    chief,
    configs: displayConfigs,
    decisions: decisions.map((decision) => ({
      ...decision,
      choices: parseDecisionChoices(decision.availableChoices)
    })),
    events,
    actions,
    runners: runners.map((runner) => ({ ...runner, effectiveStatus: runner.enabled && runner.lastHeartbeatAt && now.getTime() - runner.lastHeartbeatAt.getTime() < 2 * 60 * 1000 ? "ONLINE" : "OFFLINE" })),
    summary: {
      activeProjects: portfolioDisplay.activeProjectCount,
      activeWork: portfolioDisplay.activeWorkCount,
      completedOutcomes: completedCount,
      retriesAndFailures: portfolioDisplay.currentRetryFailureCount,
      projectsRequiringAttention: portfolioDisplay.projectsRequiringAttention,
      needRyan: portfolioDisplay.ownerDecisionCount,
      wipViolations: portfolioDisplay.wipViolationProjectIds.length
    }
  };
}
