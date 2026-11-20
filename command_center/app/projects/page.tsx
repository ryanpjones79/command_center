import type { Metadata } from "next";
import Link from "next/link";
import { ScheduleButton } from "@/components/now/v2-controls";
import { AttentionInput, NextStepForm, OutcomeEditor, ProjectsTabs, ProjectStateMenu } from "@/components/projects/project-controls";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { COVERAGE_NEEDS_DECISION, type CoverageState } from "@/lib/v2/coverage";
import { localClock } from "@/lib/v2/zoned-time";
import { loadProjectCoverage } from "@/server/v2/day";
import { loadDaySettings } from "@/server/v2/schedule-service";
import { loadWeekly } from "@/server/v2/weekly";

export const metadata: Metadata = { title: "Projects" };
export const dynamic = "force-dynamic";

const STATE_LABEL: Record<CoverageState, string> = {
  COVERED: "Has time",
  NEEDS_TIME: "Needs time",
  NEEDS_NEXT_ACTION: "Needs a next step",
  WAITING: "Waiting",
  WAITING_OVERDUE: "Waiting: follow-up overdue",
  MONITORING: "Monitoring",
  PAUSED: "Paused",
  SOURCE_COMPLETE_OPEN: "Open obligations",
  COMPLETE: "Complete",
  CLOSED: "Closed"
};

function hours(minutes: number) {
  return Math.round((minutes / 60) * 10) / 10;
}

export default async function ProjectsPage() {
  const user = await requireUser();
  const now = new Date();
  const [projects, weekly, settings] = await Promise.all([loadProjectCoverage(user.id, prisma, now), loadWeekly(user.id, prisma, now), loadDaySettings(user.id, prisma)]);
  const tz = settings.timeZone;
  const planned = new Map(weekly.allocations.map((row) => [row.projectId, row]));
  const selected = projects.filter((project) => planned.has(project.id) && (planned.get(project.id)?.plannedMinutes ?? 0) > 0);
  const plannedTotal = weekly.allocations.reduce((sum, row) => sum + row.plannedMinutes, 0);
  const starved = selected.filter((project) => (planned.get(project.id)?.reservedMinutes ?? 0) === 0);
  const needsDecision = projects.filter((project) => COVERAGE_NEEDS_DECISION.includes(project.coverage.state));
  const ordered = [...needsDecision, ...projects.filter((project) => !needsDecision.includes(project))];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ProjectsTabs />
        <Link className="inline-flex min-h-10 items-center rounded-lg px-2 text-sm text-muted-foreground underline-offset-4 hover:underline" href="/projects/manage">Add or edit projects</Link>
      </div>

      <section aria-labelledby="weekly-title" className="rounded-2xl border bg-card p-5 sm:p-6">
        <h1 className="text-lg font-semibold tracking-tight" id="weekly-title">This week&apos;s attention</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          About {hours(weekly.capacityMinutes)} h of focus time left this week before meetings; {hours(weekly.scheduledMinutes)} h already booked.
          You&apos;ve set {hours(plannedTotal)} h across {selected.length} project{selected.length === 1 ? "" : "s"}.
          {plannedTotal > weekly.capacityMinutes ? " That's more than fits; trim something." : ""}
        </p>
        {starved.length > 0 && (
          <p className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            No time booked yet this week for: {starved.map((project) => project.name).join(", ")}.
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">Set hours on the projects you mean to advance. Others can rest; not every area needs time every week.</p>
      </section>

      <ul className="space-y-3">
        {ordered.map((project) => {
          const coverage = project.coverage;
          const decision = COVERAGE_NEEDS_DECISION.includes(coverage.state);
          const allocation = planned.get(project.id);
          return (
            <li className="scroll-mt-20 rounded-2xl border bg-card p-5" id={`project-${project.id}`} key={project.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="break-words text-lg font-semibold">{project.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {[project.domain.name, project.sourceSystem ? `from ${project.sourceSystem.replace("_", " ").toLowerCase()}` : null].filter(Boolean).join(" · ")}
                    {project.sourceUrl && <> · <a className="underline underline-offset-2" href={project.sourceUrl} rel="noopener noreferrer" target="_blank">source</a></>}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${decision ? "bg-amber-500/15 text-amber-800 dark:text-amber-200" : coverage.state === "COVERED" || coverage.state === "MONITORING" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {STATE_LABEL[coverage.state]}
                </span>
              </div>

              <div className="mt-3 space-y-2">
                <OutcomeEditor outcome={project.desiredOutcome} projectId={project.id} />
                <p className="text-sm text-muted-foreground">{coverage.message}</p>
                {coverage.nextAction && (
                  <p className="text-[15px]">
                    <span className="text-muted-foreground">Next: </span>
                    <span className="font-medium">{coverage.nextAction.title}</span>
                    {coverage.reservedAt && <span className="text-muted-foreground"> · {coverage.reservedAt.toLocaleDateString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" })} {localClock(coverage.reservedAt, tz)}</span>}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Last real progress: {coverage.lastMeaningfulStepAt ? coverage.lastMeaningfulStepAt.toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric" }) : "none recorded"}
                  {" · "}{coverage.openCount} open
                </p>
              </div>

              <div className="mt-4 space-y-3">
                {coverage.state === "NEEDS_TIME" && coverage.nextAction && <ScheduleButton label="Give it time" taskId={coverage.nextAction.id} />}
                {(coverage.state === "NEEDS_NEXT_ACTION" || coverage.state === "COVERED" || coverage.state === "NEEDS_TIME") && (
                  <details className="group" open={coverage.state === "NEEDS_NEXT_ACTION"}>
                    <summary className="cursor-pointer text-sm font-medium text-muted-foreground group-open:text-foreground">Add a next step</summary>
                    <div className="mt-2"><NextStepForm projectId={project.id} /></div>
                  </details>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                  <AttentionInput hours={hours(allocation?.plannedMinutes ?? 0)} projectId={project.id} />
                  <ProjectStateMenu projectId={project.id} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {projects.length === 0 && <p className="text-sm text-muted-foreground">No projects yet. <Link className="underline" href="/projects/manage">Add one</Link>.</p>}
    </div>
  );
}
