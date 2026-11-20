// Project coverage, derived from existing records (no manual status upkeep).
//
// A project is covered only when its next concrete action has reserved time
// or a dated follow-up. Changing dates or descriptions is not progress: the
// last meaningful step is the latest completion or source verification.

export type CoverageState =
  | "COVERED" // next action has time reserved or a dated follow-up
  | "NEEDS_TIME" // next action exists but nothing reserved
  | "NEEDS_NEXT_ACTION" // active project with no open action
  | "WAITING" // only waiting items, follow-up still in the future
  | "WAITING_OVERDUE" // a waiting follow-up date has passed
  | "MONITORING" // healthy watch, nothing to do (valid; no manufactured work)
  | "PAUSED"
  | "SOURCE_COMPLETE_OPEN" // source says complete but obligations remain open
  | "COMPLETE"
  | "CLOSED";

export type CoverageTask = {
  id: string;
  title: string;
  status: string;
  isBlocked: boolean;
  scheduledStart: Date | null;
  followUpDate: Date | null;
  dueDate: Date | null;
  expiresAt: Date | null;
  completedAt: Date | null;
  sourceVerifiedAt: Date | null;
  createdAt: Date;
};

export type CoverageProject = {
  activeStatus: string;
  monitoring: boolean;
  closedAt: Date | null;
  sourceStatus: string | null;
};

export type Coverage = {
  state: CoverageState;
  nextAction: CoverageTask | null;
  reservedAt: Date | null; // next scheduled block or dated follow-up
  lastMeaningfulStepAt: Date | null;
  openCount: number;
  message: string;
};

const OPEN = (task: CoverageTask) => task.status !== "DONE" && task.status !== "DROPPED";

function earliest(dates: (Date | null)[]) {
  const valid = dates.filter((value): value is Date => value instanceof Date);
  return valid.length ? new Date(Math.min(...valid.map((value) => value.getTime()))) : null;
}

export function deriveCoverage(project: CoverageProject, tasks: CoverageTask[], now: Date): Coverage {
  const open = tasks.filter(OPEN);
  const lastMeaningfulStepAt =
    tasks
      .flatMap((task) => [task.status === "DONE" ? task.completedAt : null, task.sourceVerifiedAt])
      .filter((value): value is Date => value instanceof Date)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const base = { lastMeaningfulStepAt, openCount: open.length };

  if (project.closedAt) return { ...base, state: "CLOSED", nextAction: null, reservedAt: null, message: "Closed." };

  const sourceComplete = (project.sourceStatus ?? "").toUpperCase() === "COMPLETE";
  if (sourceComplete && open.length > 0) {
    return {
      ...base,
      state: "SOURCE_COMPLETE_OPEN",
      nextAction: open[0],
      reservedAt: null,
      message: `Source marks this complete, but ${open.length} obligation${open.length === 1 ? " is" : "s are"} still open.`
    };
  }
  if (project.activeStatus === "PARKED" || project.activeStatus === "ACTIVE_LATER") {
    return { ...base, state: "PAUSED", nextAction: null, reservedAt: null, message: "Paused on purpose." };
  }

  const actionable = open
    .filter((task) => task.status !== "WAITING" && !task.isBlocked && !(task.expiresAt && task.expiresAt < now))
    .sort((a, b) => {
      const key = (task: CoverageTask) => (task.scheduledStart ?? task.dueDate ?? task.createdAt).getTime();
      return key(a) - key(b);
    });

  if (actionable.length > 0) {
    const next = actionable[0];
    const reservedAt = earliest([
      next.scheduledStart && next.scheduledStart >= new Date(now.getTime() - 60 * 60_000) ? next.scheduledStart : null,
      next.followUpDate && next.followUpDate >= now ? next.followUpDate : null
    ]);
    return reservedAt
      ? { ...base, state: "COVERED", nextAction: next, reservedAt, message: "Next step has time." }
      : { ...base, state: "NEEDS_TIME", nextAction: next, reservedAt: null, message: "Next step has no time reserved." };
  }

  const waiting = open.filter((task) => task.status === "WAITING" || task.isBlocked);
  if (waiting.length > 0) {
    const overdue = waiting.some((task) => task.followUpDate && task.followUpDate < now);
    const followUp = earliest(waiting.map((task) => (task.followUpDate && task.followUpDate >= now ? task.followUpDate : null)));
    return overdue
      ? { ...base, state: "WAITING_OVERDUE", nextAction: waiting[0], reservedAt: null, message: "A waiting follow-up date has passed." }
      : { ...base, state: "WAITING", nextAction: waiting[0], reservedAt: followUp, message: followUp ? "Waiting; follow-up is dated." : "Waiting; no follow-up date set." };
  }

  if (open.length > 0) {
    // Only expired opportunities remain: they still need an explicit decision.
    return { ...base, state: "NEEDS_NEXT_ACTION", nextAction: open[0], reservedAt: null, message: "Only expired items remain. Decide what's next." };
  }
  if (project.monitoring) return { ...base, state: "MONITORING", nextAction: null, reservedAt: null, message: "Monitoring. Nothing needs you." };
  if (project.activeStatus === "COMPLETED" || sourceComplete) return { ...base, state: "COMPLETE", nextAction: null, reservedAt: null, message: "Complete." };
  return { ...base, state: "NEEDS_NEXT_ACTION", nextAction: null, reservedAt: null, message: "No next step. Decide what moves this forward." };
}

export const COVERAGE_NEEDS_DECISION: CoverageState[] = ["NEEDS_TIME", "NEEDS_NEXT_ACTION", "WAITING_OVERDUE", "SOURCE_COMPLETE_OPEN"];
