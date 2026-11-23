"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { v2DoneAction } from "@/app/now/v2-actions";
import { syncCalendar } from "@/server/v2/calendar-sync";
import { googleCalendarLoader } from "@/server/v2/day";
import { acceptPlan, proposeDay } from "@/server/v2/plan";
import { quickAdd, setBlock, setWaitingOn } from "@/server/v2/plan-board";

export type PlanMessage = { ok: boolean; message: string };

function refresh() {
  for (const path of ["/plan", "/now", "/time-blocks", "/projects", "/inbox", "/tasks"]) revalidatePath(path);
}

// Push the change to Google Calendar right away; a Google problem never undoes the change in RyanOS.
async function sync(userId: string) {
  const result = await syncCalendar(userId, prisma).catch(() => null);
  return result && result.enabled && !result.ok ? ` Google Calendar didn't update: ${result.error}` : "";
}

const parseDate = (value: string | null) => (value ? new Date(value) : null);

export async function moveBlockAction(taskId: string, start: string | null, end: string | null): Promise<PlanMessage> {
  const user = await requireUser();
  const result = await setBlock(user.id, String(taskId), parseDate(start), parseDate(end), prisma, googleCalendarLoader());
  if (!result.ok) return { ok: false, message: result.error };
  const note = await sync(user.id);
  refresh();
  if (!result.start) return { ok: true, message: "Back on the list." + note };
  const overlap = result.overlaps.length ? ` Heads up: it overlaps ${result.overlaps.slice(0, 3).join(", ")}${result.overlaps.length > 3 ? "…" : ""}.` : "";
  return { ok: true, message: "Scheduled." + overlap + note };
}

export async function quickAddAction(text: string, projectId: string | null): Promise<PlanMessage> {
  const user = await requireUser();
  const result = await quickAdd(user.id, String(text ?? ""), projectId ? String(projectId) : null, prisma);
  if (!result.ok) return { ok: false, message: result.error };
  const note = await sync(user.id);
  refresh();
  return { ok: true, message: result.message + note };
}

export async function planDoneAction(taskId: string): Promise<PlanMessage> {
  const result = await v2DoneAction(String(taskId));
  const user = await requireUser();
  const note = await sync(user.id);
  revalidatePath("/plan");
  return { ok: result.ok, message: result.message + note };
}

export async function waitingOnAction(taskId: string, name: string | null): Promise<PlanMessage> {
  const user = await requireUser();
  const result = await setWaitingOn(user.id, String(taskId), name, prisma);
  if (!result.ok) return { ok: false, message: result.error };
  const note = await sync(user.id);
  refresh();
  return { ok: true, message: (name?.trim() ? `Waiting on ${name.trim()}.` : "Back on your list.") + note };
}

// "Fill my day": place today's most important open work into free time, then adjust by dragging.
export async function fillDayAction(): Promise<PlanMessage> {
  const user = await requireUser();
  const calendar = googleCalendarLoader();
  const proposal = await proposeDay(user.id, prisma, calendar);
  if (proposal.items.length === 0) {
    return { ok: true, message: proposal.unplaced.length ? `Nothing fits in today's free time (${proposal.unplaced.length} waiting). Drag one in or make room.` : "Nothing is waiting to be placed today." };
  }
  const result = await acceptPlan(user.id, prisma, proposal.items.map((item) => ({ taskId: item.task.id, start: item.slot.start.toISOString(), end: item.slot.end.toISOString() })));
  const note = await sync(user.id);
  refresh();
  const extra = proposal.unplaced.length ? ` ${proposal.unplaced.length} more didn't fit.` : "";
  return { ok: true, message: `Placed ${result.booked.length} block${result.booked.length === 1 ? "" : "s"}. Drag to adjust.${extra}${note}` };
}
