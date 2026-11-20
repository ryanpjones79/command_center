import { periodRange } from "@/lib/v2/zoned-time";

// Goals and progress. One owner per goal: SOURCE goals are defined and edited
// in their source app (RyanOS opens it); RYANOS goals are personal commitments
// maintained here. Results carry period, evidence and freshness; missing or old
// data is UNKNOWN or HISTORICAL, never a silent zero or green.

export type GoalOwner = "SOURCE" | "RYANOS";
export type Evidence = "SOURCE_VERIFIED" | "OWNER_CONFIRMED" | "UNKNOWN";

export type GoalView = {
  id: string;
  owner: string;
  sourceSystem: string | null;
  sourceUrl: string | null;
  title: string;
  desiredOutcome: string | null;
  measureKind: string; // OUTCOME | ACTION | CONSTRAINT (never mixed)
  metricName: string | null;
  metricDefinition: string | null;
  unit: string | null;
  target: number | null;
  period: string;
};

export type GoalResultView = {
  periodStart: Date;
  periodEnd: Date;
  value: number | null;
  evidence: string;
  observedAt: Date;
};

export type GoalSummary = {
  goalId: string;
  title: string;
  measureKind: string;
  metric: string | null;
  definition: string | null;
  target: number | null;
  unit: string | null;
  period: { start: Date; end: Date } | null;
  value: number | null;
  status: "VERIFIED" | "CONFIRMED" | "UNKNOWN" | "HISTORICAL";
  evidenceLabel: string;
  observedAt: Date | null;
  editHref: string | null; // source goals open the source; RyanOS goals edit locally
  editable: boolean;
};

export function summarizeGoal(goal: GoalView, results: GoalResultView[], now: Date, timeZone: string, sourceHealthy = true): GoalSummary {
  const period = periodRange(goal.period, now, timeZone);
  const inPeriod = period
    ? results.filter((result) => result.periodStart.getTime() === period.start.getTime())
    : results;
  // Source verification wins over the owner's own confirmation for the same period.
  const verified = inPeriod.find((result) => result.evidence === "SOURCE_VERIFIED" && result.value !== null);
  const confirmed = inPeriod.find((result) => result.evidence === "OWNER_CONFIRMED" && result.value !== null);
  const latestPrior = results
    .filter((result) => !period || result.periodStart < period.start)
    .sort((a, b) => b.periodStart.getTime() - a.periodStart.getTime())[0];

  const base = {
    goalId: goal.id,
    title: goal.title,
    measureKind: goal.measureKind,
    metric: goal.metricName,
    definition: goal.metricDefinition,
    target: goal.target,
    unit: goal.unit,
    period,
    editHref: goal.owner === "SOURCE" ? goal.sourceUrl : `/projects/progress?goal=${goal.id}`,
    editable: goal.owner !== "SOURCE"
  };

  if (verified && sourceHealthy) {
    return { ...base, value: verified.value, status: "VERIFIED", evidenceLabel: `Reported by ${goal.sourceSystem ? goal.sourceSystem.replace("_", " ").toLowerCase() : "the source"}`, observedAt: verified.observedAt };
  }
  if (verified && !sourceHealthy) {
    return { ...base, value: verified.value, status: "HISTORICAL", evidenceLabel: "Last reported value; source not currently reachable", observedAt: verified.observedAt };
  }
  if (confirmed) {
    return { ...base, value: confirmed.value, status: "CONFIRMED", evidenceLabel: "Your confirmation (not source-verified)", observedAt: confirmed.observedAt };
  }
  if (latestPrior) {
    // Never carried forward as current: shown as history only.
    return { ...base, value: null, status: "UNKNOWN", evidenceLabel: `No result yet this period (last: ${latestPrior.value ?? "unknown"})`, observedAt: null };
  }
  return { ...base, value: null, status: "UNKNOWN", evidenceLabel: "No result reported", observedAt: null };
}
