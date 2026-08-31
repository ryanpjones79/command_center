import type { AgentSchedulerHeartbeat, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AgentCycleResult } from "@/server/agent/orchestration-service";

export const agentSchedulerHeartbeatId = "agent-orchestration";
export const defaultAgentSchedulerCadenceMinutes = 15;

export type AgentSchedulerDisplay = {
  status: "HEALTHY" | "OVERDUE";
  lastCycleAt: Date | null;
  nextExpectedCycleAt: Date | null;
  cadenceMinutes: number;
};

function boundedCadenceMinutes(value: number) {
  if (!Number.isFinite(value)) return defaultAgentSchedulerCadenceMinutes;
  return Math.min(1440, Math.max(1, Math.floor(value)));
}

export function configuredAgentSchedulerCadenceMinutes() {
  return boundedCadenceMinutes(
    Number(
      process.env.AGENT_ORCHESTRATION_CADENCE_MINUTES ??
        defaultAgentSchedulerCadenceMinutes
    )
  );
}

export function deriveAgentSchedulerDisplay(
  heartbeat: Pick<
    AgentSchedulerHeartbeat,
    "lastSucceededAt" | "cadenceMinutes"
  > | null,
  now = new Date()
): AgentSchedulerDisplay {
  const cadenceMinutes = boundedCadenceMinutes(
    heartbeat?.cadenceMinutes ?? configuredAgentSchedulerCadenceMinutes()
  );
  const lastCycleAt = heartbeat?.lastSucceededAt ?? null;
  const nextExpectedCycleAt = lastCycleAt
    ? new Date(lastCycleAt.getTime() + cadenceMinutes * 60 * 1000)
    : null;
  const overdueAfterMs = cadenceMinutes * 2 * 60 * 1000;
  const status =
    lastCycleAt && now.getTime() - lastCycleAt.getTime() <= overdueAfterMs
      ? "HEALTHY"
      : "OVERDUE";

  return { status, lastCycleAt, nextExpectedCycleAt, cadenceMinutes };
}

export async function recordAgentSchedulerStart(
  startedAt: Date,
  db: PrismaClient = prisma
) {
  const cadenceMinutes = configuredAgentSchedulerCadenceMinutes();
  return db.agentSchedulerHeartbeat.upsert({
    where: { id: agentSchedulerHeartbeatId },
    create: {
      id: agentSchedulerHeartbeatId,
      lastStartedAt: startedAt,
      cadenceMinutes
    },
    update: { lastStartedAt: startedAt, cadenceMinutes }
  });
}

export async function recordAgentSchedulerSuccess(
  result: AgentCycleResult,
  db: PrismaClient = prisma
) {
  const cadenceMinutes = configuredAgentSchedulerCadenceMinutes();
  return db.agentSchedulerHeartbeat.upsert({
    where: { id: agentSchedulerHeartbeatId },
    create: {
      id: agentSchedulerHeartbeatId,
      lastStartedAt: result.startedAt,
      lastSucceededAt: result.completedAt,
      cadenceMinutes,
      lastDueProjectCount: result.dueProjectCount,
      lastClaimedProjectCount: result.claimedProjectCount,
      lastProjectOutcomeCount: result.projects.length
    },
    update: {
      lastStartedAt: result.startedAt,
      lastSucceededAt: result.completedAt,
      lastFailure: null,
      cadenceMinutes,
      lastDueProjectCount: result.dueProjectCount,
      lastClaimedProjectCount: result.claimedProjectCount,
      lastProjectOutcomeCount: result.projects.length
    }
  });
}

export async function recordAgentSchedulerFailure(
  startedAt: Date,
  failedAt: Date,
  error: unknown,
  db: PrismaClient = prisma
) {
  const cadenceMinutes = configuredAgentSchedulerCadenceMinutes();
  const lastFailure = (
    error instanceof Error ? error.message : "Unknown orchestration failure"
  ).slice(0, 1000);
  return db.agentSchedulerHeartbeat.upsert({
    where: { id: agentSchedulerHeartbeatId },
    create: {
      id: agentSchedulerHeartbeatId,
      lastStartedAt: startedAt,
      lastFailedAt: failedAt,
      lastFailure,
      cadenceMinutes
    },
    update: {
      lastStartedAt: startedAt,
      lastFailedAt: failedAt,
      lastFailure,
      cadenceMinutes
    }
  });
}
