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
import { addZonedDays, localClock, localDateKey, startOfZonedDay } from "@/lib/v2/zoned-time";
import { bookSlot, scheduleAction } from "@/server/v2/schedule-service";
import { MAX_COMMITMENTS } from "@/server/v2/plan";

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
  const result = await acceptPlan(user.id, prisma, proposal.items.filter((item) => item.group === "COMMIT").map((item) => ({ taskId: item.task.id, start: item.slot.start.toISOString(), end: item.slot.end.toISOString() })));
  const note = await sync(user.id);
  refresh();
  const routines = proposal.items.filter((item) => item.routine && result.booked.includes(item.task.id)).length;
  const todos = result.booked.length - routines;
  const parts = [todos ? `${todos} to-do${todos === 1 ? "" : "s"}` : null, routines ? `${routines} routine${routines === 1 ? "" : "s"}` : null].filter(Boolean).join(" and ");
  const extra = proposal.unplaced.length ? ` ${proposal.unplaced.length} more didn't fit.` : "";
  return { ok: true, message: `Placed ${parts || "nothing new"}. Drag to adjust.${extra}${note}` };
}

// Pin a to-do to today (Plan my day places pinned to-dos), or unpin it.
export async function pinTodayAction(taskId: string, on: boolean): Promise<PlanMessage> {
  const user = await requireUser();
  const result = await prisma.executionTask.updateMany({
    where: { id: String(taskId), userId: user.id, status: { notIn: ["DONE", "DROPPED"] } },
    data: on ? { whenBucket: "TODAY", followUpDate: null } : { whenBucket: "THIS_WEEK" }
  });
  refresh();
  return result.count ? { ok: true, message: on ? "Pinned to today. Plan my day will fit it in." : "Unpinned." } : { ok: false, message: "Task not found." };
}

// One "review these" block for an app's check-ins instead of a block per alert. Reuses today's review task.
export async function scheduleCheckinReviewAction(source: string, label: string, count: number, href: string | null): Promise<PlanMessage> {
  const user = await requireUser();
  const settings = await loadDaySettings(user.id, prisma);
  const sample = await prisma.executionTask.findFirst({ where: { userId: user.id, sourceSystem: String(source), status: { notIn: ["DONE", "DROPPED"] } }, select: { domainId: true } });
  if (!sample) return { ok: false, message: "Nothing to review from that app." };
  const key = `CHECKIN_REVIEW:${String(source).slice(0, 30)}:${localDateKey(new Date(), settings.timeZone)}`;
  const minutes = Math.min(45, Math.max(15, 10 + 2 * Math.round(Number(count) || 0)));
  const title = `Review ${String(label).slice(0, 40)} check-ins (${Math.round(Number(count) || 0)})`;
  const url = href && /^https:\/\//.test(href) ? href : null;
  const task = await prisma.executionTask.upsert({
    where: { userId_integrationSourceKey: { userId: user.id, integrationSourceKey: key } },
    update: { title, remainingMinutes: minutes, status: "NOT_STARTED", sourceUrl: url },
    create: { userId: user.id, domainId: sample.domainId, title, remainingMinutes: minutes, whenBucket: "TODAY", integrationSourceKey: key, sourceUrl: url, source: "Check-ins review" },
    select: { id: true, scheduledStart: true }
  });
  if (task.scheduledStart) return { ok: true, message: "Already on today's calendar." };
  const booked = await scheduleAction(user.id, task.id, prisma, googleCalendarLoader(), {});
  const note = await sync(user.id);
  refresh();
  return booked.type === "BOOKED"
    ? { ok: true, message: `${title} booked at ${localClock(booked.slot.start, settings.timeZone)}.${note}` }
    : { ok: true, message: `${title} added to today's to-dos; no free slot right now, drag it onto the calendar.${note}` };
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
  const result = await acceptPlan(user.id, prisma, proposal.items.filter((item) => item.group === "COMMIT").map((item) => ({ taskId: item.task.id, start: item.slot.start.toISOString(), end: item.slot.end.toISOString() })));
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

// ---- Plan as the scheduling workspace: preview, then book; one-click next slot; missed blocks ----

export type PreviewLine = { taskId: string; title: string; start: string; end: string; reason: string; routine: boolean; areaSlug: string; group: "COMMIT" | "EXTRA" };
export type PreviewResult = { ok: boolean; message: string; items: PreviewLine[]; unplaced: { title: string; reason: string }[]; calendarKnown: boolean; bufferMinutes: number };

// "Plan my day", step 1: propose today's blocks without booking anything. Ryan reviews the preview on the
// calendar, unticks what he doesn't want, then books the rest with bookPlanAction.
export async function previewDayAction(): Promise<PreviewResult> {
  const user = await requireUser();
  await materializeRoutines(user.id, prisma).catch(() => undefined);
  const proposal = await proposeDay(user.id, prisma, googleCalendarLoader());
  const items = proposal.items.map((item) => ({
    taskId: item.task.id,
    title: item.task.title,
    start: item.slot.start.toISOString(),
    end: item.slot.end.toISOString(),
    reason: item.reason,
    routine: Boolean(item.routine),
    areaSlug: item.task.domainSlug,
    group: item.group
  }));
  const unplaced = proposal.unplaced.slice(0, 12).map((item) => ({ title: item.task.title, reason: item.reason }));
  const base = { ok: true, items, unplaced, calendarKnown: proposal.calendarKnown, bufferMinutes: proposal.bufferMinutes };
  const unknown = proposal.calendarKnown ? "" : " Google Calendar couldn't be read, so check for meetings first.";
  if (items.length === 0) {
    return { ...base, message: (unplaced.length ? `Nothing fits in today's free time (${proposal.unplaced.length} waiting).` : "Nothing is waiting to be placed today.") + unknown };
  }
  const commits = items.filter((item) => item.group === "COMMIT").length;
  return { ...base, message: `Up to ${MAX_COMMITMENTS} commitments proposed (${commits}); extras are unticked. Nothing is booked yet.${unknown}` };
}

// "Plan my day", step 2: book the previewed blocks Ryan kept. Each slot is re-checked under the booking lock.
export async function bookPlanAction(items: { taskId: string; start: string; end: string }[]): Promise<PlanMessage> {
  const user = await requireUser();
  const clean = (Array.isArray(items) ? items : []).slice(0, 40).map((item) => ({ taskId: String(item.taskId), start: String(item.start), end: String(item.end) }));
  if (clean.length === 0) return { ok: false, message: "Nothing picked to book." };
  // Same availability rules as the preview, re-checked per slot under the booking lock.
  const calendar = googleCalendarLoader();
  let booked = 0;
  const skipped: string[] = [];
  for (const item of clean) {
    const result = await bookSlot(user.id, item.taskId, new Date(item.start), new Date(item.end), prisma, calendar);
    if (result.type === "BOOKED") booked += 1;
    else skipped.push(result.type === "TAKEN" ? result.message : "a task was already done or gone.");
  }
  const note = await sync(user.id);
  refresh();
  const skippedText = skipped.length ? ` ${skipped.length} skipped: ${skipped[0]} Preview again for a new time.` : "";
  return { ok: booked > 0, message: `Booked ${booked} block${booked === 1 ? "" : "s"}.${skippedText}${note}` };
}

// One click: put a ready action (or a missed block) in the next free slot. Same task row, so its project,
// source link and drafts stay attached; the calendar event moves rather than being duplicated.
export async function nextSlotAction(taskId: string): Promise<PlanMessage> {
  const user = await requireUser();
  const settings = await loadDaySettings(user.id, prisma);
  const result = await scheduleAction(user.id, String(taskId), prisma, googleCalendarLoader(), {});
  const note = await sync(user.id);
  refresh();
  if (result.type === "BOOKED") {
    const day = localDateKey(result.slot.start, settings.timeZone) === localDateKey(new Date(), settings.timeZone) ? "" : ` ${result.slot.start.toLocaleDateString("en-US", { timeZone: settings.timeZone, weekday: "short" })}`;
    return { ok: true, message: `Booked${day} ${localClock(result.slot.start, settings.timeZone)}–${localClock(result.slot.end, settings.timeZone)}.${result.usesBuffer ? " This uses today's buffer." : ""}${note}` };
  }
  if (result.type === "NOT_FOUND") return { ok: false, message: "That task is already done or gone." };
  return { ok: false, message: `${"message" in result ? result.message : "No free slot fits."} Pick a time instead.` };
}

// Ryan takes over an action an agent was preparing: it becomes his, ready to schedule. Drafts stay attached.
export async function takeOverAction(taskId: string): Promise<PlanMessage> {
  const user = await requireUser();
  const updated = await prisma.executionTask.updateMany({
    where: { id: String(taskId), userId: user.id, status: "WAITING", waitingOn: { startsWith: "Agent" } },
    data: { status: "NOT_STARTED", waitingOn: null }
  });
  if (!updated.count) return { ok: false, message: "That item isn't with an agent any more." };
  await prisma.executionTaskEvent.create({ data: { userId: user.id, taskId: String(taskId), type: "READY", detail: "Ryan took it over from the agent" } });
  refresh();
  return { ok: true, message: "It's yours now, ready to schedule." };
}

// One click on a suggested time ("Book 7:15 PM"): books exactly that slot after re-checking it with the same
// availability rules as the preview. A stale suggestion is refused instead of double-booking.
export async function bookSlotAction(taskId: string, start: string, end: string): Promise<PlanMessage> {
  const user = await requireUser();
  const settings = await loadDaySettings(user.id, prisma);
  const result = await bookSlot(user.id, String(taskId), new Date(String(start)), new Date(String(end)), prisma, googleCalendarLoader());
  if (result.type === "NOT_FOUND") return { ok: false, message: "That task is already done or gone." };
  if (result.type === "TAKEN") {
    refresh();
    return { ok: false, message: `${result.message} Pick another time.` };
  }
  const note = await sync(user.id);
  refresh();
  const unknown = result.calendarKnown ? "" : " Google Calendar couldn't be read; check for a meeting at that time.";
  return { ok: true, message: `Booked ${localClock(result.slot.start, settings.timeZone)}–${localClock(result.slot.end, settings.timeZone)}.${unknown}${note}` };
}
