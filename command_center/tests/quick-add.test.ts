import { describe, expect, it } from "vitest";
import { matchTarget, parseQuickAdd, type QuickTarget } from "@/lib/v2/quick-add";

const tz = "America/Los_Angeles";
// Sunday Nov 22 2026, 6:00 pm Pacific
const now = new Date("2026-11-23T02:00:00Z");
const targets: QuickTarget[] = [
  { id: "p-xmas", name: "Christmas shopping", kind: "PROJECT", domainId: "d-family" },
  { id: "p-wholesale", name: "Amazon: Wholesale sourcing", kind: "PROJECT", domainId: "d-rykas" },
  { id: "p-cchcs", name: "CCHCS: Projects & follow-ups", kind: "PROJECT", domainId: "d-work" },
  { id: "d-rykas", name: "Rykas", slug: "rykas", kind: "AREA", domainId: "d-rykas" },
  { id: "d-work", name: "Work", slug: "work", kind: "AREA", domainId: "d-work" }
];
const local = (value: Date | null) => value && value.toLocaleString("en-US", { timeZone: tz, weekday: "short", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });

describe("quick add", () => {
  it("plain text is just a title", () => {
    const task = parseQuickAdd("Buy printer ink", targets, now, tz);
    expect(task).toMatchObject({ title: "Buy printer ink", projectId: null, dueDate: null, start: null, minutes: null, priority: "MEDIUM" });
  });

  it("reads project, day, length, waiting-on and priority", () => {
    const task = parseQuickAdd("Call Redstone about MOQ #wholesale fri 30m @Heidi !", targets, now, tz);
    expect(task.title).toBe("Call Redstone about MOQ");
    expect(task.projectId).toBe("p-wholesale");
    expect(local(task.dueDate)).toBe("Fri, 11/27, 11:59 PM");
    expect([task.minutes, task.waitingOn, task.priority, task.start]).toEqual([30, "Heidi", "HIGH", null]);
  });

  it("a time puts it on the calendar; said in the evening without a day it means tomorrow", () => {
    expect(local(parseQuickAdd("Dentist tomorrow at 3pm 1h", targets, now, tz).start)).toBe("Mon, 11/23, 3:00 PM");
    expect(local(parseQuickAdd("Stretch 9:30am", targets, now, tz).start)).toBe("Mon, 11/23, 9:30 AM");
    expect(local(parseQuickAdd("Gift list nov 30", targets, now, tz).dueDate)).toBe("Mon, 11/30, 11:59 PM");
    expect(local(parseQuickAdd("Renew tabs 1/5", targets, now, tz).dueDate)).toBe("Tue, 1/5, 11:59 PM"); // next January
  });

  it("matches tags loosely, prefers projects, and keeps an unknown tag in the title", () => {
    expect(matchTarget("xmas", targets)).toBeNull();
    expect(matchTarget("christmas", targets)?.id).toBe("p-xmas");
    expect(matchTarget("cchcs", targets)?.id).toBe("p-cchcs");
    expect(matchTarget("rykas", targets)?.id).toBe("d-rykas");
    const unknown = parseQuickAdd("Book flights #travel", targets, now, tz);
    expect([unknown.title, unknown.unmatchedTag, unknown.projectId]).toEqual(["Book flights travel", "travel", null]);
  });

  it("a project's own add line presets the project; a tag still wins", () => {
    const preset = targets[0];
    expect(parseQuickAdd("Wrap gifts", targets, now, tz, preset).projectId).toBe("p-xmas");
    expect(parseQuickAdd("Wrap gifts #cchcs", targets, now, tz, preset).projectId).toBe("p-cchcs");
  });

  it("numbers that are not times or lengths stay in the title", () => {
    expect(parseQuickAdd("Order 12 boxes", targets, now, tz).title).toBe("Order 12 boxes");
  });
});
