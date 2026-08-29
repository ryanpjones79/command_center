import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAgentEvent } from "@/server/agent/event-service";

export async function markAgentWorkIntegrated(userId: string, workItemId: string, commitSha: string, db: PrismaClient = prisma) {
  const work = await db.agentWorkItem.findFirst({ where: { id: workItemId, userId } });
  if (!work) throw new Error("AgentWorkItem not found for this user.");
  if (work.state !== "READY_FOR_REVIEW" || work.integrationStatus !== "PENDING_REVIEW") throw new Error("Only verified review-ready repository work can be marked integrated.");
  const updated = await db.agentWorkItem.update({ where: { id: work.id }, data: { integrationStatus: "INTEGRATED", integratedCommitSha: commitSha, integratedAt: new Date() } });
  await recordAgentEvent({ userId, projectId: work.projectId, workItemId: work.id, type: "WORK_INTEGRATED", summary: `${work.title} was confirmed integrated into canonical project state.`, metadata: { commitSha, movementKind: "CODE_INTEGRATED" } }, db);
  return updated;
}
