import type { Metadata } from "next";
import Link from "next/link";
import { ScheduleButton } from "@/components/now/v2-controls";
import { AttentionInput, NextStepForm, OutcomeEditor, ProjectsTabs, ProjectStateMenu } from "@/components/projects/project-controls";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { areaLook } from "@/lib/v2/area-look";
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

  // Group by area, keeping projects that need a decision first within each area.
  const groups: { slug: string; name: string; items: typeof ordered }[] = [];
  for (const project of ordered) {
    const group = groups.find((item) => item.slug === project.domain.slug);
    if (group) group.items.push(project);
    else groups.push({ slug: project.domain.slug, name: project.domain.name, items: [project] });
  }
  const over = plannedTotal > weekly.capacityMinutes;
  const tiles = [
    { label: "Focus time left", value: `${hours(weekly.capacityMinutes)}h`, note: "this week, outside meetings", warn: false },
    { label: "Already booked", value: `${hours(weekly.scheduledMinutes)}h`, note: "on the calendar", warn: false },
    { label: "Hours you set", value: `${hours(plannedTotal)}h`, note: `${selected.length} project${selected.length === 1 ? "" : "s"}${over ? " · more than fits" : ""}`, warn: over },
    { label: "Need a decision", value: String(needsDecision.length), note: needsDecision.length ? "shown first below" : "all clear", warn: needsDecision.length > 0 }
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">This week</p>
          <h1 className="font-display mt-1 text-3xl font-medium tracking-tight sm:text-4xl">Projects</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ProjectsTabs />
          <Link className="inline-flex h-10 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground" href="/projects/manage">+ Add or edit</Link>
        </div>
      </header>

      <section aria-label="Attention this week" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div className={`rounded-2xl border bg-card p-4 ${tile.warn ? "border-amber-500/40" : ""}`} key={tile.label}>
            <p className="text-xs text-muted-foreground">{tile.label}</p>
            <p className={`mt-1 text-3xl font-bold tabular-nums tracking-tight ${tile.warn ? "text-amber-500" : ""}`}>{tile.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{tile.note}</p>
          </div>
        ))}
      </section>
      {starved.length > 0 && (
        <p className="rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 to-transparent px-4 py-3 text-sm">
          <span className="font-semibold">No time booked yet</span> for {starved.map((project) => project.name).join(", ")}.
        </p>
      )}

      {groups.map((group) => (
        <section aria-label={group.name} className="space-y-3" key={group.slug}>
          <h2 className="flex items-center gap-2.5 px-1 text-sm font-semibold">
            <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${areaLook(group.slug).dot}`} />
            {group.name}
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">{group.items.length}</span>
          </h2>
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {group.items.map((project) => {
              const coverage = project.coverage;
              const decision = COVERAGE_NEEDS_DECISION.includes(coverage.state);
              const allocation = planned.get(project.id);
              const plannedMin = allocation?.plannedMinutes ?? 0;
              const bookedMin = allocation?.reservedMinutes ?? 0;
              return (
                <li className={`flex scroll-mt-20 flex-col rounded-2xl border bg-card p-4 transition-all hover:-translate-y-0.5 ${decision ? "border-amber-500/40" : ""}`} id={`project-${project.id}`} key={project.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="break-words font-semibold leading-snug">{project.name}</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {project.sourceSystem ? `from ${project.sourceSystem.replace("_", " ").toLowerCase()}` : "RyanOS"}
                        {project.sourceUrl && <> · <a className="underline underline-offset-2" href={project.sourceUrl} rel="noopener noreferrer" target="_blank">source</a></>}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${decision ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : coverage.state === "COVERED" || coverage.state === "MONITORING" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {STATE_LABEL[coverage.state]}
                    </span>
                  </div>

                  <p className={`mt-2 text-sm ${project.desiredOutcome ? "" : "text-muted-foreground"}`}>{project.desiredOutcome ? project.desiredOutcome : "No outcome set yet."}</p>

                  <div className={`mt-3 rounded-xl border border-l-[3px] px-3 py-2 ${areaLook(group.slug).card}`}>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Next step</p>
                    {coverage.nextAction ? (
                      <p className="text-sm font-medium leading-snug">
                        {coverage.nextAction.title}
                        {coverage.reservedAt && <span className="font-normal text-muted-foreground"> · {coverage.reservedAt.toLocaleDateString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" })} {localClock(coverage.reservedAt, tz)}</span>}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">{coverage.message}</p>
                    )}
                  </div>

                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>This week</span>
                      <span className="tabular-nums">{plannedMin ? `${hours(bookedMin)} of ${hours(plannedMin)}h booked` : "no hours set"}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className={`h-full rounded-full ${areaLook(group.slug).dot}`} style={{ width: `${plannedMin ? Math.min(100, Math.round((bookedMin / plannedMin) * 100)) : 0}%` }} />
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {coverage.openCount} open · last progress {coverage.lastMeaningfulStepAt ? coverage.lastMeaningfulStepAt.toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric" }) : "none recorded"}
                  </p>

                  <div className="mt-auto space-y-3 pt-3">
                    {coverage.state === "NEEDS_TIME" && coverage.nextAction && <ScheduleButton label="Give it time" taskId={coverage.nextAction.id} />}
                    <details className="group rounded-xl border bg-background/40 px-3 py-2">
                      <summary className={`cursor-pointer list-none text-sm font-medium [&::-webkit-details-marker]:hidden ${coverage.state === "NEEDS_NEXT_ACTION" ? "text-amber-600 dark:text-amber-300" : "text-muted-foreground"} group-open:text-foreground`}>
                        {coverage.state === "NEEDS_NEXT_ACTION" ? "+ Add a next step" : "Edit outcome, next step, hours"}
                      </summary>
                      <div className="mt-3 space-y-3">
                        <OutcomeEditor outcome={project.desiredOutcome} projectId={project.id} />
                        {(coverage.state === "NEEDS_NEXT_ACTION" || coverage.state === "COVERED" || coverage.state === "NEEDS_TIME") && <NextStepForm projectId={project.id} />}
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                          <AttentionInput hours={hours(plannedMin)} projectId={project.id} />
                          <ProjectStateMenu projectId={project.id} />
                        </div>
                      </div>
                    </details>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {projects.length === 0 && <p className="text-sm text-muted-foreground">No projects yet. <Link className="underline" href="/projects/manage">Add one</Link>.</p>}
    </div>
  );
}
