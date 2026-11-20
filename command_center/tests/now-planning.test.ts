import { describe, expect, it } from "vitest";
import { alertsForWindow, sendPushover } from "@/server/now/alerts";
import {
  appendSkipNote,
  deriveNowState,
  findOpenSlot,
  latestEndForDay,
  skipCount,
  type NowTask
} from "@/server/now/planning";

const at = (time: string) => new Date(`2026-11-19T${time}:00.000Z`);

describe("findOpenSlot", () => {
  it("starts at the next 15-minute mark and skips past busy blocks", () => {
    const slot = findOpenSlot({
      from: at("16:07"),
      minutes: 30,
      busy: [{ start: at("16:00"), end: at("16:40") }, { start: at("17:00"), end: at("17:30") }],
      latestEnd: at("23:59")
    });
    expect(slot).toEqual({ start: at("17:30"), end: at("18:00") });
  });

  it("uses a gap that fits exactly", () => {
    const slot = findOpenSlot({ from: at("16:00"), minutes: 15, busy: [{ start: at("16:15"), end: at("17:00") }], latestEnd: at("23:00") });
    expect(slot).toEqual({ start: at("16:00"), end: at("16:15") });
  });

  it("returns null when nothing fits before the cutoff", () => {
    expect(findOpenSlot({ from: at("20:50"), minutes: 30, busy: [], latestEnd: at("21:00") })).toBeNull();
  });

  it("caps auto-placement at 9 PM local", () => {
    // Day end = local midnight (08:00Z next day in PT) -> 9 PM local = 05:00Z
    expect(latestEndForDay(new Date("2026-11-20T08:00:00.000Z")).toISOString()).toBe("2026-11-20T05:00:00.000Z");
  });
});

describe("deriveNowState", () => {
  const block = (id: string, start: string, end: string): NowTask => ({
    id, title: id, domainSlug: "work", domainName: "Work", note: null, scheduledStart: at(start), scheduledEnd: at(end)
  });

  it("finds the current block, time left, the next block and an ended block still open", () => {
    const state = deriveNowState([block("next", "18:00", "18:30"), block("current", "16:30", "17:15"), block("ended", "15:00", "16:00")], at("16:50"));
    expect(state.current?.id).toBe("current");
    expect(state.minutesLeft).toBe(25);
    expect(state.next?.id).toBe("next");
    expect(state.minutesUntilNext).toBe(70);
    expect(state.overdueBlock?.id).toBe("ended");
  });

  it("reports free time when nothing is running", () => {
    const state = deriveNowState([block("later", "19:00", "19:30")], at("16:00"));
    expect(state.current).toBeNull();
    expect(state.minutesUntilNext).toBe(180);
  });
});

describe("skip tracking", () => {
  it("records each skip on the task and counts them", () => {
    let note: string | null = "Bring receipts";
    note = appendSkipNote(note, "2026-11-17", "TOMORROW");
    note = appendSkipNote(note, "2026-11-18", "TOMORROW");
    note = appendSkipNote(note, "2026-11-19", "THIS_WEEK");
    expect(note).toBe("Bring receipts\nSkipped 2026-11-17 (tomorrow)\nSkipped 2026-11-18 (tomorrow)\nSkipped 2026-11-19 (this week)");
    expect(skipCount(note)).toBe(3);
    expect(skipCount(null)).toBe(0);
  });
});

describe("block alerts", () => {
  const blocks = [
    { title: "Workout", domainSlug: "health", scheduledStart: at("16:00"), scheduledEnd: at("16:58") },
    { title: "School pickup", domainSlug: "family", scheduledStart: at("15:00"), scheduledEnd: at("16:59") },
    { title: "CCHCS", domainSlug: "work", scheduledStart: at("16:57"), scheduledEnd: at("18:27") }
  ];

  it("sends end pings first, then start pings, and never pings the end of a Kids block", () => {
    const alerts = alertsForWindow(blocks, at("16:55"), at("17:00"));
    expect(alerts.map((alert) => alert.title)).toEqual(["Time's up: Workout", "Now: CCHCS"]);
    expect(alerts[1].message).toBe("90 min block. Tap for the plan.");
  });

  it("sends nothing when no block changes in the window", () => {
    expect(alertsForWindow(blocks, at("17:00"), at("17:05"))).toEqual([]);
  });

  it("does nothing without Pushover keys", async () => {
    delete process.env.PUSHOVER_APP_TOKEN;
    const fakeFetch = (async () => new Response("{}")) as unknown as typeof fetch;
    expect(await sendPushover({ title: "x", message: "y" }, null, fakeFetch)).toEqual({ ok: false, error: "Pushover keys are not set." });
  });
});
