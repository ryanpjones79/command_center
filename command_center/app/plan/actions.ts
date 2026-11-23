"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { v2DoneAction } from "@/app/now/v2-actions";
import { syncCalendar } from "@/server/v2/calendar-sync";
import { googleCalendarLoader } from "@/server/v2/day";
import { acceptPlan, proposeDay } from "@/server/v2/plan";
import { quickAdd, setBlock, setWaitingOn, type TaskChoices } from "@/server/v2/plan-board";
import { createHabit, setHabitDone } from "@/server/v2/habits";
import { materializeRoutines } from "@/server/v2/routines";
import { loadDaySettings } from "@/server/v2/schedule-service";
import { addZonedDays, localClock, startOfZonedDay } from "@/lib/v2/zoned-time";

export type PlanMessage = { ok: boolean; message: string };

function refresh() {
  for (const path of ["/plan", "/plan/wrap-up", "/now", "/time-blocks", "/projects", "/inbox", "/tasks"]) revalidatePath(path);
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

export async function quickAddAction(text: string, projectId: string | null, choices: TaskChoices = {}): Promise<PlanMessage> {
  const user = await requireUser();
  const clean: TaskChoices = {
    day: typeof choices?.day === "string" ? choices.day : null,
    time: typeof choices?.time === "string" ? choices.time : null,
    minutes: Number.isFinite(Number(choices?.minutes)) ? Number(choices?.minutes) : null,
    priority: choices?.priority === "HIGH" || choices?.priority === "CRITICAL" || choices?.priority === "MEDIUM" ? choices.priority : null,
    waitingOn: typeof choices?.waitingOn === "string" ? choices.waitingOn : null
  };
  const result = await quickAdd(user.id, String(text ?? ""), projectId ? String(projectId) : null, prisma, new Date(), clean);
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

// "Plan my day": to-dos first, then routines into the gaps that are left. Adjust by dragging.
export async function fillDayAction(): Promise<PlanMessage> {
  const user = await requireUser();
  await materializeRoutines(user.id, prisma).catch(() => undefined);
  const proposal = await proposeDay(user.id, prisma, googleCalendarLoader());
  if (proposal.items.length === 0) {
    return { ok: true, message: proposal.unplaced.length ? `Nothing fits in today's free time (${proposal.unplaced.length} waiting). Drag one in or make room.` : "Nothing is waiting to be placed today." };
  }
  const result = await acceptPlan(user.id, prisma, proposal.items.map((item) => ({ taskId: item.task.id, start: item.slot.start.toISOString(), end: item.slot.end.toISOString() })));
  const note = await sync(user.id);
  refresh();
  const routines = proposal.items.filter((item) => item.routine && result.booked.includes(item.task.id)).length;
  const todos = result.booked.length - routines;
  const parts = [todos ? `${todos} to-do${todos === 1 ? "" : "s"}` : null, routines ? `${routines} routine${routines === 1 ? "" : "s"}` : null].filter(Boolean).join(" and ");
  const extra = proposal.unplaced.length ? ` ${proposal.unplaced.length} more didn't fit.` : "";
  return { ok: true, message: `Placed ${parts || "nothing new"}. Drag to adjust.${extra}${note}` };
}

export type PlannedLine = { title: string; time: string; routine: boolean; reason: string };
export type TomorrowResult = { ok: boolean; message: string; placed: PlannedLine[]; unplaced: { title: string; reason: string }[] };

// Evening wrap-up: plan tomorrow with the picked must-dos first, then due work, then routines.
export async function planTomorrowAction(mustDo: string[]): Promise<TomorrowResult> {
  const user = await requireUser();
  const settings = await loadDaySettings(user.id, prisma);
  const tomorrow = addZonedDays(startOfZonedDay(new Date(), settings.timeZone), 1, settings.timeZone);
  const picks = (Array.isArray(mustDo) ? mustDo : []).map(String).slice(0, 5);
  const owned = await prisma.executionTask.findMany({ where: { userId: user.id, id: { in: picks } }, select: { id: true } });
  await materializeRoutines(user.id, prisma, new Date(), { day: tomorrow });
  const proposal = await proposeDay(user.id, prisma, googleCalendarLoader(), new Date(), { day: tomorrow, mustDo: owned.map((row) => row.id) });
  const result = await acceptPlan(user.id, prisma, proposal.items.map((item) => ({ taskId: item.task.id, start: item.slot.start.toISOString(), end: item.slot.end.toISOString() })));
  const note = await sync(user.id);
  refresh();
  const placed = proposal.items
    .filter((item) => result.booked.includes(item.task.id))
    .map((item) => ({ title: item.task.title, time: `${localClock(item.slot.start, settings.timeZone)}–${localClock(item.slot.end, settings.timeZone)}`, routine: Boolean(item.routine), reason: item.reason }));
  return {
    ok: true,
    message: placed.length ? `Tomorrow is planned: ${placed.length} block${placed.length === 1 ? "" : "s"}.${note}` : `Nothing new to place tomorrow.${note}`,
    placed,
    unplaced: proposal.unplaced.map((item) => ({ title: item.task.title, reason: item.reason }))
  };
}

export async function habitDoneAction(taskId: string, done: boolean): Promise<PlanMessage> {
  const user = await requireUser();
  const result = await setHabitDone(user.id, String(taskId), Boolean(done), prisma);
  if (!result.ok) return { ok: false, message: result.error };
  refresh();
  return { ok: true, message: done ? "Nice. Logged for today." : "Unchecked." };
}

export async function addHabitAction(input: { title: string; weekdays: number[]; minutes: number; area: string }): Promise<PlanMessage> {
  const user = await requireUser();
  const result = await createHabit(user.id, {
    title: String(input?.title ?? ""),
    weekdays: Array.isArray(input?.weekdays) ? input.weekdays.map(Number) : [],
    minutes: Number(input?.minutes) || 30,
    area: String(input?.area ?? "HEALTH")
  }, prisma);
  if (!result.ok) return { ok: false, message: result.error };
  refresh();
  return { ok: true, message: `Added "${String(input.title).trim()}". It shows here on the days you picked.` };
}
