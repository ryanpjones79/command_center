"use server";

import { revalidatePath } from "next/cache";
import { detectPhi } from "@/lib/execution-validation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { periodRange } from "@/lib/v2/zoned-time";
import { loadDaySettings } from "@/server/v2/schedule-service";

// Personal (RYANOS-owned) goals only. Source-owned goals are edited in their
// source app; nothing here changes an external rule or target.

const KINDS = new Set(["OUTCOME", "ACTION", "CONSTRAINT"]);
const PERIODS = new Set(["WEEK", "MONTH", "QUARTER"]);

export async function createPersonalGoalAction(formData: FormData) {
  const user = await requireUser();
  const text = (key: string, max: number) => String(formData.get(key) ?? "").trim().slice(0, max);
  const title = text("title", 120);
  if (!title) return { ok: false, message: "Name the goal." };
  const fields = [title, text("desiredOutcome", 300), text("metricName", 120), text("metricDefinition", 300)];
  if (fields.some((value) => value && detectPhi(value).length > 0)) return { ok: false, message: "Not saved: looks like patient information (NO PHI)." };
  const targetRaw = text("target", 20);
  const target = targetRaw ? Number(targetRaw) : null;
  if (targetRaw && !Number.isFinite(target)) return { ok: false, message: "Target must be a number, or leave it empty." };
  const projectId = text("projectId", 40) || null;
  if (projectId && !(await prisma.executionProject.findFirst({ where: { id: projectId, userId: user.id }, select: { id: true } }))) {
    return { ok: false, message: "Project not found." };
  }
  await prisma.goal.create({
    data: {
      userId: user.id,
      owner: "RYANOS",
      title,
      projectId,
      desiredOutcome: fields[1] || null,
      measureKind: KINDS.has(text("measureKind", 20)) ? text("measureKind", 20) : "OUTCOME",
      metricName: fields[2] || null,
      metricDefinition: fields[3] || null,
      unit: text("unit", 30) || null,
      target,
      period: PERIODS.has(text("period", 10)) ? text("period", 10) : "WEEK"
    }
  });
  revalidatePath("/projects/progress");
  return { ok: true, message: "Goal added." };
}

// Owner confirmation for the CURRENT period of a personal goal.
export async function confirmGoalResultAction(goalId: string, value: number) {
  const user = await requireUser();
  const goal = await prisma.goal.findFirst({ where: { id: goalId, userId: user.id }, select: { id: true, owner: true, period: true } });
  if (!goal) return { ok: false, message: "Goal not found." };
  if (goal.owner !== "RYANOS") return { ok: false, message: "This goal is owned by its source app; report results there." };
  if (!Number.isFinite(value)) return { ok: false, message: "Enter a number." };
  const settings = await loadDaySettings(user.id, prisma);
  const range = periodRange(goal.period, new Date(), settings.timeZone);
  if (!range) return { ok: false, message: "This goal has no reporting period." };
  await prisma.goalResult.upsert({
    where: { goalId_periodStart_evidence: { goalId: goal.id, periodStart: range.start, evidence: "OWNER_CONFIRMED" } },
    update: { value, observedAt: new Date() },
    create: { userId: user.id, goalId: goal.id, periodStart: range.start, periodEnd: range.end, value, evidence: "OWNER_CONFIRMED", observedAt: new Date() }
  });
  revalidatePath("/projects/progress");
  return { ok: true, message: "Confirmed for this period." };
}

export async function archiveGoalAction(goalId: string) {
  const user = await requireUser();
  const result = await prisma.goal.updateMany({ where: { id: goalId, userId: user.id, owner: "RYANOS" }, data: { active: false } });
  revalidatePath("/projects/progress");
  return { ok: result.count > 0, message: result.count ? "Archived." : "Only personal goals can be archived here." };
}
