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
  },
  walking: {
    blockType: "Personal",
    domainSlug: "health",
    estimatedDuration: "THIRTY_TO_SIXTY_MIN",
    minutes: 60,
    note: "Often anchor. Walk if there is a clean opening; skip without guilt if the day is full.",
    priority: "MEDIUM",
    title: "Walking"
  },
  workout: {
    blockType: "Personal",
    domainSlug: "health",
    estimatedDuration: "THIRTY_TO_SIXTY_MIN",
    minutes: 60,
    note: "Often anchor. Training matters, but it should fit the real day.",
    priority: "MEDIUM",
    title: "Workout"
  },
  "golf-practice": {
    blockType: "Personal",
    domainSlug: "golf",
    estimatedDuration: "THIRTY_TO_SIXTY_MIN",
    minutes: 60,
    note: "Often anchor. Keep touch without letting practice become fake urgency.",
    priority: "MEDIUM",
    title: "Golf Practice"
  }
};

const decisionRules = [
  "CCHCS deadline / leadership-visible commitment within 48h",
  "SignalCare conversation available",
  "Anything 80% done and ready to ship",
  "Otherwise pipeline block"
];

type RyanOsLocalStatePayload = {
  decisionRule?: unknown;
  needleMove?: unknown;
  rykasBacklog?: unknown;
  shutdownTomorrow?: unknown;
};

function dateOnlyFromKey(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const parsed = new Date(`${dateKey}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function ruleStepFromDecisionRule(value: unknown) {
  if (typeof value !== "string") return null;
  const index = decisionRules.indexOf(value);
  return index >= 0 ? index + 1 : null;
}

function parseBacklog(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseInt(typeof value === "string" ? value : "", 10);
  if (Number.isNaN(parsed)) return 0;
  return Math.max(0, parsed);
}

function revalidateTimeBlockSurfaces() {
  revalidatePath("/time-blocks");
  revalidatePath("/");
  revalidatePath("/tasks");
}

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

  revalidateTimeBlockSurfaces();

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
      blockType: template.blockType.toLowerCase(),
      scheduledStart,
      scheduledEnd,
      pinToTodayUntilDone: template.blockType === "CCHCS"
    }
  });

  revalidateTimeBlockSurfaces();

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

  revalidateTimeBlockSurfaces();

  return { ok: true, error: "" };
}

export async function importRyanOsLocalStateAction(
  dateKey: string,
  payload: RyanOsLocalStatePayload
) {
  const user = await requireUser();
  const date = dateOnlyFromKey(dateKey);

  if (!date) {
    return { ok: false, error: "Invalid RyanOS date." };
  }

  const needleMove = stringValue(payload.needleMove);
  const shutdownNote = stringValue(payload.shutdownTomorrow);
  const ruleStep = ruleStepFromDecisionRule(payload.decisionRule);
  const backlogAfter = parseBacklog(payload.rykasBacklog);

  await prisma.$transaction([
    prisma.dailyPlan.upsert({
      where: { userId_date: { userId: user.id, date } },
      update: {
        ...(needleMove ? { needleMove } : {}),
        ...(ruleStep ? { ruleStep } : {}),
        ...(shutdownNote ? { shutdownNote } : {})
      },
      create: {
        userId: user.id,
        date,
        needleMove: needleMove || null,
        ruleStep,
        shutdownNote: shutdownNote || null
      }
    }),
    prisma.rykasDay.upsert({
      where: { userId_date: { userId: user.id, date } },
      update: { backlogAfter },
      create: { userId: user.id, date, backlogAfter }
    })
  ]);

  revalidateTimeBlockSurfaces();

  return { ok: true, error: "" };
}

export async function saveDailyPlanAction(
  dateKey: string,
  input: { needleMove?: string; ruleStep?: number | null; shutdownNote?: string }
) {
  const user = await requireUser();
  const date = dateOnlyFromKey(dateKey);

  if (!date) {
    return { ok: false, error: "Invalid RyanOS date." };
  }

  const ruleStep =
    typeof input.ruleStep === "number" && input.ruleStep >= 1 && input.ruleStep <= 4
      ? input.ruleStep
      : null;

  await prisma.dailyPlan.upsert({
    where: { userId_date: { userId: user.id, date } },
    update: {
      needleMove: stringValue(input.needleMove) || null,
      ruleStep,
      shutdownNote: stringValue(input.shutdownNote) || null
    },
    create: {
      userId: user.id,
      date,
      needleMove: stringValue(input.needleMove) || null,
      ruleStep,
      shutdownNote: stringValue(input.shutdownNote) || null
    }
  });

  revalidateTimeBlockSurfaces();

  return { ok: true, error: "" };
}

export async function saveRykasBacklogAction(
  dateKey: string,
  backlogAfter: number
) {
  const user = await requireUser();
  const date = dateOnlyFromKey(dateKey);

  if (!date) {
    return { ok: false, error: "Invalid RyanOS date." };
  }

  await prisma.rykasDay.upsert({
    where: { userId_date: { userId: user.id, date } },
    update: { backlogAfter: Math.max(0, backlogAfter) },
    create: {
      userId: user.id,
      date,
      backlogAfter: Math.max(0, backlogAfter)
    }
  });

  revalidateTimeBlockSurfaces();

  return { ok: true, error: "" };
}
