"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import {
  type StaleDecision,
  getOrCreateWeeklyReset,
  staleDecisionOptions,
  updateWeeklyResetOutcomes
} from "@/server/review-service";

function revalidateWeeklyReset() {
  revalidatePath("/review");
  revalidatePath("/review/weekly-reset");
  revalidatePath("/weekly-review");
  revalidatePath("/projects");
  revalidatePath("/tasks");
}

function safeStep(value: string) {
  return `/weekly-review?step=${encodeURIComponent(value)}`;
}

function parsePeople(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeDecision(value: string): StaleDecision {
  const decision = staleDecisionOptions.find((option) => option === value);
  return decision ?? "Return to Project";
}

export async function beginWeeklyResetAction() {
  const user = await requireUser();
  await getOrCreateWeeklyReset(user.id);
  revalidateWeeklyReset();
  redirect(safeStep("paper"));
}

export async function beginPaperReflectionAction() {
  const user = await requireUser();
  const reset = await getOrCreateWeeklyReset(user.id);

  await prisma.weeklyReset.update({
    where: { id: reset.id },
    data: { paperReflectionStartedAt: reset.paperReflectionStartedAt ?? new Date() }
  });

  revalidateWeeklyReset();
  redirect(safeStep("paper"));
}

export async function completePaperReflectionAction() {
  const user = await requireUser();
  const reset = await getOrCreateWeeklyReset(user.id);
  const now = new Date();

  await prisma.weeklyReset.update({
    where: { id: reset.id },
    data: {
      paperReflectionStartedAt: reset.paperReflectionStartedAt ?? now,
      paperReflectionCompletedAt: now
    }
  });

  revalidateWeeklyReset();
  redirect(safeStep("notebook"));
}

export async function skipPaperReflectionAction() {
  const user = await requireUser();
  await getOrCreateWeeklyReset(user.id);
  revalidateWeeklyReset();
  redirect(safeStep("notebook"));
}

export async function markNotebookProcessedAction() {
  const user = await requireUser();
  const reset = await getOrCreateWeeklyReset(user.id);

  await prisma.weeklyReset.update({
    where: { id: reset.id },
    data: { notebookProcessedAt: new Date() }
  });

  revalidateWeeklyReset();
  redirect(safeStep("project-control"));
}

export async function saveNextWeekAction(formData: FormData) {
  const user = await requireUser();
  const reset = await getOrCreateWeeklyReset(user.id);
  const presetTheme = String(formData.get("theme") ?? "").trim();
  const customTheme = String(formData.get("customTheme") ?? "").trim();
  const weekTheme = customTheme || presetTheme || null;
  const selectedTopThreeIds = formData
    .getAll("topThreeProjectIds")
    .map(String)
    .filter(Boolean)
    .slice(0, 3);

  const ownedProjects = await prisma.executionProject.findMany({
    where: { userId: user.id },
    select: { id: true, weeklyFocus: true }
  });
  const ownedIds = new Set(ownedProjects.map((project) => project.id));
  const topThreeProjectIds = selectedTopThreeIds.filter((id) => ownedIds.has(id));

  await prisma.$transaction([
    prisma.executionProject.updateMany({
      where: { userId: user.id, id: { in: topThreeProjectIds } },
      data: { weeklyFocus: "TOP_3", lastReviewedAt: new Date() }
    }),
    prisma.executionProject.updateMany({
      where: {
        userId: user.id,
        weeklyFocus: "TOP_3",
        id: { notIn: topThreeProjectIds }
      },
      data: { weeklyFocus: "ACTIVE", lastReviewedAt: new Date() }
    }),
    prisma.weeklyReset.update({
      where: { id: reset.id },
      data: { weekTheme }
    })
  ]);

  await updateWeeklyResetOutcomes(user.id, { topThreeProjectIds });
  revalidateWeeklyReset();
  redirect(safeStep("people"));
}

export async function savePeopleIntentionsAction(formData: FormData) {
  const user = await requireUser();
  await getOrCreateWeeklyReset(user.id);
  await updateWeeklyResetOutcomes(user.id, {
    peopleIntentions: parsePeople(formData.get("peopleIntentions"))
  });
  revalidateWeeklyReset();
  redirect(safeStep("printable"));
}

export async function markWeeklyGuideGeneratedAction() {
  const user = await requireUser();
  const reset = await getOrCreateWeeklyReset(user.id);

  await prisma.weeklyReset.update({
    where: { id: reset.id },
    data: { guideGeneratedAt: new Date() }
  });

  revalidateWeeklyReset();
  redirect(safeStep("complete"));
}

export async function completeWeeklyResetAction() {
  const user = await requireUser();
  const reset = await getOrCreateWeeklyReset(user.id);

  await prisma.weeklyReset.update({
    where: { id: reset.id },
    data: {
      guideGeneratedAt: reset.guideGeneratedAt ?? new Date(),
      completedAt: new Date()
    }
  });

  revalidateWeeklyReset();
  redirect(safeStep("complete"));
}

export async function applyStaleProjectDecisionAction(projectId: string, rawDecision: string) {
  const user = await requireUser();
  const decision = normalizeDecision(rawDecision);
  const project = await prisma.executionProject.findFirst({
    where: { id: projectId, userId: user.id },
    select: { id: true }
  });
  if (!project) return;

  const data =
    decision === "Do"
      ? { activeStatus: "ACTIVE_NOW" as const, lastReviewedAt: new Date() }
      : decision === "Reschedule"
        ? { activeStatus: "ACTIVE_LATER" as const, lastReviewedAt: new Date() }
        : decision === "Park"
          ? { activeStatus: "PARKED" as const, weeklyFocus: "ACTIVE" as const, lastReviewedAt: new Date() }
          : decision === "Release"
            ? {
                activeStatus: "COMPLETED" as const,
                status: "COMPLETED" as const,
                weeklyFocus: "ACTIVE" as const,
                lastReviewedAt: new Date()
              }
            : { lastReviewedAt: new Date() };

  await prisma.executionProject.update({ where: { id: project.id }, data });
  await updateWeeklyResetOutcomes(user.id, {
    staleDecisions: { [`project:${project.id}`]: decision }
  });
  revalidateWeeklyReset();
}

export async function applyStaleTaskDecisionAction(taskId: string, rawDecision: string) {
  const user = await requireUser();
  const decision = normalizeDecision(rawDecision);
  const task = await prisma.executionTask.findFirst({
    where: { id: taskId, userId: user.id },
    select: { id: true }
  });
  if (!task) return;

  const data =
    decision === "Do"
      ? { status: "IN_PROGRESS" as const, whenBucket: "TODAY" as const }
      : decision === "Reschedule"
        ? { whenBucket: "THIS_WEEK" as const }
        : decision === "Park"
          ? { whenBucket: "PARKING_LOT" as const }
          : decision === "Release"
            ? { status: "DROPPED" as const, completedAt: new Date() }
            : { whenBucket: "LATER" as const };

  await prisma.executionTask.update({ where: { id: task.id }, data });
  await updateWeeklyResetOutcomes(user.id, {
    staleDecisions: { [`task:${task.id}`]: decision }
  });
  revalidateWeeklyReset();
}
