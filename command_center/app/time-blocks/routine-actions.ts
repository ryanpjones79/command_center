"use server";

import { revalidatePath } from "next/cache";
import { detectPhi } from "@/lib/execution-validation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { materializeRoutines, parseWeekdays, ROUTINE_AREAS, type RoutineArea } from "@/server/v2/routines";

function refresh() {
  for (const path of ["/time-blocks/routines", "/time-blocks", "/now"]) revalidatePath(path);
}

function minutesFromTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

export async function createRoutineAction(formData: FormData) {
  const user = await requireUser();
  const title = String(formData.get("title") ?? "").trim().slice(0, 120);
  if (!title) return { ok: false, message: "Name it." };
  if (detectPhi(title).length > 0) return { ok: false, message: "Not saved: looks like patient information (NO PHI)." };
  const area = String(formData.get("area") ?? "KIDS") as RoutineArea;
  if (!(area in ROUTINE_AREAS)) return { ok: false, message: "Pick an area." };
  const days = parseWeekdays(formData.getAll("days").map(String).join(","));
  if (days.length === 0) return { ok: false, message: "Pick at least one day." };
  const time = String(formData.get("time") ?? "");
  const startMin = time ? minutesFromTime(time) : null;
  if (time && startMin === null) return { ok: false, message: "Use a time like 15:15." };
  const durationMin = Math.max(5, Math.min(480, Math.round(Number(formData.get("duration")) || 30)));
  await prisma.protectedRoutine.create({
    data: { userId: user.id, title, domainSlug: ROUTINE_AREAS[area], weekdays: days.join(","), startMin, durationMin }
  });
  await materializeRoutines(user.id, prisma);
  refresh();
  return { ok: true, message: "Added. It will be placed automatically on those days." };
}

export async function setRoutineActiveAction(routineId: string, active: boolean) {
  const user = await requireUser();
  const result = await prisma.protectedRoutine.updateMany({ where: { id: routineId, userId: user.id }, data: { active } });
  refresh();
  return { ok: result.count > 0, message: result.count ? (active ? "Resumed." : "Paused. Today's existing block stays until you move it.") : "Not found." };
}
