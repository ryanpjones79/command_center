import type { Board, BoardTask } from "@/server/v2/board";

const MIN = 60_000;

// The line above the Plan calendar: how much free time is left today and how many open tasks are due by
// tonight. Free time = from now (or the workday start) to the day's end, minus meetings and blocks, with
// overlaps counted once. Also the free windows themselves, for the Plan rail's "bookable" line.
export function dayLoad(board: Pick<Board, "now" | "soonDays" | "workdayStartMin" | "dayEndMin" | "meetings">, blocks: BoardTask[], open: BoardTask[]) {
  const dayStart = Date.parse(board.soonDays[0]);
  const tomorrow = board.soonDays[1] ? Date.parse(board.soonDays[1]) : dayStart + 86_400_000;
  const from = Math.max(Date.parse(board.now), dayStart + board.workdayStartMin * MIN);
  const to = dayStart + board.dayEndMin * MIN;

  const busy = [
    ...board.meetings.map((meeting) => [Date.parse(meeting.start), Date.parse(meeting.end)]),
    ...blocks.filter((task) => task.start && task.end).map((task) => [Date.parse(task.start as string), Date.parse(task.end as string)])
  ]
    .map(([start, end]) => [Math.max(start, from), Math.min(end, to)])
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);
  let covered = 0;
  let reach = from;
  // Bookable focus time: the gaps left after meetings and blocks (protected routines included), 15+ minutes.
  const windows: { start: string; end: string; minutes: number }[] = [];
  const gap = (start: number, end: number) => {
    const minutes = Math.floor((end - start) / MIN);
    if (minutes >= 15) windows.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString(), minutes });
  };
  for (const [start, end] of busy) {
    if (end <= reach) continue;
    if (start > reach) gap(reach, start);
    covered += end - Math.max(start, reach);
    reach = end;
  }
  if (to > reach) gap(reach, to);
  const freeMin = to > from ? Math.max(0, Math.round((to - from - covered) / MIN)) : 0;

  const dueCount = open.filter((task) => {
    const deadline = Math.min(...[task.dueDate, task.expiresAt].map((value) => (value ? Date.parse(value) : Infinity)));
    return deadline < tomorrow;
  }).length;

  return { freeMin, dueCount, windows };
}
