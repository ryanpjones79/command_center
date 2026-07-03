"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { ensureExecutionSetup } from "@/server/execution-service";

type RyanOsBlockTemplate = {
  blockType: string;
  domainSlug: string;
  estimatedDuration:
    | "UNDER_30_MIN"
    | "THIRTY_TO_SIXTY_MIN"
    | "ONE_TO_TWO_HOURS";
  minutes: number;
  note: string;
  priority: "MEDIUM" | "HIGH";
  title: string;
};

const ryanOsBlockTemplates: Record<string, RyanOsBlockTemplate> = {
  cchcs: {
    blockType: "CCHCS",
    domainSlug: "work",
    estimatedDuration: "ONE_TO_TWO_HOURS",
    minutes: 90,
    note: "RyanOS required daily block. Leadership-visible state work gets protected time.",
    priority: "HIGH",
    title: "CCHCS"
  },
  pipeline: {
    blockType: "Pipeline",
    domainSlug: "work",
    estimatedDuration: "UNDER_30_MIN",
    minutes: 30,
    note: "LinkedIn comments; warm DMs; follow-ups; post. Metric = conversations, not impressions.",
    priority: "HIGH",
    title: "Pipeline — 30 minutes"
  },
  rykas: {
    blockType: "Rykas",
    domainSlug: "rykas",
    estimatedDuration: "THIRTY_TO_SIXTY_MIN",
    minutes: 45,
    note: "Hierarchy: ship sold items; offers/relist; list from backlog; source only if backlog <10.",
    priority: "MEDIUM",
    title: "Rykas — max 45 minutes"
  }
};

function minutesForDurationBucket(value: string | null | undefined) {
  switch (value) {
    case "UNDER_30_MIN":
      return 30;
    case "THIRTY_TO_SIXTY_MIN":
      return 60;
    case "ONE_TO_TWO_HOURS":
      return 90;
    case "TWO_HOURS_PLUS":
      return 120;
    default:
      return 30;
  }
}

function addMinutes(value: Date, minutes: number) {
  return new Date(value.getTime() + minutes * 60000);
}

function whenBucketForDate(value: Date) {
  const today = new Date();
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
  const targetStart = new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate()
  );
  const daysAway = Math.round(
    (targetStart.getTime() - todayStart.getTime()) / 86400000
  );

  if (daysAway <= 0) return "TODAY";
  if (daysAway <= 7) return "THIS_WEEK";
  return "LATER";
}

function overlaps(start: Date, end: Date, busyStart: Date, busyEnd: Date) {
  return start < busyEnd && end > busyStart;
}

export async function scheduleTaskTimeBlockAction(
  taskId: string,
  startIso: string
) {
  const user = await requireUser();
  const task = await prisma.executionTask.findFirst({
    where: { id: taskId, userId: user.id },
    select: { id: true, estimatedDuration: true }
  });

  if (!task) {
    return { ok: false, error: "Task not found." };
  }

  const scheduledStart = new Date(startIso);
  if (Number.isNaN(scheduledStart.getTime())) {
    return { ok: false, error: "Invalid time block." };
  }

  const scheduledEnd = addMinutes(
    scheduledStart,
    minutesForDurationBucket(task.estimatedDuration)
  );
  const conflictingTask = await prisma.executionTask.findFirst({
    where: {
      userId: user.id,
      id: { not: task.id },
      status: { notIn: ["DONE", "DROPPED"] },
      scheduledStart: { lt: scheduledEnd },
      scheduledEnd: { gt: scheduledStart }
    },
    select: { title: true }
  });

  if (conflictingTask) {
    return {
      ok: false,
      error: `That window overlaps ${conflictingTask.title}.`
    };
  }

  await prisma.executionTask.update({
    where: { id: task.id },
    data: {
      scheduledStart,
      scheduledEnd,
      whenBucket: whenBucketForDate(scheduledStart)
    }
  });

  revalidatePath("/time-blocks");
  revalidatePath("/");
  revalidatePath("/tasks");

  return { ok: true, error: "" };
}

export async function scheduleRyanOsBlockAction(
  templateId: string,
  startIso: string
) {
  const user = await requireUser();
  const template = ryanOsBlockTemplates[templateId];

  if (!template) {
    return { ok: false, error: "RyanOS block not found." };
  }

  const scheduledStart = new Date(startIso);
  if (Number.isNaN(scheduledStart.getTime())) {
    return { ok: false, error: "Invalid time block." };
  }

  await ensureExecutionSetup(user.id);
  const domain = await prisma.executionDomain.findFirst({
    where: { userId: user.id, slug: template.domainSlug },
    select: { id: true }
  });

  if (!domain) {
    return { ok: false, error: "RyanOS domain setup is missing." };
  }

  const scheduledEnd = addMinutes(scheduledStart, template.minutes);
  const conflictingTask = await prisma.executionTask.findFirst({
    where: {
      userId: user.id,
      status: { notIn: ["DONE", "DROPPED"] },
      scheduledStart: { lt: scheduledEnd },
      scheduledEnd: { gt: scheduledStart }
    },
    select: { title: true }
  });

  if (conflictingTask) {
    return {
      ok: false,
      error: `That window overlaps ${conflictingTask.title}.`
    };
  }

  await prisma.executionTask.create({
    data: {
      userId: user.id,
      domainId: domain.id,
      title: template.title,
      type: "ACTION",
      estimatedDuration: template.estimatedDuration,
      status: "IN_PROGRESS",
      priority: template.priority,
      whenBucket: whenBucketForDate(scheduledStart),
      note: template.note,
      source: `RyanOS:${template.blockType}`,
      scheduledStart,
      scheduledEnd,
      pinToTodayUntilDone: template.blockType === "CCHCS"
    }
  });

  revalidatePath("/time-blocks");
  revalidatePath("/");
  revalidatePath("/tasks");

  return { ok: true, error: "" };
}

export async function clearTaskTimeBlockAction(taskId: string) {
  const user = await requireUser();
  const task = await prisma.executionTask.findFirst({
    where: { id: taskId, userId: user.id },
    select: { id: true }
  });

  if (!task) {
    return { ok: false, error: "Task not found." };
  }

  await prisma.executionTask.update({
    where: { id: task.id },
    data: {
      scheduledStart: null,
      scheduledEnd: null
    }
  });

  revalidatePath("/time-blocks");
  revalidatePath("/");
  revalidatePath("/tasks");

  return { ok: true, error: "" };
}
