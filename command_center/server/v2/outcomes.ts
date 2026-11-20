import type { PrismaClient } from "@prisma/client";
import { localCompletionOutcome } from "@/lib/v2/source-events";

// Local outcomes for one persistent action. Owner confirmation (localConfirmedAt)
// is never treated as source verification (sourceVerifiedAt), and completing a
// task never writes a goal result: results come only from their owner.

export type CompleteResult = {
  ok: boolean;
  status: "DONE" | "WAITING" | "ALREADY_DONE" | "NOT_FOUND";
  activatedSuccessorId: string | null;
  projectNeedsNextStep: boolean;
};

export async function completeAction(userId: string, taskId: string, db: PrismaClient, now = new Date()): Promise<CompleteResult> {
  return db.$transaction(async (tx) => {
    const task = await tx.executionTask.findFirst({
      where: { id: taskId, userId },
      select: {
        id: true, status: true, sourceKind: true, sourceState: true, successorTaskId: true, projectId: true,
        scheduledStart: true, scheduledEnd: true
      }
    });
    if (!task) return { ok: false, status: "NOT_FOUND", activatedSuccessorId: null, projectNeedsNextStep: false };
    if (task.status === "DONE") return { ok: true, status: "ALREADY_DONE", activatedSuccessorId: null, projectNeedsNextStep: false };

    const outcome = localCompletionOutcome(task.sourceKind, task.sourceState);
    // A block finished early releases the rest of its time.
    const endNow = task.scheduledStart && task.scheduledEnd && task.scheduledStart <= now && task.scheduledEnd > now;
    await tx.executionTask.update({
      where: { id: task.id },
      data: {
        status: outcome.status,
        waitingOn: outcome.waitingOn,
        localConfirmedAt: now,
        completedAt: outcome.status === "DONE" ? now : null,
        remainingMinutes: outcome.status === "DONE" ? 0 : undefined,
        whenBucket: outcome.status === "WAITING" ? "WAITING" : undefined,
        scheduledEnd: endNow ? now : undefined,
        // Waiting on source recovery: drop the slot, keep the commitment.
        ...(outcome.status === "WAITING" && task.scheduledStart && task.scheduledStart > now ? { scheduledStart: null, scheduledEnd: null } : {})
      }
    });
    await tx.executionTaskEvent.create({
      data: { userId, taskId: task.id, type: outcome.status === "DONE" ? "DONE" : "INSPECTED", detail: outcome.waitingOn ?? "Owner marked done" }
    });

    let activatedSuccessorId: string | null = null;
    if (outcome.status === "DONE" && task.successorTaskId) {
      const successor = await tx.executionTask.findFirst({
        where: {
          userId,
          status: { notIn: ["DONE", "DROPPED"] },
          OR: [{ id: task.successorTaskId }, { integrationSourceKey: task.successorTaskId }]
        },
        select: { id: true }
      });
      if (successor) {
        await tx.executionTask.update({
          where: { id: successor.id },
          data: { isBlocked: false, waitingOn: null, whenBucket: "TODAY" }
        });
        await tx.executionTaskEvent.create({ data: { userId, taskId: successor.id, type: "ACTIVATED", detail: "Previous step done" } });
        activatedSuccessorId = successor.id;
      }
    }

    let projectNeedsNextStep = false;
    if (task.projectId && !activatedSuccessorId && outcome.status === "DONE") {
      const open = await tx.executionTask.count({
        where: { userId, projectId: task.projectId, status: { notIn: ["DONE", "DROPPED"] } }
      });
      projectNeedsNextStep = open === 0;
    }
    return { ok: true, status: outcome.status, activatedSuccessorId, projectNeedsNextStep };
  });
}
