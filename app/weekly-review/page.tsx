import {
  deleteExecutionProjectAction,
  markExecutionProjectReviewedAction,
  setExecutionProjectActiveStatusAction,
  toggleExecutionProjectTopThreeAction,
  updateExecutionProjectAction
} from "@/app/execution-actions";
import { CreateProjectForm } from "@/components/execution/create-project-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { executionSelectOptions, formatExecutionLabel } from "@/lib/execution-options";
import { requireUser } from "@/lib/session";
import { getExecutionWorkspace, getWeeklyReviewData } from "@/server/execution-service";

export default async function WeeklyReviewPage() {
  const user = await requireUser();
  const [{ projects, summary }, workspace] = await Promise.all([
    getWeeklyReviewData(user.id),
    getExecutionWorkspace(user.id)
  ]);

  return (
    <main className="space-y-6">
      <section>
        <p className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Weekly Review</p>
        <h2 className="text-4xl font-semibold tracking-tight">Project Control</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Weekly review is where you keep the system honest: choose your Top 3, park non-active work, and make sure every active project has one clear next action.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Top 3 Projects</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{summary.topThreeCount}</p>
            <p className="mt-2 text-sm text-muted-foreground">Target is 3. Promote or demote projects with one click below.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Active Now</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{summary.activeNowCount}</p>
            <p className="mt-2 text-sm text-muted-foreground">Keep this list tight so Today stays execution-oriented.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Missing Next Action</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{summary.missingNextAction.length}</p>
            <p className="mt-2 text-sm text-muted-foreground">Active projects without a next action create drag immediately.</p>
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
            <p className="mt-2 text-sm text-muted-foreground">Review what is blocked and who still owes you something.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Stale Projects</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{summary.staleProjects.length}</p>
            <p className="mt-2 text-sm text-muted-foreground">Anything untouched for a week should be reviewed or parked.</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Add Project</CardTitle>
          </CardHeader>
          <CardContent>
            <CreateProjectForm domains={workspace.domains.map((domain) => ({ id: domain.id, name: domain.name }))} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          {(summary.missingNextAction.length > 0 || summary.staleProjects.length > 0) && (
            <Card className="border-amber-500/40">
              <CardHeader>
                <CardTitle className="text-base">Review Prompts</CardTitle>
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
                    <p className="font-medium text-foreground">Stale projects needing a review</p>
                    <p>{summary.staleProjects.map((project) => project.name).join(", ")}</p>
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
                      <button className="h-8 rounded-md border border-border px-3 text-xs font-medium" type="submit">
                        {project.weeklyFocus === "TOP_3" ? "Remove from Top 3" : "Make Top 3"}
                      </button>
                    </form>
                    <form action={setActiveNowAction}>
                      <button className="h-8 rounded-md border border-border px-3 text-xs font-medium" type="submit">
                        Active Now
                      </button>
                    </form>
                    <form action={setActiveLaterAction}>
                      <button className="h-8 rounded-md border border-border px-3 text-xs font-medium" type="submit">
                        Active Later
                      </button>
                    </form>
                    <form action={setParkedAction}>
                      <button className="h-8 rounded-md border border-border px-3 text-xs font-medium" type="submit">
                        Park
                      </button>
                    </form>
                    <form action={markReviewedAction}>
                      <button className="h-8 rounded-md border border-border px-3 text-xs font-medium" type="submit">
                        Mark Reviewed
                      </button>
                    </form>
                  </div>

                  {project.tasks.length > 0 && (
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Open Tasks</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {project.tasks.map((task) => (
                          <span key={task.id} className="rounded-full border px-3 py-1 text-xs">
                            {task.title}
                          </span>
                        ))}
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
                      <div className="flex gap-2">
                        <button className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground" type="submit">
                          Save
                        </button>
                      </div>
                    </form>
                    <form action={deleteExecutionProjectAction} className="mt-3">
                      <input name="projectId" type="hidden" value={project.id} />
                      <button className="h-9 rounded-md border border-destructive px-4 text-sm text-destructive" type="submit">
                        Delete Project
                      </button>
                    </form>
                  </details>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </main>
  );
}
