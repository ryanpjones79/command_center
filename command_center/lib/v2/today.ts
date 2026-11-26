import type { Board, BoardTask } from "@/server/v2/board";
import { blockingEvents, freeGaps, respectsWorkHours } from "@/lib/v2/availability";
import { personalBusy, planningStartMin } from "@/lib/v2/day-load";

// Plan/Today (2026-11-25 redesign): the next opening, which ready actions fit it, the times a task can be booked,
// a short reason for each action, and the window the time grid shows. Pure functions over the board, using the
// same availability rules as the scheduler (lib/v2/availability.ts); the server rechecks every booking.

const MIN = 60_000;
const STEP = 15;

type GridBoard = Pick<Board, "now" | "soonDays" | "workdayStartMin" | "workdayEndMin" | "dayEndMin" | "meetings" | "timeZone"> & {
  availability: Pick<Board["availability"], "work" | "optionalBlocks">;
};
type TaskFit = Pick<BoardTask, "id" | "minutes" | "areaSlug" | "workContext">;

export type Opening = { start: number; end: number; minutes: number; limit: string | null };

const ceilStep = (ms: number) => Math.ceil(ms / (STEP * MIN)) * STEP * MIN;

// Earliest bookable instant on a day: now (rounded up to 15 minutes) or the planning start, whichever is later.
function dayBounds(board: GridBoard, dayIso: string) {
  const dayStart = Date.parse(dayIso);
  const from = Math.max(ceilStep(Date.parse(board.now)), dayStart + planningStartMin(board.workdayStartMin) * MIN);
  return { dayStart, from, to: dayStart + board.dayEndMin * MIN };
}

// What ends an opening: the meeting, block or protected window that starts when it ends.
function limitAt(board: GridBoard, blocks: BoardTask[], at: number, dayEnd: number): string | null {
  if (at >= dayEnd) return "End of your planning day";
  const meeting = blockingEvents(board.meetings, board.availability.optionalBlocks).find((item) => Date.parse(item.start) === at);
  if (meeting) return `Before ${meeting.title}`;
  const block = blocks.find((task) => task.start && Date.parse(task.start) === at);
  if (block) return block.isProtected ? `Before protected ${block.title.toLowerCase().startsWith("protected") ? block.title.slice(10) : block.title}` : `Before ${block.title}`;
  if (board.availability.work.some((window) => Date.parse(window.start) === at)) return "Before protected work hours";
  return null;
}

// The next open stretch today (15+ minutes) for personal work, and what limits it.
export function nextOpening(board: GridBoard, blocks: BoardTask[]): Opening | null {
  const { from, to } = dayBounds(board, board.soonDays[0]);
  if (to <= from) return null;
  const gap = freeGaps(personalBusy(board, blocks), from, to, STEP)[0];
  if (!gap) return null;
  return { start: gap.start, end: gap.end, minutes: Math.round((gap.end - gap.start) / MIN), limit: limitAt(board, blocks, gap.end, to) };
}

// Every 15-minute start on a day where the task fits, under the same rules the server uses to book it.
export function startsFor(board: GridBoard, blocks: BoardTask[], task: TaskFit, dayIso: string = board.soonDays[0]): number[] {
  const { from, to } = dayBounds(board, dayIso);
  const busy = personalBusy(board, blocks, { excludeId: task.id, work: respectsWorkHours(task.areaSlug, task.workContext) });
  const length = task.minutes * MIN;
  const out: number[] = [];
  for (let t = from; t + length <= to; t += STEP * MIN) {
    if (busy.every((item) => item.end <= t || item.start >= t + length)) out.push(t);
  }
  return out;
}

// A task fits the opening when it can start inside it and finish before it ends.
export function fitsOpening(board: GridBoard, blocks: BoardTask[], task: TaskFit, opening: Opening | null) {
  if (!opening) return false;
  return startsFor(board, blocks, task).some((start) => start >= opening.start && start + task.minutes * MIN <= opening.end);
}

// One short, honest reason an action is here, from live fields only.
export function reasonFor(task: Pick<BoardTask, "dueDate" | "expiresAt" | "committed" | "weekly" | "links" | "priority" | "areaSlug" | "workContext">, timeZone: string, nowIso: string) {
  const deadline = [task.dueDate, task.expiresAt].filter((value): value is string => Boolean(value)).sort()[0];
  if (deadline) {
    const key = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone });
    const days = Math.round((Date.parse(key(deadline)) - Date.parse(key(nowIso))) / 86_400_000);
    const word = deadline === task.expiresAt ? "Expires" : "Due";
    if (days < 0) return word === "Due" ? "Overdue" : "Expired";
    if (days === 0) return `${word} today`;
    if (days === 1) return `${word} tomorrow`;
    if (days <= 6) return `${word} ${new Date(deadline).toLocaleDateString("en-US", { timeZone, weekday: "short" })}`;
  }
  if (task.committed) return "Pinned today";
  if (task.links.some((link) => link.kind === "draft")) return "Draft ready";
  if (!respectsWorkHours(task.areaSlug, task.workContext)) return "Work hours";
  if (task.priority === "CRITICAL") return "Critical";
  if (task.weekly) return "Weekly priority";
  if (task.priority === "HIGH") return "High priority";
  return "Ready";
}

export type GridWindow = { start: number; end: number; earlier: { start: number; end: number } | null };

// Minutes from local midnight the time grid shows for a day. Today starts at the current half hour, skipping a
// protected work window that covers it; past and protected time before that folds into "Earlier" (expandable).
// Other days show the whole planning day. Everything booked inside the day stays visible.
export function gridWindow(board: GridBoard, blocks: BoardTask[], dayIso: string, minuteOf: (iso: string) => number, expanded = false): GridWindow {
  const planStart = planningStartMin(board.workdayStartMin);
  let end = Math.max(board.dayEndMin, planStart + 60);
  const dayStart = Date.parse(dayIso);
  const dayNext = dayStart + 86_400_000;
  const inDay = (iso: string) => Date.parse(iso) >= dayStart && Date.parse(iso) < dayNext;
  for (const item of [...blocks.filter((task) => task.start && task.end).map((task) => ({ start: task.start as string, end: task.end as string })), ...board.meetings]) {
    if (!inDay(item.start)) continue;
    const stop = Date.parse(item.end) >= dayNext ? 24 * 60 : minuteOf(item.end);
    end = Math.max(end, stop);
  }
  end = Math.min(24 * 60, Math.ceil(end / 30) * 30);
  const isToday = dayIso === board.soonDays[0];
  let start = planStart;
  if (isToday) {
    start = Math.max(planStart, Math.floor(minuteOf(board.now) / 30) * 30);
    const work = board.availability.work.find((window) => Date.parse(window.start) <= dayStart + start * MIN && Date.parse(window.end) > dayStart + start * MIN);
    if (work) start = Math.max(start, Math.floor(minuteOf(work.end) / 30) * 30);
  }
  start = Math.min(start, Math.max(0, end - 180)); // always show at least three hours
  const earliest = Math.min(planStart, ...blocks.filter((task) => task.start && inDay(task.start)).map((task) => minuteOf(task.start as string)));
  const fullStart = Math.max(0, Math.floor(earliest / 30) * 30);
  const earlier = start > fullStart ? { start: fullStart, end: start } : null;
  return { start: expanded && earlier ? fullStart : start, end, earlier };
}
