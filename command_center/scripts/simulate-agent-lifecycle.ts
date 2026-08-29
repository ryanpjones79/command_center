import { PrismaClient } from "@prisma/client";
import { runAgentOrchestrationCycle } from "../server/agent/orchestration-service";
import { ensureInitialAgentProjects } from "../server/agent/setup-service";
import { resolveOwnerDecision } from "../server/agent/work-service";

const prisma = new PrismaClient();

async function main() {
  const simulationUser = await prisma.user.create({
    data: {
      email: `agent-phase1-simulation-${Date.now()}@local.invalid`,
      passwordHash: "simulation-not-a-login",
      executionDomains: {
        create: [
          { name: "Work", slug: "work", isDefault: true },
          { name: "Rykas", slug: "rykas", isDefault: true }
        ]
      }
    }
  });

  try {
    await ensureInitialAgentProjects(simulationUser.id, prisma);
    const now = new Date();
    await prisma.agentProjectConfig.updateMany({
      where: { userId: simulationUser.id },
      data: { nextAgentReviewAt: now, leaseToken: null, leaseExpiresAt: null }
    });
    const cycle = await runAgentOrchestrationCycle(now, { userId: simulationUser.id, db: prisma });
    const decisions = await prisma.agentDecision.findMany({
      where: { userId: simulationUser.id, status: "PENDING" },
      include: { project: { select: { name: true } } }
    });
    for (const decision of decisions) {
      await resolveOwnerDecision(
        simulationUser.id,
        decision.id,
        decision.recommendedChoice ?? (JSON.parse(decision.availableChoices) as string[])[0]!,
        prisma
      );
    }
    const outcomes = await prisma.executionProject.findMany({
      where: { userId: simulationUser.id },
      select: {
        name: true,
        agentWorkItems: { select: { state: true, resultSummary: true, evidenceSummary: true } },
        agentDecisions: { select: { status: true, selectedChoice: true, resultingAction: true, actionRequest: { select: { state: true, capability: true, executedAt: true, authorizationBounds: true } } } }
      },
      orderBy: { name: "asc" }
    });
    console.log(JSON.stringify({ cycle, outcomes }, null, 2));
  } finally {
    await prisma.user.delete({ where: { id: simulationUser.id } });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
