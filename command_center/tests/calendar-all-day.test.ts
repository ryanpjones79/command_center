import { describe, expect, it } from "vitest";
import { toCalendarEvents } from "@/server/google-calendar-service";

const items = [
  { id: "a", summary: "Kids no school", start: { date: "2026-11-20" }, end: { date: "2026-11-21" } },
  { id: "b", summary: "Dentist", start: { dateTime: "2026-11-20T17:00:00Z" }, end: { dateTime: "2026-11-20T18:00:00Z" } },
  { id: "c", summary: "Cancelled: lunch", start: { dateTime: "2026-11-20T19:00:00Z" }, end: { dateTime: "2026-11-20T20:00:00Z" } }
];

describe("calendar all-day events", () => {
  it("are hidden by default (Calendar, Now, Today)", () => {
    expect(toCalendarEvents(items).map((event) => event.id)).toEqual(["b"]);
  });

  it("are kept when asked for (daily email brief)", () => {
    const events = toCalendarEvents(items, { includeAllDay: true });
    expect(events.map((event) => [event.id, event.isAllDay])).toEqual([["a", true], ["b", false]]);
  });
});
