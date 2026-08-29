import { activeAgentWorkStates } from "@/lib/agent-state-machine";
import { prisma } from "@/lib/prisma";
import { DeterministicChiefPortfolioAgent } from "@/server/agent/mock-agents";
import { ModelChiefPortfolioAgent } from "@/server/agent/model-agents";
import { ensureInitialAgentProjects } from "@/server/agent/setup-service";

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
  const [configs, decisions, events, completedCount, retryFailureCount, runners, actions] = await Promise.all([
    prisma.agentProjectConfig.findMany({
      where: { userId },
      include: {
        project: {
          include: {
            agentWorkItems: {
              orderBy: [{ updatedAt: "desc" }],
              take: 12,
              include: { runs: { orderBy: { startedAt: "desc" }, take: 2 } }
            },
            agentDecisions: { where: { status: "PENDING" }, orderBy: { createdAt: "asc" } },
            agentEvents: { orderBy: { createdAt: "desc" }, take: 6 }
          }
        }
      },
      orderBy: { project: { name: "asc" } }
    }),
    prisma.agentDecision.findMany({
      where: { userId, status: "PENDING" },
      include: { project: { select: { name: true } }, originatingWorkItem: { select: { title: true } } },
      orderBy: [{ createdAt: "asc" }]
    }),
    prisma.agentEvent.findMany({
      where: { userId },
      include: { project: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 24
    }),
    prisma.agentWorkItem.count({ where: { userId, state: "DONE" } }),
    prisma.agentWorkItem.count({ where: { userId, state: { in: ["RETRY", "FAILED"] } } })
    ,prisma.agentRunner.findMany({ where: { userId }, orderBy: { name: "asc" } })
    ,prisma.agentActionRequest.findMany({ where: { userId, state: { in: ["AUTHORIZED", "AWAITING_EXECUTION", "EXECUTING", "VERIFYING"] } }, include: { project: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 20 })
  ]);

  const snapshots = configs.map((config) => ({
    projectId: config.projectId,
    name: config.project.name,
    objective: config.objective,
    primaryKpi: config.primaryKpi,
    health: config.health,
    currentBottleneck: config.currentBottleneck,
    activeWorkCount: config.project.agentWorkItems.filter((item) =>
      activeAgentWorkStates.includes(item.state)
    ).length,
    maxConcurrentWorkItems: config.maxConcurrentWorkItems,
    pendingDecisionCount: config.project.agentDecisions.length,
    lastAgentReviewAt: config.lastAgentReviewAt,
    nextAgentReviewAt: config.nextAgentReviewAt
  }));
  const chiefAgent = process.env.FEATURE_AGENT_MODELS === "true" && process.env.OPENAI_API_KEY ? new ModelChiefPortfolioAgent() : new DeterministicChiefPortfolioAgent();
  const chief = await chiefAgent.inspectPortfolio(snapshots, now);

  return {
    chief,
    configs,
    decisions: decisions.map((decision) => ({
      ...decision,
      choices: parseDecisionChoices(decision.availableChoices)
    })),
    events,
    actions,
    runners: runners.map((runner) => ({ ...runner, effectiveStatus: runner.enabled && runner.lastHeartbeatAt && now.getTime() - runner.lastHeartbeatAt.getTime() < 2 * 60 * 1000 ? "ONLINE" : "OFFLINE" })),
    summary: {
      activeProjects: configs.filter((config) => config.enabled && !config.pausedAt).length,
      activeWork: snapshots.reduce((sum, project) => sum + project.activeWorkCount, 0),
      completedOutcomes: completedCount,
      retriesAndFailures: retryFailureCount,
      projectsRequiringAttention: snapshots.filter(
        (project) => project.health !== "ON_TRACK" || project.pendingDecisionCount > 0
      ).length,
      wipViolations: chief.wipViolationProjectIds.length
    }
  };
}
