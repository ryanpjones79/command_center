import type { Board, BoardTask } from "@/server/v2/board";
import { blockingEvents, freeGaps, type Interval } from "@/lib/v2/availability";

const MIN = 60_000;

type LoadBoard = Pick<Board, "now" | "soonDays" | "workdayStartMin" | "dayEndMin" | "meetings"> & { availability?: Pick<Board["availability"], "work" | "optionalBlocks"> };

// Busy time for personal (non-work) planning, using the shared availability rules (lib/v2/availability.ts):
// blocking meetings (optional events don't count unless set to), RyanOS blocks, and CCHCS work hours.
export function personalBusy(board: LoadBoard, blocks: BoardTask[], options: { work?: boolean; excludeId?: string } = {}): Interval[] {
  return [
    ...blockingEvents(board.meetings, board.availability?.optionalBlocks ?? false).map((meeting) => ({ start: Date.parse(meeting.start), end: Date.parse(meeting.end) })),
    ...blocks.filter((task) => task.start && task.end && task.id !== options.excludeId).map((task) => ({ start: Date.parse(task.start as string), end: Date.parse(task.end as string) })),
    ...(options.work === false ? [] : (board.availability?.work ?? []).map((window) => ({ start: Date.parse(window.start), end: Date.parse(window.end) })))
  ];
}

// Earliest planning time on a day: the workday start or 7:00, whichever is earlier (same as the planner).
export const planningStartMin = (workdayStartMin: number) => Math.min(workdayStartMin, 7 * 60);

// The line above the Plan calendar: bookable time left today for personal work (from now, or the planning
// start, to the day's end, minus meetings, blocks and protected work hours, overlaps counted once), the
// bookable windows themselves (15+ minutes), and how many open tasks are due by tonight.
export function dayLoad(board: LoadBoard, blocks: BoardTask[], open: BoardTask[]) {
  const dayStart = Date.parse(board.soonDays[0]);
  const tomorrow = board.soonDays[1] ? Date.parse(board.soonDays[1]) : dayStart + 86_400_000;
  const from = Math.max(Date.parse(board.now), dayStart + planningStartMin(board.workdayStartMin) * MIN);
  const to = dayStart + board.dayEndMin * MIN;
  const busy = personalBusy(board, blocks);
  const exact = to > from ? freeGaps(busy, from, to, 0) : [];
  const freeMin = Math.round(exact.reduce((sum, gap) => sum + (gap.end - gap.start), 0) / MIN);
  const windows = exact
    .filter((gap) => gap.end - gap.start >= 15 * MIN)
    .map((gap) => ({ start: new Date(gap.start).toISOString(), end: new Date(gap.end).toISOString(), minutes: Math.floor((gap.end - gap.start) / MIN) }));

  const dueCount = open.filter((task) => {
    const deadline = Math.min(...[task.dueDate, task.expiresAt].map((value) => (value ? Date.parse(value) : Infinity)));
    return deadline < tomorrow;
  }).length;

  return { freeMin, dueCount, windows };
}
