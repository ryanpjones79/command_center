import { describe, expect, it } from "vitest";
import { dayLoad } from "@/lib/v2/day-load";
import type { BoardTask } from "@/server/v2/board";

// Day = 2026-11-23 in UTC terms for simplicity: workday 8:00, day end 22:00.
const day = "2026-11-23T00:00:00.000Z";
const at = (hour: number, minute = 0) => new Date(Date.UTC(2026, 10, 23, hour, minute)).toISOString();
const board = (now: string, meetings: { title: string; start: string; end: string }[] = []) => ({
  now, soonDays: [day, "2026-11-24T00:00:00.000Z"], workdayStartMin: 8 * 60, dayEndMin: 22 * 60, meetings
});
const task = (fields: Partial<BoardTask>) => ({ id: Math.random().toString(), start: null, end: null, dueDate: null, expiresAt: null, ...fields }) as BoardTask;

describe("day load", () => {
  it("counts free time from now to day end, overlaps once", () => {
    const load = dayLoad(
      board(at(12), [{ title: "Call", start: at(13), end: at(14) }]),
      [task({ start: at(13, 30), end: at(15) }), task({ start: at(9), end: at(10) })],
      []
    );
    expect(load.freeMin).toBe(10 * 60 - 120); // 12:00-22:00 minus 13:00-15:00
  });
  it("starts at 7:00 (or the workday start if earlier) before the day begins and is zero after day end", () => {
    expect(dayLoad(board(at(6)), [], []).freeMin).toBe(15 * 60); // from 7:00, the planner's earliest start
    expect(dayLoad(board(at(23)), [], []).freeMin).toBe(0);
  });
  it("counts tasks due or expiring before tomorrow", () => {
    const open = [task({ dueDate: at(20) }), task({ expiresAt: at(15) }), task({ dueDate: "2026-11-25T00:00:00.000Z" }), task({}), task({ dueDate: "2026-11-20T00:00:00.000Z" })];
    expect(dayLoad(board(at(12)), [], open).dueCount).toBe(3); // overdue counts too
  });
  it("lists the bookable windows left after meetings and blocks (15 minutes or more)", () => {
    const load = dayLoad(
      board(at(12), [{ title: "Call", start: at(13), end: at(14) }]),
      [task({ start: at(14), end: at(14, 50) }), task({ start: at(15), end: at(21, 50) })],
      []
    );
    // The 10-minute gaps at 14:50 and 21:50 are too short to book.
    expect(load.windows.map((window) => [window.start, window.end, window.minutes])).toEqual([[at(12), at(13), 60]]);
  });
});
