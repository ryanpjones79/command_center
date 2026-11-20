"use server";

import { revalidatePath } from "next/cache";
import { detectPhi } from "@/lib/execution-validation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { setAttention } from "@/server/v2/weekly";

function refresh() {
  for (const path of ["/projects", "/projects/progress", "/now", "/time-blocks"]) revalidatePath(path);
}

export async function setAttentionAction(projectId: string, hours: number) {
  const user = await requireUser();
  const result = await setAttention(user.id, projectId, Math.round((Number(hours) || 0) * 60), prisma);
  refresh();
  return { ok: result.ok, message: result.ok ? "Saved." : "Project not found." };
}

// The next concrete step for a project (a plain task in that project).
export async function addNextStepAction(projectId: string, title: string, minutes: number) {
  const user = await requireUser();
  const clean = String(title ?? "").trim().slice(0, 200);
  if (!clean) return { ok: false, message: "Describe the next step." };
  if (detectPhi(clean).length > 0) return { ok: false, message: "Not saved: looks like patient information (NO PHI)." };
  const project = await prisma.executionProject.findFirst({ where: { id: projectId, userId: user.id }, select: { id: true, domainId: true } });
  if (!project) return { ok: false, message: "Project not found." };
  await prisma.executionTask.create({
    data: {
      userId: user.id,
      domainId: project.domainId,
      projectId: project.id,
      title: clean,
      type: "ACTION",
      whenBucket: "THIS_WEEK",
      remainingMinutes: Math.max(15, Math.min(240, Math.round(Number(minutes) || 30))),
      source: "RyanOS"
    }
  });
  refresh();
  return { ok: true, message: "Next step added. Give it time from the project or Today." };
}

export async function setProjectStateAction(projectId: string, state: "ACTIVE" | "MONITORING" | "PAUSED" | "CLOSED") {
  const user = await requireUser();
  const project = await prisma.executionProject.findFirst({ where: { id: projectId, userId: user.id }, select: { id: true } });
  if (!project) return { ok: false, message: "Project not found." };
  const data =
    state === "MONITORING"
      ? { monitoring: true, activeStatus: "ACTIVE_NOW" as const, closedAt: null }
      : state === "PAUSED"
        ? { monitoring: false, activeStatus: "PARKED" as const }
        : state === "CLOSED"
          ? { closedAt: new Date(), activeStatus: "COMPLETED" as const }
          : { monitoring: false, activeStatus: "ACTIVE_NOW" as const, closedAt: null };
  await prisma.executionProject.update({ where: { id: project.id }, data });
  refresh();
  return { ok: true, message: state === "CLOSED" ? "Closed. Open items stay visible until handled." : "Updated." };
}

export async function setDesiredOutcomeAction(projectId: string, outcome: string) {
  const user = await requireUser();
  const clean = String(outcome ?? "").trim().slice(0, 300);
  if (clean && detectPhi(clean).length > 0) return { ok: false, message: "Not saved: looks like patient information (NO PHI)." };
  const result = await prisma.executionProject.updateMany({ where: { id: projectId, userId: user.id }, data: { desiredOutcome: clean || null } });
  refresh();
  return { ok: result.count > 0, message: result.count ? "Saved." : "Project not found." };
}
