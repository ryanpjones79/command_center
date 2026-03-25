"use server";

import {
  type ExecutionActiveStatus,
  type ExecutionTaskStatus,
  type ExecutionWhenBucket
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  detectPhi,
  executionDomainSchema,
  executionProjectSchema,
  executionTaskSchema
} from "@/lib/execution-validation";
import { requireUser } from "@/lib/session";
import { ensureExecutionSetup } from "@/server/execution-service";

function revalidateExecution() {
  revalidatePath("/");
  revalidatePath("/weekly-review");
  revalidatePath("/tasks");
  revalidatePath("/projects");
  revalidatePath("/settings");
  revalidatePath("/print/action-sheet");
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  return new Date(value);
}

function addDays(value: Date, days: number) {
  const copy = new Date(value);
  copy.setDate(copy.getDate() + days);
  return copy;
}

async function getOwnedProject(userId: string, projectId: string) {
  if (!projectId) return null;
  return prisma.executionProject.findFirst({
    where: { id: projectId, userId },
    select: { id: true, weeklyFocus: true, activeStatus: true }
  });
}

async function getOwnedTask(userId: string, taskId: string) {
  if (!taskId) return null;
  return prisma.executionTask.findFirst({
    where: { id: taskId, userId },
    select: { id: true, followUpDate: true }
  });
}

async function getOwnedTaskIds(userId: string, taskIds: string[]) {
  const uniqueIds = [...new Set(taskIds.filter(Boolean))];
  if (uniqueIds.length === 0) return [];

  const ownedTasks = await prisma.executionTask.findMany({
    where: { userId, id: { in: uniqueIds } },
    select: { id: true }
  });

  return ownedTasks.map((task) => task.id);
}

export async function seedExecutionDomainsAction() {
  const user = await requireUser();
  await ensureExecutionSetup(user.id);
  revalidateExecution();
}

export async function createExecutionDomainAction(_prevState: unknown, formData: FormData) {
  const user = await requireUser();
  const parsed = executionDomainSchema.safeParse({
    name: formData.get("name"),
    slug: String(formData.get("slug") ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, ""),
    description: formData.get("description")
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid domain" };
  }

  await prisma.executionDomain.upsert({
    where: { userId_slug: { userId: user.id, slug: parsed.data.slug } },
    update: {
      name: parsed.data.name,
      description: parsed.data.description || null
    },
    create: {
      userId: user.id,
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description || null
    }
  });

  revalidateExecution();
  return { ok: true, error: "" };
}

export async function createExecutionProjectAction(_prevState: unknown, formData: FormData) {
  const user = await requireUser();
  const parsed = executionProjectSchema.safeParse({
    domainId: formData.get("domainId"),
    name: formData.get("name"),
    status: formData.get("status"),
    activeStatus: formData.get("activeStatus"),
    weeklyFocus: formData.get("weeklyFocus"),
    priority: formData.get("priority"),
    nextAction: formData.get("nextAction"),
    waitingOn: formData.get("waitingOn"),
    blocked: formData.get("blocked") === "on",
    note: formData.get("note")
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid project" };
  }

  const phiWarnings = detectPhi(
    [parsed.data.name, parsed.data.nextAction ?? "", parsed.data.waitingOn ?? "", parsed.data.note ?? ""].join("\n")
  );
  if (phiWarnings.length > 0) {
    return { ok: false, error: `NO PHI guardrail triggered: ${phiWarnings.join("; ")}` };
  }

  await prisma.executionProject.create({
    data: {
      userId: user.id,
      domainId: parsed.data.domainId,
      name: parsed.data.name,
      status: parsed.data.status,
      activeStatus: parsed.data.activeStatus,
      weeklyFocus: parsed.data.weeklyFocus,
      priority: parsed.data.priority,
      nextAction: parsed.data.nextAction || null,
      waitingOn: parsed.data.waitingOn || null,
      blocked: parsed.data.blocked,
      note: parsed.data.note || null,
      lastReviewedAt: new Date()
    }
  });

  revalidateExecution();
  return { ok: true, error: "" };
}

export async function updateExecutionProjectAction(formData: FormData) {
  const user = await requireUser();
  const projectId = String(formData.get("projectId") ?? "");
  const project = await getOwnedProject(user.id, projectId);
  if (!project) return;

  const parsed = executionProjectSchema.safeParse({
    domainId: formData.get("domainId"),
    name: formData.get("name"),
    status: formData.get("status"),
    activeStatus: formData.get("activeStatus"),
    weeklyFocus: formData.get("weeklyFocus"),
    priority: formData.get("priority"),
    nextAction: formData.get("nextAction"),
    waitingOn: formData.get("waitingOn"),
    blocked: formData.get("blocked") === "on",
    note: formData.get("note")
  });

  if (!parsed.success) return;

  await prisma.executionProject.update({
    where: { id: project.id },
    data: {
      domainId: parsed.data.domainId,
      name: parsed.data.name,
      status: parsed.data.status,
      activeStatus: parsed.data.activeStatus,
      weeklyFocus: parsed.data.weeklyFocus,
      priority: parsed.data.priority,
      nextAction: parsed.data.nextAction || null,
      waitingOn: parsed.data.waitingOn || null,
      blocked: parsed.data.blocked,
      note: parsed.data.note || null,
      lastReviewedAt: new Date()
    }
  });

  revalidateExecution();
}

export async function deleteExecutionProjectAction(formData: FormData) {
  const user = await requireUser();
  const projectId = String(formData.get("projectId") ?? "");
  const project = await getOwnedProject(user.id, projectId);
  if (!project) return;

  await prisma.executionTask.updateMany({
    where: { projectId: project.id, userId: user.id },
    data: { projectId: null }
  });
  await prisma.executionProject.delete({ where: { id: project.id } });
  revalidateExecution();
}

export async function toggleExecutionProjectTopThreeAction(projectId: string) {
  const user = await requireUser();
  const project = await getOwnedProject(user.id, projectId);
  if (!project) return;

  await prisma.executionProject.update({
    where: { id: project.id },
    data: {
      weeklyFocus: project.weeklyFocus === "TOP_3" ? "ACTIVE" : "TOP_3",
      lastReviewedAt: new Date()
    }
  });

  revalidateExecution();
}

export async function setExecutionProjectActiveStatusAction(projectId: string, activeStatus: ExecutionActiveStatus) {
  const user = await requireUser();
  const project = await getOwnedProject(user.id, projectId);
  if (!project) return;

  await prisma.executionProject.update({
    where: { id: project.id },
    data: {
      activeStatus,
      weeklyFocus:
        activeStatus === "ACTIVE_NOW"
          ? project.weeklyFocus
          : project.weeklyFocus === "TOP_3"
            ? "ACTIVE"
            : project.weeklyFocus,
      status: activeStatus === "COMPLETED" ? "COMPLETED" : undefined,
      lastReviewedAt: new Date()
    }
  });

  revalidateExecution();
}

export async function markExecutionProjectReviewedAction(projectId: string) {
  const user = await requireUser();
  const project = await getOwnedProject(user.id, projectId);
  if (!project) return;

  await prisma.executionProject.update({
    where: { id: project.id },
    data: { lastReviewedAt: new Date() }
  });

  revalidateExecution();
}

export async function createExecutionTaskAction(_prevState: unknown, formData: FormData) {
  const user = await requireUser();
  const parsed = executionTaskSchema.safeParse({
    domainId: formData.get("domainId"),
    projectId: formData.get("projectId") || undefined,
    title: formData.get("title"),
    type: formData.get("type"),
    estimatedDuration: formData.get("estimatedDuration") || undefined,
    status: formData.get("status"),
    priority: formData.get("priority"),
    whenBucket: formData.get("whenBucket"),
    dueDate: formData.get("dueDate"),
    followUpDate: formData.get("followUpDate"),
    waitingOn: formData.get("waitingOn"),
    note: formData.get("note"),
    source: formData.get("source"),
    isBlocked: formData.get("isBlocked") === "on",
    pinToTodayUntilDone: formData.get("pinToTodayUntilDone") === "on"
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid task" };
  }

  const phiWarnings = detectPhi(
    [parsed.data.title, parsed.data.waitingOn ?? "", parsed.data.note ?? "", parsed.data.source ?? ""].join("\n")
  );
  if (phiWarnings.length > 0) {
    return { ok: false, error: `NO PHI guardrail triggered: ${phiWarnings.join("; ")}` };
  }

  await prisma.executionTask.create({
    data: {
      userId: user.id,
      domainId: parsed.data.domainId,
      projectId: parsed.data.projectId || null,
      title: parsed.data.title,
      type: parsed.data.type,
      estimatedDuration: parsed.data.estimatedDuration ?? null,
      status: parsed.data.status,
      priority: parsed.data.priority,
      whenBucket: parsed.data.whenBucket,
      dueDate: parseDate(parsed.data.dueDate),
      followUpDate: parseDate(parsed.data.followUpDate),
      waitingOn: parsed.data.waitingOn || null,
      note: parsed.data.note || null,
      source: parsed.data.source || null,
      isBlocked: parsed.data.isBlocked,
      pinToTodayUntilDone: parsed.data.pinToTodayUntilDone,
      completedAt: parsed.data.status === "DONE" ? new Date() : null
    }
  });

  revalidateExecution();
  return { ok: true, error: "" };
}

export async function updateExecutionTaskAction(formData: FormData) {
  const user = await requireUser();
  const taskId = String(formData.get("taskId") ?? "");
  const task = await getOwnedTask(user.id, taskId);
  if (!task) return;

  const parsed = executionTaskSchema.safeParse({
    domainId: formData.get("domainId"),
    projectId: formData.get("projectId") || undefined,
    title: formData.get("title"),
    type: formData.get("type"),
    estimatedDuration: formData.get("estimatedDuration") || undefined,
    status: formData.get("status"),
    priority: formData.get("priority"),
    whenBucket: formData.get("whenBucket"),
    dueDate: formData.get("dueDate"),
    followUpDate: formData.get("followUpDate"),
    waitingOn: formData.get("waitingOn"),
    note: formData.get("note"),
    source: formData.get("source"),
    isBlocked: formData.get("isBlocked") === "on",
    pinToTodayUntilDone: formData.get("pinToTodayUntilDone") === "on"
  });

  if (!parsed.success) return;

  await prisma.executionTask.update({
    where: { id: task.id },
    data: {
      domainId: parsed.data.domainId,
      projectId: parsed.data.projectId || null,
      title: parsed.data.title,
      type: parsed.data.type,
      estimatedDuration: parsed.data.estimatedDuration ?? null,
      status: parsed.data.status,
      priority: parsed.data.priority,
      whenBucket: parsed.data.whenBucket,
      dueDate: parseDate(parsed.data.dueDate),
      followUpDate: parseDate(parsed.data.followUpDate),
      waitingOn: parsed.data.waitingOn || null,
      note: parsed.data.note || null,
      source: parsed.data.source || null,
      isBlocked: parsed.data.isBlocked,
      pinToTodayUntilDone: parsed.data.pinToTodayUntilDone,
      completedAt: parsed.data.status === "DONE" ? new Date() : null
    }
  });

  revalidateExecution();
}

export async function deleteExecutionTaskAction(formData: FormData) {
  const user = await requireUser();
  const taskId = String(formData.get("taskId") ?? "");
  const task = await getOwnedTask(user.id, taskId);
  if (!task) return;

  await prisma.executionTask.delete({ where: { id: task.id } });
  revalidateExecution();
}

export async function markExecutionTaskStatusAction(
  taskId: string,
  status: ExecutionTaskStatus,
  whenBucket?: ExecutionWhenBucket
) {
  const user = await requireUser();
  const task = await getOwnedTask(user.id, taskId);
  if (!task) return;

  await prisma.executionTask.update({
    where: { id: task.id },
    data: {
      status,
      whenBucket,
      completedAt: status === "DONE" ? new Date() : null
    }
  });

  revalidateExecution();
}

export async function nudgeExecutionTaskFollowUpAction(taskId: string, days: number) {
  const user = await requireUser();
  const task = await getOwnedTask(user.id, taskId);
  if (!task) return;

  const baseDate = task.followUpDate ?? new Date();
  await prisma.executionTask.update({
    where: { id: task.id },
    data: {
      status: "WAITING",
      whenBucket: "WAITING",
      followUpDate: addDays(baseDate, days)
    }
  });

  revalidateExecution();
}

export async function bulkUpdateExecutionTasksAction(formData: FormData) {
  const user = await requireUser();
  const taskIds = formData.getAll("taskIds").map((value) => String(value));
  const bulkAction = String(formData.get("bulkAction") ?? "");
  const targetProjectId = String(formData.get("targetProjectId") ?? "");
  const ownedTaskIds = await getOwnedTaskIds(user.id, taskIds);

  if (ownedTaskIds.length === 0 || !bulkAction) return;

  if (bulkAction === "ASSIGN_PROJECT") {
    if (targetProjectId) {
      const project = await getOwnedProject(user.id, targetProjectId);
      if (!project) return;
    }

    await prisma.executionTask.updateMany({
      where: { userId: user.id, id: { in: ownedTaskIds } },
      data: { projectId: targetProjectId || null }
    });
    revalidateExecution();
    return;
  }

  if (bulkAction === "PIN_TODAY" || bulkAction === "UNPIN_TODAY") {
    await prisma.executionTask.updateMany({
      where: { userId: user.id, id: { in: ownedTaskIds } },
      data: { pinToTodayUntilDone: bulkAction === "PIN_TODAY" }
    });
    revalidateExecution();
    return;
  }

  if (bulkAction === "FOLLOW_UP_2" || bulkAction === "FOLLOW_UP_7") {
    const days = bulkAction === "FOLLOW_UP_2" ? 2 : 7;
    const tasks = await prisma.executionTask.findMany({
      where: { userId: user.id, id: { in: ownedTaskIds } },
      select: { id: true, followUpDate: true }
    });

    await Promise.all(
      tasks.map((task) =>
        prisma.executionTask.update({
          where: { id: task.id },
          data: {
            status: "WAITING",
            whenBucket: "WAITING",
            followUpDate: addDays(task.followUpDate ?? new Date(), days)
          }
        })
      )
    );

    revalidateExecution();
    return;
  }

  const updates: {
    status?: ExecutionTaskStatus;
    whenBucket?: ExecutionWhenBucket;
    completedAt?: Date | null;
  } = {};

  if (bulkAction === "MOVE_TODAY") updates.whenBucket = "TODAY";
  if (bulkAction === "MOVE_THIS_WEEK") updates.whenBucket = "THIS_WEEK";
  if (bulkAction === "MOVE_LATER") updates.whenBucket = "LATER";
  if (bulkAction === "MOVE_PARKING_LOT") updates.whenBucket = "PARKING_LOT";
  if (bulkAction === "MOVE_WAITING") {
    updates.whenBucket = "WAITING";
    updates.status = "WAITING";
  }
  if (bulkAction === "STATUS_NOT_STARTED") {
    updates.status = "NOT_STARTED";
    updates.completedAt = null;
  }
  if (bulkAction === "STATUS_IN_PROGRESS") {
    updates.status = "IN_PROGRESS";
    updates.completedAt = null;
  }
  if (bulkAction === "STATUS_WAITING") {
    updates.status = "WAITING";
    updates.whenBucket = "WAITING";
    updates.completedAt = null;
  }
  if (bulkAction === "STATUS_DONE") {
    updates.status = "DONE";
    updates.completedAt = new Date();
  }

  if (Object.keys(updates).length === 0) return;

  await prisma.executionTask.updateMany({
    where: { userId: user.id, id: { in: ownedTaskIds } },
    data: updates
  });

  revalidateExecution();
}

export async function quickCaptureExecutionTaskAction(_prevState: unknown, formData: FormData) {
  const user = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  const domainId = String(formData.get("domainId") ?? "").trim();

  if (!title || !domainId) {
    return { ok: false, error: "Title and domain are required." };
  }

  const phiWarnings = detectPhi(title);
  if (phiWarnings.length > 0) {
    return { ok: false, error: `NO PHI guardrail triggered: ${phiWarnings.join("; ")}` };
  }

  await prisma.executionTask.create({
    data: {
      userId: user.id,
      domainId,
      title,
      type: "ACTION",
      status: "NOT_STARTED",
      priority: "MEDIUM",
      whenBucket: "TODAY"
    }
  });

  revalidateExecution();
  return { ok: true, error: "" };
}
