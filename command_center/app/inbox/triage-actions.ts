"use server";

import { revalidatePath } from "next/cache";
import { OWNER_ACTION_AREAS, type OwnerActionArea } from "@/lib/owner-actions";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { googleCalendarLoader } from "@/server/v2/day";
import { scheduleAction } from "@/server/v2/schedule-service";
import { TRIAGE_DECISIONS, triageItem, type TriageDecision } from "@/server/v2/triage";

export async function triageAction(taskId: string, raw: Record<string, string | null>) {
  const user = await requireUser();
  const decision = String(raw.decision ?? "") as TriageDecision;
  if (!TRIAGE_DECISIONS.includes(decision)) return { ok: false, message: "Pick a decision." };
  const area = OWNER_ACTION_AREAS.includes(raw.area as OwnerActionArea) ? (raw.area as OwnerActionArea) : null;
  const result = await triageItem(user.id, taskId, { decision, area, title: raw.title, dueDate: raw.dueDate, eventDate: raw.eventDate, waitingOn: raw.waitingOn, followUpDate: raw.followUpDate }, prisma);
  if (!result.ok) return { ok: false, message: result.error };
  let message = "Sorted.";
  if (decision === "TODAY") {
    const booked = await scheduleAction(user.id, taskId, prisma, googleCalendarLoader());
    message = booked.type === "BOOKED" ? "Scheduled for today." : "Added to today's queue; no feasible slot right now.";
  }
  for (const path of ["/inbox", "/now", "/time-blocks", "/projects"]) revalidatePath(path);
  return { ok: true, message };
}
