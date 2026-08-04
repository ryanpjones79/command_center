import {
  deleteExecutionProjectAction,
  markExecutionProjectReviewedAction,
  setExecutionProjectActiveStatusAction,
  toggleExecutionProjectTopThreeAction,
  updateExecutionProjectAction
} from "@/app/execution-actions";
import {
  applyStaleProjectDecisionAction,
  applyStaleTaskDecisionAction
} from "@/app/review/weekly-reset/actions";
import { CreateProjectForm } from "@/components/execution/create-project-form";
import { SubmitButton } from "@/components/execution/submit-button";
import { TaskLineItem } from "@/components/execution/task-line-item";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  executionSelectOptions,
  formatExecutionLabel
} from "@/lib/execution-options";
import type { getExecutionWorkspace, getWeeklyReviewData } from "@/server/execution-service";
import { staleDecisionOptions, type WeeklyResetOutcomes } from "@/server/review-service";

type ReviewData = Awaited<ReturnType<typeof getWeeklyReviewData>>;
type WorkspaceData = Awaited<ReturnType<typeof getExecutionWorkspace>>;

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function daysAgo(value: Date, days: number) {
  const copy = new Date(value);
  copy.setDate(copy.getDate() - days);
  return copy;
}

function taskSignals(
  task: {
    dueDate: Date | null;
    followUpDate: Date | null;
    isBlocked: boolean;
    status: string;
    updatedAt: Date;
    waitingOn: string | null;
  },
  today: Date,
  staleCutoff: Date
) {
  const signals: { label: string; tone: "warning" | "secondary" | "outline" }[] = [];
  if (task.updatedAt < staleCutoff) signals.push({ label: "Needs a decision", tone: "warning" });
  if (task.isBlocked) signals.push({ label: "Blocked", tone: "warning" });
  if (task.status === "WAITING" || task.waitingOn?.trim()) signals.push({ label: "Waiting", tone: "secondary" });
  if (task.dueDate && task.dueDate < today) signals.push({ label: "Needs timing", tone: "warning" });
  if (task.followUpDate && task.followUpDate < today) signals.push({ label: "Follow up", tone: "warning" });
  if (!task.dueDate && !task.followUpDate && !task.waitingOn?.trim()) signals.push({ label: "No date", tone: "outline" });
  return signals;
}

export function DecisionButtons({
  id,
  kind,
  selected
}: {
  id: string;
  kind: "project" | "task";
  selected?: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {staleDecisionOptions.map((decision) => {
        const action =
          kind === "project"
            ? applyStaleProjectDecisionAction.bind(null, id, decision)
            : applyStaleTaskDecisionAction.bind(null, id, decision);
        return (
          <form action={action} key={`${kind}-${id}-${decision}`}>
            <SubmitButton
              className={`h-8 rounded-full border px-3 text-xs font-medium disabled:opacity-60 ${
                selected === decision
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background/50"
              }`}
              pendingLabel="Saving..."
              type="submit"
            >
              {decision}
            </SubmitButton>
          </form>
        );
      })}
    </div>
  );
}

export function ProjectControl({
  review,
  workspace,
  outcomes,
  showAddProject = true
}: {
  review: ReviewData;
  workspace: WorkspaceData;
  outcomes?: WeeklyResetOutcomes;
  showAddProject?: boolean;
}) {
  const today = startOfDay(new Date());
  const staleTaskCutoff = daysAgo(today, 7);
  const { projects, summary } = review;
  const staleTaskCount = projects.reduce(
    (count, project) => count + project.tasks.filter((task) => task.updatedAt < staleTaskCutoff).length,
    0
  );
  const staleTasks = projects.flatMap((project) =>
    project.tasks
      .filter((task) => task.updatedAt < staleTaskCutoff)
      .map((task) => ({ ...task, parentProjectName: project.name }))
  );
  const blockedOrWaitingTaskCount = projects.reduce(
    (count, project) =>
      count +
      project.tasks.filter((task) => task.isBlocked || task.status === "WAITING" || Boolean(task.waitingOn?.trim())).length,
    0
  );

  return (
    <div className="space-y-5">
      <section className="grid gap-4 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Top 3 Projects</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{summary.topThreeCount}</p>
            <p className="mt-2 text-sm text-muted-foreground">Choose the few projects that deserve attention next.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Active Now</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{summary.activeNowCount}</p>
            <p className="mt-2 text-sm text-muted-foreground">Keep this list narrow enough to trust.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Missing Next Action</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{summary.missingNextAction.length}</p>
            <p className="mt-2 text-sm text-muted-foreground">Active projects need one visible next move.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Blocked / Waiting</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">
              {summary.blockedProjects.length} / {summary.waitingProjects.length}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">Name what depends on someone or something else.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Needs Review</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">
              {summary.staleProjects.length} / {staleTaskCount}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">Projects / tasks untouched for a week need a decision.</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        {showAddProject && (
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-base">Add Project</CardTitle>
            </CardHeader>
            <CardContent>
              <CreateProjectForm
                domains={workspace.domains.map((domain) => ({ id: domain.id, name: domain.name }))}
                seasons={workspace.seasons.map((season) => ({
                  id: season.id,
                  isCurrent: season.isCurrent,
                  title: season.title
                }))}
              />
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          {(summary.missingNextAction.length > 0 || summary.staleProjects.length > 0 || staleTaskCount > 0 || blockedOrWaitingTaskCount > 0) && (
            <Card className="border-amber-500/40">
              <CardHeader>
                <CardTitle className="text-base">Decision Prompts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                {summary.missingNextAction.length > 0 && (
                  <div>
                    <p className="font-medium text-foreground">Active projects missing next action</p>
                    <p>{summary.missingNextAction.map((project) => project.name).join(", ")}</p>
                  </div>
                )}
                {summary.staleProjects.length > 0 && (
                  <div>
                    <p className="font-medium text-foreground">Projects needing a decision</p>
                    <div className="mt-2 space-y-2">
                      {summary.staleProjects.map((project) => (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background/45 p-3" key={project.id}>
                          <span>{project.name}</span>
                          <DecisionButtons id={project.id} kind="project" selected={outcomes?.staleDecisions?.[`project:${project.id}`]} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {staleTasks.length > 0 && (
                  <div>
                    <p className="font-medium text-foreground">Tasks needing a decision</p>
                    <div className="mt-2 space-y-2">
                      {staleTasks.map((task) => (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background/45 p-3" key={task.id}>
                          <span>
                            {task.title}
                            <span className="ml-2 text-xs text-muted-foreground">{task.parentProjectName}</span>
                          </span>
                          <DecisionButtons id={task.id} kind="task" selected={outcomes?.staleDecisions?.[`task:${task.id}`]} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {blockedOrWaitingTaskCount > 0 && (
                  <div>
                    <p className="font-medium text-foreground">Blocked / waiting tasks</p>
                    <p>{blockedOrWaitingTaskCount} task{blockedOrWaitingTaskCount === 1 ? "" : "s"} depend on someone or something else.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {projects.length === 0 && (
            <Card>
              <CardContent className="pt-5">
                <p className="text-sm text-muted-foreground">No projects yet. Add only the work you actually want to review weekly.</p>
              </CardContent>
            </Card>
          )}

          {projects.map((project) => {
            const toggleTopThreeAction = toggleExecutionProjectTopThreeAction.bind(null, project.id);
            const setActiveNowAction = setExecutionProjectActiveStatusAction.bind(null, project.id, "ACTIVE_NOW");
            const setActiveLaterAction = setExecutionProjectActiveStatusAction.bind(null, project.id, "ACTIVE_LATER");
            const setParkedAction = setExecutionProjectActiveStatusAction.bind(null, project.id, "PARKED");
            const markReviewedAction = markExecutionProjectReviewedAction.bind(null, project.id);

            return (
              <Card key={project.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg">{project.name}</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">{project.domain.name}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={project.weeklyFocus === "TOP_3" ? "default" : "secondary"}>
                        {formatExecutionLabel(project.weeklyFocus)}
                      </Badge>
                      <Badge variant={project.season ? "secondary" : "outline"}>
                        {project.season?.title ?? "No Season"}
                      </Badge>
                      <Badge variant={project.blocked ? "warning" : "outline"}>
                        {formatExecutionLabel(project.activeStatus)}
                      </Badge>
                      <Badge variant="outline">{formatExecutionLabel(project.priority)}</Badge>
                      {!project.nextAction?.trim() && project.activeStatus === "ACTIVE_NOW" && (
                        <Badge variant="warning">Needs Next Action</Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 lg:grid-cols-5">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Next Action</p>
                      <p className="mt-1 text-sm">{project.nextAction || "Missing next action"}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Waiting On</p>
                      <p className="mt-1 text-sm">{project.waitingOn || "None"}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Status</p>
                      <p className="mt-1 text-sm">{formatExecutionLabel(project.status)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Reviewed</p>
                      <p className="mt-1 text-sm">
                        {(project.lastReviewedAt ?? project.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Updated</p>
                      <p className="mt-1 text-sm">{project.updatedAt.toLocaleDateString()}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <form action={toggleTopThreeAction}>
                      <SubmitButton className="h-8 rounded-md border border-border px-3 text-xs font-medium disabled:opacity-60" pendingLabel="Saving..." type="submit">
                        {project.weeklyFocus === "TOP_3" ? "Remove from Top 3" : "Make Top 3"}
                      </SubmitButton>
                    </form>
                    <form action={setActiveNowAction}>
                      <SubmitButton className="h-8 rounded-md border border-border px-3 text-xs font-medium disabled:opacity-60" pendingLabel="Saving..." type="submit">
                        Active Now
                      </SubmitButton>
                    </form>
                    <form action={setActiveLaterAction}>
                      <SubmitButton className="h-8 rounded-md border border-border px-3 text-xs font-medium disabled:opacity-60" pendingLabel="Saving..." type="submit">
                        Active Later
                      </SubmitButton>
                    </form>
                    <form action={setParkedAction}>
                      <SubmitButton className="h-8 rounded-md border border-border px-3 text-xs font-medium disabled:opacity-60" pendingLabel="Saving..." type="submit">
                        Park
                      </SubmitButton>
                    </form>
                    <form action={markReviewedAction}>
                      <SubmitButton className="h-8 rounded-md border border-border px-3 text-xs font-medium disabled:opacity-60" pendingLabel="Saving..." type="submit">
                        Mark Reviewed
                      </SubmitButton>
                    </form>
                  </div>

                  {project.tasks.length > 0 && (
                    <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Task Health</p>
                        <p className="text-xs text-muted-foreground">{project.tasks.length} open shown, oldest first</p>
                      </div>
                      <div className="mt-3 space-y-2">
                        {project.tasks.map((task) => {
                          const signals = taskSignals(task, today, staleTaskCutoff);
                          return (
                            <div className="rounded-lg border bg-background/70 px-3 py-2" key={task.id}>
                              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Review signals</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {signals.map((signal) => (
                                    <Badge key={`${task.id}-${signal.label}`} variant={signal.tone}>
                                      {signal.label}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                              <TaskLineItem
                                domains={workspace.domains.map((domain) => ({ id: domain.id, name: domain.name }))}
                                projects={workspace.projects.map((projectOption) => ({
                                  id: projectOption.id,
                                  name: projectOption.name,
                                  domainId: projectOption.domainId
                                }))}
                                task={task}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <details className="rounded-lg border border-border/70 p-3">
                    <summary className="cursor-pointer text-sm font-medium">Edit Project</summary>
                    <form action={updateExecutionProjectAction} className="mt-3 grid gap-3">
                      <input name="projectId" type="hidden" value={project.id} />
                      <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue={project.domainId} name="domainId">
                        {workspace.domains.map((domain) => (
                          <option key={domain.id} value={domain.id}>
                            {domain.name}
                          </option>
                        ))}
                      </select>
                      <select
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                        defaultValue={project.seasonId ?? ""}
                        name="seasonId"
                      >
                        <option value="">No season</option>
                        {workspace.seasons.map((season) => (
                          <option key={season.id} value={season.id}>
                            {season.isCurrent ? "Current - " : ""}
                            {season.title}
                          </option>
                        ))}
                      </select>
                      <input className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue={project.name} name="name" required />
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue={project.status} name="status">
                          {executionSelectOptions.projectStatuses.map((value) => (
                            <option key={value} value={value}>
                              {formatExecutionLabel(value)}
                            </option>
                          ))}
                        </select>
                        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue={project.activeStatus} name="activeStatus">
                          {executionSelectOptions.activeStatuses.map((value) => (
                            <option key={value} value={value}>
                              {formatExecutionLabel(value)}
                            </option>
                          ))}
                        </select>
                        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue={project.weeklyFocus} name="weeklyFocus">
                          {executionSelectOptions.weeklyFocuses.map((value) => (
                            <option key={value} value={value}>
                              {formatExecutionLabel(value)}
                            </option>
                          ))}
                        </select>
                        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue={project.priority} name="priority">
                          {executionSelectOptions.priorities.map((value) => (
                            <option key={value} value={value}>
                              {formatExecutionLabel(value)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <input className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue={project.nextAction ?? ""} name="nextAction" placeholder="Next action" />
                      <input className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue={project.waitingOn ?? ""} name="waitingOn" placeholder="Waiting on" />
                      <textarea className="min-h-[96px] rounded-md border border-input bg-background px-3 py-2 text-sm" defaultValue={project.note ?? ""} name="note" />
                      <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <input className="h-4 w-4" defaultChecked={project.blocked} name="blocked" type="checkbox" />
                        Blocked
                      </label>
                      <SubmitButton className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-70" pendingLabel="Saving..." type="submit">
                        Save
                      </SubmitButton>
                    </form>
                    <form action={deleteExecutionProjectAction} className="mt-3">
                      <input name="projectId" type="hidden" value={project.id} />
                      <SubmitButton className="h-9 rounded-md border border-destructive px-4 text-sm text-destructive disabled:opacity-60" pendingLabel="Deleting..." type="submit">
                        Delete Project
                      </SubmitButton>
                    </form>
                  </details>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
