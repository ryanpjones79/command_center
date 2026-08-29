import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type RecordAgentEventInput = {
  userId: string;
  projectId: string;
  workItemId?: string | null;
  runId?: string | null;
  decisionId?: string | null;
  idempotencyKey?: string;
  type: string;
  summary: string;
  metadata?: Record<string, unknown> | null;
};

export async function recordAgentEvent(
  input: RecordAgentEventInput,
  db: PrismaClient = prisma
) {
  try {
    return await db.agentEvent.create({
      data: {
        userId: input.userId,
        projectId: input.projectId,
        workItemId: input.workItemId ?? null,
        runId: input.runId ?? null,
        decisionId: input.decisionId ?? null,
        idempotencyKey: input.idempotencyKey ?? `event:${randomUUID()}`,
        type: input.type,
        summary: input.summary,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return db.agentEvent.findUnique({
        where: { idempotencyKey: input.idempotencyKey }
      });
    }
    throw error;
  }
}
