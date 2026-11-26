import type { Metadata } from "next";
import Link from "next/link";
import { ScheduleButton } from "@/components/now/v2-controls";
import { AttentionInput, OutcomeEditor, ProjectsTabs, ProjectStateMenu } from "@/components/projects/project-controls";
import { MakeRoutineButton, NextStepInline, ProjectRow } from "@/components/projects/project-row";
import { NewTaskButton } from "@/components/plan/task-composer";
import { loadQuickTargets } from "@/server/v2/board";
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

type SectionKey = "next" | "book" | "follow" | "moving" | "resting";
const SECTION_OF: Record<CoverageState, SectionKey> = {
  NEEDS_NEXT_ACTION: "next",
  NEEDS_TIME: "book",
  WAITING_OVERDUE: "follow",
  SOURCE_COMPLETE_OPEN: "follow",
  COVERED: "moving",
  WAITING: "moving",
  MONITORING: "moving",
  PAUSED: "resting",
  COMPLETE: "resting",
  CLOSED: "resting"
};
const SECTIONS: { key: SectionKey; title: string; hint: string; tone: string }[] = [
  { key: "next", title: "No task yet", hint: "Add the one task you would do next. Regular work like listing? Use the settings icon to make it a routine.", tone: "bg-amber-400" },
  { key: "book", title: "Needs time", hint: "Has a task but nothing on the calendar. Book time finds the best open slot.", tone: "bg-sky-400" },
  { key: "follow", title: "Follow up", hint: "Waiting too long, or closed with work still open.", tone: "bg-rose-400" },
  { key: "moving", title: "On track", hint: "Its next task has time booked, or it is waiting on someone.", tone: "bg-emerald-400" },
  { key: "resting", title: "Paused and done", hint: "", tone: "bg-slate-400" }
];

function hours(minutes: number) {
  return Math.round((minutes / 60) * 10) / 10;
}

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const now = new Date();
  const params = await searchParams;
  const areaParam = typeof params.area === "string" ? params.area : null;
  const [projects, weekly, settings, targets] = await Promise.all([loadProjectCoverage(user.id, prisma, now), loadWeekly(user.id, prisma, now), loadDaySettings(user.id, prisma), loadQuickTargets(user.id, prisma)]);
  const tz = settings.timeZone;
  const planned = new Map(weekly.allocations.map((row) => [row.projectId, row]));
  const plannedTotal = weekly.allocations.reduce((sum, row) => sum + row.plannedMinutes, 0);
  const plannedCount = weekly.allocations.filter((row) => row.plannedMinutes > 0).length;

  const areas: { slug: string; name: string; count: number; attention: number }[] = [];
  for (const project of projects) {
    let area = areas.find((item) => item.slug === project.domain.slug);
    if (!area) areas.push((area = { slug: project.domain.slug, name: project.domain.name, count: 0, attention: 0 }));
    area.count += 1;
    if (COVERAGE_NEEDS_DECISION.includes(project.coverage.state)) area.attention += 1;
  }
  const area = areas.find((item) => item.slug === areaParam) ?? null;
  const shown = area ? projects.filter((project) => project.domain.slug === area.slug) : projects;
  const areaOrder = (slug: string) => areas.findIndex((item) => item.slug === slug);
  const bySection = new Map<SectionKey, typeof shown>();
  for (const project of shown) {
    const key = SECTION_OF[project.coverage.state];
    bySection.set(key, [...(bySection.get(key) ?? []), project]);
  }
  for (const list of bySection.values()) {
    list.sort((a, b) => areaOrder(a.domain.slug) - areaOrder(b.domain.slug) || (planned.get(b.id)?.plannedMinutes ?? 0) - (planned.get(a.id)?.plannedMinutes ?? 0));
  }

  const capacity = Math.max(weekly.capacityMinutes, plannedTotal, 1);
  const bookedPct = Math.min(100, (weekly.scheduledMinutes / capacity) * 100);
  const plannedPct = Math.min(100, (plannedTotal / capacity) * 100);
  const over = plannedTotal > weekly.capacityMinutes;
  const chip = (active: boolean) =>
    `inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors ${active ? "border-transparent bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground"}`;

  const settingsFor = (project: (typeof projects)[number]) => (
    <>
      <OutcomeEditor outcome={project.desiredOutcome} projectId={project.id} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AttentionInput hours={hours(planned.get(project.id)?.plannedMinutes ?? 0)} projectId={project.id} />
        <NewTaskButton label="+ Task with a date or time" presetId={project.id} targets={targets} timeZone={tz} variant="chip" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <ProjectStateMenu projectId={project.id} />
        <MakeRoutineButton projectId={project.id} />
        <p className="text-xs text-muted-foreground">
          {project.sourceSystem ? `From ${project.sourceSystem.replace("_", " ").toLowerCase()}` : "Made in RyanOS"}
          {project.sourceUrl && <> · <a className="underline underline-offset-2" href={project.sourceUrl} rel="noopener noreferrer" target="_blank">open source</a></>}
          {" · "}last progress {project.coverage.lastMeaningfulStepAt ? project.coverage.lastMeaningfulStepAt.toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric" }) : "none recorded"}
        </p>
      </div>
    </>
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">This week</p>
          <h1 className="font-display mt-1 text-3xl font-medium tracking-tight sm:text-4xl">Projects</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ProjectsTabs />
          <Link className="inline-flex h-10 items-center rounded-full border bg-card px-4 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground" href="/plan/routines" title="Regular work that fills free time">Routines</Link>
          <Link className="inline-flex h-10 items-center rounded-full border bg-card px-4 text-sm font-semibold hover:bg-muted" href="/projects/manage">+ New project</Link>
        </div>
      </header>

      <section aria-label="Your week" className="rounded-2xl border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <p className="text-sm text-muted-foreground">
            <span className="mr-1.5 text-3xl font-bold tabular-nums tracking-tight text-foreground">{hours(weekly.capacityMinutes)}h</span>
            of focus time left this week
          </p>
          <nav aria-label="Jump to" className="flex flex-wrap gap-2">
            {SECTIONS.filter((section) => section.key !== "resting" && section.key !== "moving" && (bySection.get(section.key)?.length ?? 0) > 0).map((section) => (
              <a className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs font-semibold hover:bg-muted/70" href={`#${section.key}`} key={section.key}>
                <span aria-hidden className={`h-2 w-2 rounded-full ${section.tone}`} />
                {bySection.get(section.key)?.length} {section.title.toLowerCase()}
              </a>
            ))}
          </nav>
        </div>
        <div aria-hidden className="relative mt-4 h-2.5 overflow-hidden rounded-full bg-muted">
          <div className={`absolute inset-y-0 left-0 rounded-full ${over ? "bg-amber-500/35" : "bg-primary/25"}`} style={{ width: `${plannedPct}%` }} />
          <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${bookedPct}%` }} />
        </div>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rounded-full bg-primary" />{hours(weekly.scheduledMinutes)}h booked</span>
          <span className="inline-flex items-center gap-1.5"><span aria-hidden className={`h-2 w-2 rounded-full ${over ? "bg-amber-500/60" : "bg-primary/30"}`} />{hours(plannedTotal)}h planned across {plannedCount} project{plannedCount === 1 ? "" : "s"}</span>
          {over && <span className="font-medium text-amber-600 dark:text-amber-300">Planned is {hours(plannedTotal - weekly.capacityMinutes)}h more than fits</span>}
        </p>
      </section>

      <nav aria-label="Areas" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        <Link aria-current={!area ? "page" : undefined} className={chip(!area)} href="/projects">All <span className="tabular-nums opacity-60">{projects.length}</span></Link>
        {areas.map((item) => (
          <Link aria-current={area?.slug === item.slug ? "page" : undefined} className={chip(area?.slug === item.slug)} href={`/projects?area=${item.slug}`} key={item.slug}>
            <span aria-hidden className={`h-2 w-2 rounded-full ${areaLook(item.slug).dot}`} />
            {item.name}
            <span className="tabular-nums opacity-60">{item.count}</span>
          </Link>
        ))}
      </nav>

      {SECTIONS.map((section) => {
        const list = bySection.get(section.key) ?? [];
        if (list.length === 0) return null;
        const rows = list.map((project) => {
          const coverage = project.coverage;
          const allocation = planned.get(project.id);
          const plannedMin = allocation?.plannedMinutes ?? 0;
          const bookedMin = allocation?.reservedMinutes ?? 0;
          const name = (
            <p className="flex min-w-0 items-center gap-2">
              <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${areaLook(project.domain.slug).dot}`} />
              <span className="truncate font-semibold">{project.name}</span>
              {!area && <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{project.domain.name}</span>}
            </p>
          );
          let detail: React.ReactNode;
          let action: React.ReactNode = null;
          if (section.key === "next") {
            detail = project.desiredOutcome ? <span>{project.desiredOutcome}</span> : <span className="italic">No outcome set yet</span>;
            action = <NextStepInline projectId={project.id} />;
          } else if (section.key === "book") {
            detail = <><span className="text-foreground">Next task: {coverage.nextAction?.title}</span>{plannedMin > 0 && <> · {hours(plannedMin)}h planned this week</>}</>;
            action = coverage.nextAction ? <ScheduleButton compact label="Book time" taskId={coverage.nextAction.id} /> : null;
          } else if (section.key === "moving") {
            detail = coverage.nextAction ? (
              <>
                <span className="text-foreground">Next task: {coverage.nextAction.title}</span>
                {coverage.reservedAt && <> · {coverage.reservedAt.toLocaleDateString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" })} {localClock(coverage.reservedAt, tz)}</>}
              </>
            ) : coverage.message;
            action = plannedMin > 0 ? (
              <div className="w-full sm:w-36">
                <p className="text-right text-xs tabular-nums text-muted-foreground">{hours(bookedMin)} of {hours(plannedMin)}h booked</p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${areaLook(project.domain.slug).dot}`} style={{ width: `${Math.min(100, Math.round((bookedMin / plannedMin) * 100))}%` }} /></div>
              </div>
            ) : null;
          } else {
            detail = coverage.message;
            if (section.key === "follow") action = <NewTaskButton label="+ Add a follow-up" presetId={project.id} targets={targets} timeZone={tz} variant="chip" />;
          }
          return (
            <ProjectRow action={<div className="flex items-center justify-end gap-2">{action}{section.key !== "follow" && section.key !== "next" && <NewTaskButton label="+ Add task" presetId={project.id} targets={targets} timeZone={tz} variant="chip" />}</div>} id={project.id} key={project.id} settings={settingsFor(project)}>
              {name}
              <p className="mt-0.5 line-clamp-2 pl-4 text-sm text-muted-foreground">{detail}</p>
            </ProjectRow>
          );
        });
        const body = <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border bg-card">{rows}</ul>;
        if (section.key === "resting") {
          return (
            <details className="group" id={section.key} key={section.key}>
              <summary className="flex cursor-pointer list-none items-center gap-2.5 px-1 text-sm font-semibold text-muted-foreground [&::-webkit-details-marker]:hidden">
                <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${section.tone}`} />
                {section.title} <span className="tabular-nums font-normal">{list.length}</span>
                <span className="text-xs font-normal underline underline-offset-2 group-open:hidden">show</span>
              </summary>
              <div className="mt-3">{body}</div>
            </details>
          );
        }
        return (
          <section aria-labelledby={`${section.key}-title`} className="scroll-mt-20 space-y-2.5" id={section.key} key={section.key}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-1">
              <h2 className="flex items-center gap-2.5 text-base font-semibold" id={`${section.key}-title`}>
                <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${section.tone}`} />
                {section.title}
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">{list.length}</span>
              </h2>
              <p className="text-xs text-muted-foreground">{section.hint}</p>
            </div>
            {body}
          </section>
        );
      })}
      {projects.length === 0 && <p className="text-sm text-muted-foreground">No projects yet. <Link className="underline" href="/projects/manage">Add one</Link>.</p>}
    </div>
  );
}
