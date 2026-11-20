import { describe, expect, it } from "vitest";
import { deriveCoverage, type CoverageTask } from "@/lib/v2/coverage";
import { summarizeGoal, type GoalView } from "@/lib/v2/progress";
import { addZonedDays, atLocalMinutes, localDateKey, periodRange, startOfZonedWeek, zonedDayRange } from "@/lib/v2/zoned-time";

const TZ = "America/Los_Angeles";
const NOW = new Date("2026-11-20T18:00:00.000Z"); // Fri 10:00 PT

describe("zoned time (America/Los_Angeles)", () => {
  it("handles the fall-back day (Nov 1, 2026) as 25 hours and keeps wall time across it", () => {
    const { start, end } = zonedDayRange(new Date("2026-11-01T19:00:00.000Z"), TZ);
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(25);
    const before = new Date("2026-10-31T16:00:00.000Z"); // Sat 9:00 PDT
    expect(addZonedDays(before, 2, TZ).toISOString()).toBe("2026-11-02T17:00:00.000Z"); // Mon 9:00 PST
  });

  it("handles the spring-forward day (Mar 8, 2026) as 23 hours", () => {
    const { start, end } = zonedDayRange(new Date("2026-03-08T20:00:00.000Z"), TZ);
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(23);
  });

  it("puts 11:30 PM PT on the right local date and week starts on local Monday", () => {
    const lateFriday = new Date("2026-11-21T07:30:00.000Z"); // Fri 23:30 PST (Sat in UTC)
    expect(localDateKey(lateFriday, TZ)).toBe("2026-11-20");
    expect(startOfZonedWeek(lateFriday, TZ).toISOString()).toBe("2026-11-16T08:00:00.000Z");
    expect(atLocalMinutes(NOW, 9 * 60, TZ).toISOString()).toBe("2026-11-20T17:00:00.000Z");
  });

  it("future review dates land on the same local time after a DST change", () => {
    const review = addZonedDays(new Date("2026-10-26T16:00:00.000Z"), 30, TZ); // Mon 9:00 PDT + 30 days
    expect(review.toISOString()).toBe("2026-11-25T17:00:00.000Z"); // Wed 9:00 PST
  });
});

function task(id: string, overrides: Partial<CoverageTask> = {}): CoverageTask {
  return {
    id, title: id, status: "NOT_STARTED", isBlocked: false, scheduledStart: null, followUpDate: null,
    dueDate: null, expiresAt: null, completedAt: null, sourceVerifiedAt: null,
    createdAt: new Date("2026-11-10T00:00:00.000Z"), ...overrides
  };
}
const active = { activeStatus: "ACTIVE_NOW", monitoring: false, closedAt: null, sourceStatus: null };

describe("project coverage", () => {
  it("7: an unscheduled next action means the project needs time", () => {
    expect(deriveCoverage(active, [task("a")], NOW).state).toBe("NEEDS_TIME");
    expect(deriveCoverage(active, [task("a", { scheduledStart: new Date("2026-11-20T21:00:00.000Z") })], NOW).state).toBe("COVERED");
  });

  it("8: no open action surfaces the missing next step; monitoring is a healthy alternative", () => {
    const done = task("d", { status: "DONE", completedAt: new Date("2026-11-19T00:00:00.000Z") });
    const coverage = deriveCoverage(active, [done], NOW);
    expect(coverage.state).toBe("NEEDS_NEXT_ACTION");
    expect(coverage.lastMeaningfulStepAt?.toISOString()).toBe("2026-11-19T00:00:00.000Z");
    expect(deriveCoverage({ ...active, monitoring: true }, [done], NOW).state).toBe("MONITORING");
  });

  it("9: a source-complete project cannot look clean while obligations are open", () => {
    const coverage = deriveCoverage({ ...active, sourceStatus: "complete" }, [task("left")], NOW);
    expect(coverage.state).toBe("SOURCE_COMPLETE_OPEN");
    expect(coverage.message).toContain("1 obligation is still open");
  });

  it("waiting is fine until its follow-up date passes; expired offers need a decision", () => {
    expect(deriveCoverage(active, [task("w", { status: "WAITING", followUpDate: new Date("2026-11-25T17:00:00.000Z") })], NOW).state).toBe("WAITING");
    expect(deriveCoverage(active, [task("w", { status: "WAITING", followUpDate: new Date("2026-11-18T17:00:00.000Z") })], NOW).state).toBe("WAITING_OVERDUE");
    expect(deriveCoverage(active, [task("x", { expiresAt: new Date("2026-11-19T00:00:00.000Z") })], NOW).state).toBe("NEEDS_NEXT_ACTION");
  });

  it("rescheduling is not progress: only completions and verifications count", () => {
    const moved = task("m", { scheduledStart: new Date("2026-11-21T17:00:00.000Z") });
    expect(deriveCoverage(active, [moved], NOW).lastMeaningfulStepAt).toBeNull();
  });
});

const goal = (overrides: Partial<GoalView> = {}): GoalView => ({
  id: "g1", owner: "SOURCE", sourceSystem: "EBAY", sourceUrl: "https://ebay-app.example/goals/listings",
  title: "eBay listings live", desiredOutcome: "More inventory listed", measureKind: "OUTCOME",
  metricName: "Listings live (verified)", metricDefinition: "Active eBay listings reported by the eBay app",
  unit: "listings", target: 40, period: "WEEK", ...overrides
});

describe("goal progress", () => {
  const week = periodRange("WEEK", NOW, TZ)!;
  const lastWeekStart = addZonedDays(week.start, -7, TZ);

  it("17: keeps period, definition, source and evidence", () => {
    const summary = summarizeGoal(goal(), [{ periodStart: week.start, periodEnd: week.end, value: 31, evidence: "SOURCE_VERIFIED", observedAt: NOW }], NOW, TZ);
    expect(summary).toMatchObject({ value: 31, status: "VERIFIED", target: 40, definition: "Active eBay listings reported by the eBay app" });
    expect(summary.period?.start.toISOString()).toBe("2026-11-16T08:00:00.000Z");
  });

  it("18: last week's confirmation is not this week's progress", () => {
    const summary = summarizeGoal(goal({ owner: "RYANOS", sourceSystem: null }), [
      { periodStart: lastWeekStart, periodEnd: week.start, value: 3, evidence: "OWNER_CONFIRMED", observedAt: lastWeekStart }
    ], NOW, TZ);
    expect(summary).toMatchObject({ value: null, status: "UNKNOWN" });
    expect(summary.evidenceLabel).toContain("last: 3");
  });

  it("owner confirmation stays distinct from source verification; stale source is historical, not green", () => {
    const confirmed = summarizeGoal(goal(), [{ periodStart: week.start, periodEnd: week.end, value: 12, evidence: "OWNER_CONFIRMED", observedAt: NOW }], NOW, TZ);
    expect(confirmed.status).toBe("CONFIRMED");
    const stale = summarizeGoal(goal(), [{ periodStart: week.start, periodEnd: week.end, value: 31, evidence: "SOURCE_VERIFIED", observedAt: NOW }], NOW, TZ, false);
    expect(stale.status).toBe("HISTORICAL");
    expect(summarizeGoal(goal(), [], NOW, TZ)).toMatchObject({ value: null, status: "UNKNOWN" });
  });

  it("19: source-owned goals open their source for editing; personal goals edit in RyanOS", () => {
    expect(summarizeGoal(goal(), [], NOW, TZ)).toMatchObject({ editable: false, editHref: "https://ebay-app.example/goals/listings" });
    expect(summarizeGoal(goal({ owner: "RYANOS" }), [], NOW, TZ)).toMatchObject({ editable: true, editHref: "/projects/progress?goal=g1" });
  });
});
