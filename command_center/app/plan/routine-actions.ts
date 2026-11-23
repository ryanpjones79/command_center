"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { addSuggestedRoutines, createHabit, SUGGESTED_ROUTINES, updateRoutine, type RoutineInput } from "@/server/v2/habits";

export type RoutineMessage = { ok: boolean; message: string };

function refresh() {
  for (const path of ["/plan", "/plan/routines", "/plan/wrap-up", "/now", "/projects", "/time-blocks/routines"]) revalidatePath(path);
}

function clean(input: RoutineInput): RoutineInput {
  return {
    title: String(input?.title ?? ""),
    weekdays: Array.isArray(input?.weekdays) ? input.weekdays.map(Number) : [],
    minutes: Number(input?.minutes) || 30,
    area: String(input?.area ?? ""),
    timesPerWeek: input?.timesPerWeek == null ? null : Number(input.timesPerWeek),
    timeOfDay: typeof input?.timeOfDay === "string" ? input.timeOfDay : null,
    startMin: input?.startMin == null ? null : Number(input.startMin)
  };
}

export async function saveRoutineAction(routineId: string | null, input: RoutineInput): Promise<RoutineMessage> {
  const user = await requireUser();
  const result = routineId ? await updateRoutine(user.id, String(routineId), clean(input), prisma) : await createHabit(user.id, clean(input), prisma);
  if (!result.ok) return { ok: false, message: result.error };
  refresh();
  return { ok: true, message: routineId ? "Saved. Changes apply from the next day." : "Added. Plan my day will fit it into free time." };
}

export async function setRoutineActiveAction(routineId: string, active: boolean): Promise<RoutineMessage> {
  const user = await requireUser();
  const result = await prisma.protectedRoutine.updateMany({ where: { id: String(routineId), userId: user.id }, data: { active: Boolean(active) } });
  refresh();
  return { ok: result.count > 0, message: result.count ? (active ? "Resumed." : "Paused. It won't be planned until you resume it.") : "Routine not found." };
}

export async function addSuggestedRoutinesAction(keys: string[]): Promise<RoutineMessage> {
  const user = await requireUser();
  const allowed = new Set(SUGGESTED_ROUTINES.map((item) => item.key));
  const picked = (Array.isArray(keys) ? keys : []).map(String).filter((key) => allowed.has(key));
  if (picked.length === 0) return { ok: false, message: "Pick at least one." };
  const result = await addSuggestedRoutines(user.id, picked, prisma);
  refresh();
  const skipped = result.skipped.length ? ` Already had: ${result.skipped.join(", ")}.` : "";
  return { ok: result.added.length > 0, message: result.added.length ? `Added ${result.added.join(", ")}.${skipped}` : `Nothing new to add.${skipped}` };
}

// A project that is really regular work: make a weekday routine from it and set the project to Monitoring,
// so it stops asking for a next task. Nothing is deleted; the project and its tasks stay.
export async function makeRoutineFromProjectAction(projectId: string): Promise<RoutineMessage> {
  const user = await requireUser();
  const project = await prisma.executionProject.findFirst({ where: { id: String(projectId), userId: user.id }, select: { id: true, name: true, domain: { select: { slug: true } } } });
  if (!project) return { ok: false, message: "Project not found." };
  const result = await createHabit(user.id, { title: project.name, area: project.domain.slug, weekdays: [1, 2, 3, 4, 5], minutes: 60 }, prisma);
  if (!result.ok && !result.error.startsWith("You already have")) return { ok: false, message: result.error };
  await prisma.executionProject.update({ where: { id: project.id }, data: { monitoring: true, activeStatus: "ACTIVE_NOW", closedAt: null } });
  refresh();
  return { ok: true, message: `"${project.name}" is now a routine (1h on weekdays). Change it on Routines.` };
}
