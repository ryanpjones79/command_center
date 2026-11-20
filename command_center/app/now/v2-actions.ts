"use server";

import { revalidatePath } from "next/cache";
import { markExecutionTaskStatusAction } from "@/app/execution-actions";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { localClock } from "@/lib/v2/zoned-time";
import { googleCalendarLoader } from "@/server/v2/day";
import { completeAction } from "@/server/v2/outcomes";
import { extendAction, interruptAction, loadDaySettings, postponeAction, scheduleAction } from "@/server/v2/schedule-service";

export type ActionMessage = { ok: boolean; message: string; detail?: unknown };

function refresh() {
  for (const path of ["/now", "/time-blocks", "/projects", "/inbox", "/tasks"]) revalidatePath(path);
}

export async function v2DoneAction(taskId: string): Promise<ActionMessage> {
  const user = await requireUser();
  const task = await prisma.executionTask.findFirst({ where: { id: taskId, userId: user.id }, select: { recurrenceFrequency: true } });
  if (!task) return { ok: false, message: "Task not found." };
  const result = await completeAction(user.id, taskId, prisma);
  if (task.recurrenceFrequency !== "NONE" && result.status === "DONE") {
    // Recurring: let the existing flow create the next occurrence (idempotent for DONE).
    await prisma.executionTask.update({ where: { id: taskId }, data: { status: "IN_PROGRESS" } });
    await markExecutionTaskStatusAction(taskId, "DONE");
  }
  refresh();
  if (result.status === "WAITING") return { ok: true, message: "Marked inspected. It stays open until the source reports recovery." };
  if (result.activatedSuccessorId) return { ok: true, message: "Done. The next step is now ready." };
  if (result.projectNeedsNextStep) return { ok: true, message: "Done. This project has no next step yet; it'll come up in review." };
  return { ok: true, message: "Done." };
}

export async function v2ExtendAction(taskId: string): Promise<ActionMessage> {
  const user = await requireUser();
  const result = await extendAction(user.id, taskId, 15, prisma, googleCalendarLoader());
  refresh();
  if (result.type === "EXTENDED") return { ok: true, message: "15 more minutes." };
  if (result.type === "CONFLICT") return { ok: false, message: `${result.message} Choose "Interrupted" to keep the rest for later.` };
  return { ok: false, message: "Task not found." };
}

export async function v2InterruptAction(taskId: string, minutesLeft: number | null): Promise<ActionMessage> {
  const user = await requireUser();
  const estimate = minutesLeft && Number.isFinite(minutesLeft) ? Math.min(480, Math.max(5, Math.round(minutesLeft))) : null;
  const result = await interruptAction(user.id, taskId, prisma, estimate);
  refresh();
  return result.ok
    ? { ok: true, message: `Kept ${result.remainingMinutes} min of work. It's back in today's queue for a new time.` }
    : { ok: false, message: "Task not found." };
}

export async function v2PostponeAction(taskId: string, choice: string): Promise<ActionMessage> {
  const user = await requireUser();
  if (!["TOMORROW", "THIS_WEEK", "REVIEW", "PARK", "DROP"].includes(choice)) return { ok: false, message: "Pick where it goes." };
  const result = await postponeAction(user.id, taskId, choice as "TOMORROW" | "THIS_WEEK" | "REVIEW" | "PARK" | "DROP", prisma);
  refresh();
  if (!result.ok) return { ok: false, message: "Task not found." };
  if (choice === "DROP") return { ok: true, message: "Dropped." };
  return { ok: true, message: result.stillWorthIt ? "Moved. It has been put off 3+ times; it'll ask whether it's still worth doing." : "Moved." };
}

export async function v2ScheduleAction(taskId: string, displaceIds?: string[], startNow = false): Promise<ActionMessage> {
  const user = await requireUser();
  const settings = await loadDaySettings(user.id, prisma);
  const result = await scheduleAction(user.id, taskId, prisma, googleCalendarLoader(), { displaceIds, startNow });
  refresh();
  if (result.type === "BOOKED") {
    const moved = result.displacedIds.length ? ` Moved ${result.displacedIds.length} block${result.displacedIds.length === 1 ? "" : "s"} back to today's queue.` : "";
    const buffer = result.usesBuffer ? " This uses today's interruption buffer." : "";
    return { ok: true, message: `Scheduled ${localClock(result.slot.start, settings.timeZone)}.${moved}${buffer}` };
  }
  if (result.type === "EXPIRED") return { ok: false, message: result.message };
  if (result.type === "CONFLICT") {
    const displaced = result.displace?.displaced ?? [];
    return {
      ok: false,
      message: displaced.length
        ? `${result.message} It fits at ${localClock(result.displace!.slot.start, settings.timeZone)} if ${displaced.map((block) => block.title).join(", ")} moves back to the queue.`
        : `${result.message} Nothing movable frees enough time; consider a later date or dropping something.`,
      detail: displaced.length ? { displaceIds: displaced.map((block) => block.id) } : null
    };
  }
  if (result.type === "STALE") return { ok: false, message: result.message };
  return { ok: false, message: "Task not found." };
}
