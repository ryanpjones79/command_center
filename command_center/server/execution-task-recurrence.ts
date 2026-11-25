import type { ExecutionTask, Prisma } from "@prisma/client";

function addDays(value: Date, days: number) {
  const copy = new Date(value);
  copy.setDate(copy.getDate() + days);
  return copy;
}
function nextDate(value: Date, task: ExecutionTask): Date | null {
  const frequency = task.recurrenceFrequency;
  if (frequency === "DAILY") return addDays(value, 1);
  if (frequency === "WEEKLY") return addDays(value, 7);
  if (frequency === "MONTHLY") {
    const copy = new Date(value);
    copy.setMonth(copy.getMonth() + 1);
    return copy;
  }
  const days =
    frequency === "WORKDAYS"
      ? [1, 2, 3, 4, 5]
      : frequency === "WEEKENDS"
        ? [0, 6]
        : frequency === "CUSTOM_WEEKDAYS"
          ? String(task.recurrenceWeekdays ?? "")
              .split(",")
              .map((day) => Number(day.trim()))
              .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
          : [];
  for (let index = 1; index <= 14 && days.length > 0; index++) {
    const candidate = addDays(value, index);
    if (days.includes(candidate.getDay())) return candidate;
  }
  return null;
}

/** Shared with the existing UI completion flow; never copy an integration source key to a new occurrence. */
export function nextExecutionTaskOccurrence(
  task: ExecutionTask,
  completedAt: Date,
): Prisma.ExecutionTaskUncheckedCreateInput | null {
  if (task.recurrenceFrequency === "NONE") return null;
  let next = nextDate(task.dueDate ?? task.followUpDate ?? completedAt, task);
  const today = new Date(
    completedAt.getFullYear(),
    completedAt.getMonth(),
    completedAt.getDate(),
  );
  while (next && next < today) next = nextDate(next, task);
  if (!next || (task.recurrenceEndDate && next > task.recurrenceEndDate))
    return null;
  const daysAway = Math.round(
    (new Date(next.getFullYear(), next.getMonth(), next.getDate()).getTime() -
      today.getTime()) /
      86400000,
  );
  return {
    userId: task.userId,
    domainId: task.domainId,
    projectId: task.projectId,
    title: task.title,
    type: task.type,
    estimatedDuration: task.estimatedDuration,
    status: "NOT_STARTED",
    priority: task.priority,
    whenBucket: daysAway <= 0 ? "TODAY" : daysAway <= 7 ? "THIS_WEEK" : "LATER",
    dueDate: task.dueDate ? next : task.followUpDate ? null : next,
    followUpDate: task.followUpDate ? next : null,
    waitingOn: task.waitingOn,
    note: task.note,
    source: task.source,
    isBlocked: false,
    pinToTodayUntilDone: task.pinToTodayUntilDone,
    recurrenceFrequency: task.recurrenceFrequency,
    recurrenceWeekdays: task.recurrenceWeekdays,
    recurrenceEndDate: task.recurrenceEndDate,
    recurrenceParentId: task.recurrenceParentId ?? task.id,
  };
}
