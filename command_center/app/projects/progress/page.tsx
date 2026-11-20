import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmResult, NewGoalForm } from "@/components/projects/goal-controls";
import { ProjectsTabs } from "@/components/projects/project-controls";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { summarizeGoal } from "@/lib/v2/progress";
import { loadDaySettings } from "@/server/v2/schedule-service";

export const metadata: Metadata = { title: "Progress" };
export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  VERIFIED: "bg-primary/10 text-primary",
  CONFIRMED: "bg-sky-500/10 text-sky-800 dark:text-sky-200",
  HISTORICAL: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  UNKNOWN: "bg-muted text-muted-foreground"
};
const STATUS_LABEL: Record<string, string> = { VERIFIED: "Source-verified", CONFIRMED: "Your confirmation", HISTORICAL: "Historical", UNKNOWN: "Unknown" };
const KIND_LABEL: Record<string, string> = { OUTCOME: "Outcome", ACTION: "Action", CONSTRAINT: "Constraint" };

export default async function ProgressPage() {
  const user = await requireUser();
  const now = new Date();
  const [settings, goals, syncs, projects] = await Promise.all([
    loadDaySettings(user.id, prisma),
    prisma.goal.findMany({
      where: { userId: user.id, active: true },
      include: { results: { orderBy: { periodStart: "desc" }, take: 12 }, project: { select: { id: true, name: true } } },
      orderBy: [{ owner: "asc" }, { title: "asc" }]
    }),
    prisma.sourceSync.findMany({ where: { userId: user.id }, select: { sourceSystem: true, status: true } }),
    prisma.executionProject.findMany({ where: { userId: user.id, closedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } })
  ]);
  const failing = new Set(syncs.filter((sync) => sync.status === "FAILING").map((sync) => sync.sourceSystem));
  const tz = settings.timeZone;

  // Every exception should lead to an action or a decision.
  const nextActions = await prisma.executionTask.findMany({
    where: {
      userId: user.id,
      status: { notIn: ["DONE", "DROPPED"] },
      OR: [{ goalKey: { in: goals.flatMap((goal) => [goal.id, goal.sourceKey ?? ""]).filter(Boolean) } }, { projectId: { in: goals.map((goal) => goal.projectId ?? "").filter(Boolean) } }]
    },
    select: { id: true, title: true, goalKey: true, projectId: true, scheduledStart: true },
    orderBy: { createdAt: "asc" }
  });

  return (
    <div className="space-y-5">
      <ProjectsTabs />
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Progress</h1>
        <p className="mt-1 text-sm text-muted-foreground">One meaningful result per goal, with where it comes from. Details stay in each source app.</p>
      </header>

      {goals.length === 0 && <p className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">No goals yet. Source apps can report theirs; add a personal one below.</p>}

      <ul className="grid gap-3 md:grid-cols-2">
        {goals.map((goal) => {
          const summary = summarizeGoal(goal, goal.results, now, tz, !failing.has(goal.sourceSystem ?? ""));
          const action = nextActions.find((task) => task.goalKey === goal.id || (goal.sourceKey && task.goalKey === goal.sourceKey)) ?? nextActions.find((task) => goal.projectId && task.projectId === goal.projectId);
          const exception = summary.status === "UNKNOWN" || summary.status === "HISTORICAL" || (goal.target !== null && summary.value !== null && summary.value < goal.target && goal.measureKind !== "CONSTRAINT") || (goal.measureKind === "CONSTRAINT" && goal.target !== null && summary.value !== null && summary.value > goal.target);
          return (
            <li className="flex flex-col rounded-2xl border bg-card p-5" key={goal.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="break-words font-semibold">{goal.title}</h2>
                  <p className="text-xs text-muted-foreground">
                    {[KIND_LABEL[goal.measureKind] ?? goal.measureKind, goal.owner === "SOURCE" ? `owned by ${goal.sourceSystem?.replace("_", " ").toLowerCase() ?? "source"}` : "personal", goal.project?.name].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[summary.status]}`}>{STATUS_LABEL[summary.status]}</span>
              </div>
              {goal.desiredOutcome && <p className="mt-2 text-sm">{goal.desiredOutcome}</p>}
              <p className="mt-3 text-3xl font-semibold tabular-nums">
                {summary.value ?? "—"}
                {goal.target !== null && <span className="text-base font-normal text-muted-foreground"> / {goal.target}{goal.unit ? ` ${goal.unit}` : ""}</span>}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {summary.metric ?? "Result"}
                {summary.period && ` · ${summary.period.start.toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric" })}–${new Date(summary.period.end.getTime() - 1).toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric" })}`}
                {" · "}{summary.evidenceLabel}
              </p>
              {summary.definition && <p className="mt-1 text-xs text-muted-foreground">Counts: {summary.definition}</p>}

              <div className="mt-4 space-y-2 border-t pt-3 text-sm">
                {exception && (action ? (
                  <p>Next: <Link className="font-medium underline underline-offset-4" href={`/tasks?taskId=${encodeURIComponent(action.id)}`}>{action.title}</Link>{action.scheduledStart ? "" : " (no time yet)"}</p>
                ) : (
                  <p className="text-amber-800 dark:text-amber-200">No action is moving this. Decide one in <Link className="underline" href={goal.projectId ? `/projects#project-${goal.projectId}` : "/projects"}>Projects</Link>.</p>
                ))}
                {goal.owner === "RYANOS" ? (
                  <ConfirmResult goalId={goal.id} unit={goal.unit} />
                ) : summary.editHref ? (
                  <a className="font-medium text-primary underline underline-offset-4" href={summary.editHref} rel="noopener noreferrer" target="_blank">Edit in {goal.sourceSystem?.replace("_", " ").toLowerCase() ?? "source"}</a>
                ) : (
                  <p className="text-xs text-muted-foreground">Edit this in its source app.</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <details className="rounded-2xl border bg-card p-5">
        <summary className="cursor-pointer font-semibold">Add a personal goal</summary>
        <p className="mt-2 text-sm text-muted-foreground">For commitments RyanOS owns (family, health, personal). Business targets belong to their source apps.</p>
        <div className="mt-4"><NewGoalForm projects={projects} /></div>
      </details>
    </div>
  );
}
