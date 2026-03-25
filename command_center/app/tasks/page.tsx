import {
  bulkUpdateExecutionTasksAction,
  deleteExecutionTaskAction,
  markExecutionTaskStatusAction,
  nudgeExecutionTaskFollowUpAction,
  updateExecutionTaskAction
} from "@/app/execution-actions";
import { CreateTaskForm } from "@/components/execution/create-task-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  executionSelectOptions,
  formatExecutionDurationBucket,
  formatExecutionLabel
} from "@/lib/execution-options";
import { requireUser } from "@/lib/session";
import { getTaskMaintenanceData } from "@/server/execution-service";

type TasksPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const bulkActionOptions = [
  { value: "MOVE_TODAY", label: "Move to Today" },
  { value: "MOVE_THIS_WEEK", label: "Move to This Week" },
  { value: "MOVE_LATER", label: "Move to Later" },
  { value: "MOVE_PARKING_LOT", label: "Move to Parking Lot" },
  { value: "MOVE_WAITING", label: "Move to Waiting" },
  { value: "STATUS_NOT_STARTED", label: "Mark Not Started" },
  { value: "STATUS_IN_PROGRESS", label: "Mark In Progress" },
  { value: "STATUS_WAITING", label: "Mark Waiting" },
  { value: "STATUS_DONE", label: "Mark Done" },
  { value: "PIN_TODAY", label: "Pin to Today" },
  { value: "UNPIN_TODAY", label: "Unpin from Today" },
  { value: "FOLLOW_UP_2", label: "Push follow-up +2 days" },
  { value: "FOLLOW_UP_7", label: "Push follow-up +1 week" },
  { value: "ASSIGN_PROJECT", label: "Assign project" }
] as const;

export default async function TasksPage({ searchParams }: TasksPageProps) {
  const user = await requireUser();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : undefined;
  const whenBucket = typeof params.whenBucket === "string" ? params.whenBucket : undefined;
  const status = typeof params.status === "string" ? params.status : undefined;
  const domainId = typeof params.domainId === "string" ? params.domainId : undefined;
  const projectId = typeof params.projectId === "string" ? params.projectId : undefined;
  const priority = typeof params.priority === "string" ? params.priority : undefined;

  const { tasks, domains, projects } = await getTaskMaintenanceData(user.id, {
    q,
    whenBucket,
    status,
    domainId,
    projectId,
    priority
  });

  const projectOptions = domainId
    ? projects.filter((project) => project.domainId === domainId)
    : projects;

  return (
    <main className="space-y-6">
      <section>
        <p className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Full Task List</p>
        <h2 className="text-4xl font-semibold tracking-tight">Task Maintenance</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          This is the maintenance surface. Use it to triage by project, move work between buckets, and keep the Action Sheet clean.
        </p>
      </section>

      <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Add Task</CardTitle>
          </CardHeader>
          <CardContent>
            <CreateTaskForm
              domains={domains.map((domain) => ({ id: domain.id, name: domain.name }))}
              projects={projects.map((project) => ({ id: project.id, name: project.name, domainId: project.domainId }))}
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="grid gap-3 md:grid-cols-6" method="get">
                <input
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm md:col-span-2"
                  defaultValue={q}
                  name="q"
                  placeholder="Search task, note, source, waiting on"
                />
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue={domainId ?? ""}
                  name="domainId"
                >
                  <option value="">All domains</option>
                  {domains.map((domain) => (
                    <option key={domain.id} value={domain.id}>
                      {domain.name}
                    </option>
                  ))}
                </select>
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue={projectId ?? ""}
                  name="projectId"
                >
                  <option value="">All projects</option>
                  {projectOptions.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue={whenBucket ?? ""}
                  name="whenBucket"
                >
                  <option value="">All buckets</option>
                  {executionSelectOptions.whenBuckets.map((value) => (
                    <option key={value} value={value}>
                      {formatExecutionLabel(value)}
                    </option>
                  ))}
                </select>
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue={status ?? ""}
                  name="status"
                >
                  <option value="">All statuses</option>
                  {executionSelectOptions.taskStatuses.map((value) => (
                    <option key={value} value={value}>
                      {formatExecutionLabel(value)}
                    </option>
                  ))}
                </select>
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue={priority ?? ""}
                  name="priority"
                >
                  <option value="">All priorities</option>
                  {executionSelectOptions.priorities.map((value) => (
                    <option key={value} value={value}>
                      {formatExecutionLabel(value)}
                    </option>
                  ))}
                </select>
                <button className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground" type="submit">
                  Apply
                </button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Bulk Triage</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                action={bulkUpdateExecutionTasksAction}
                className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px_auto]"
                id="bulk-task-update-form"
              >
                <p className="text-sm text-muted-foreground">
                  Select tasks below, then move, pin, assign, or push follow-up dates in one pass.
                </p>
                <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue="MOVE_THIS_WEEK" name="bulkAction">
                  {bulkActionOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue="" name="targetProjectId">
                  <option value="">No project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                <button className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground" type="submit">
                  Apply to Selected
                </button>
              </form>
            </CardContent>
          </Card>

          {tasks.length === 0 && (
            <Card>
              <CardContent className="pt-5">
                <p className="text-sm text-muted-foreground">No tasks match these filters.</p>
              </CardContent>
            </Card>
          )}

          {tasks.map((task) => {
            const bumpTwoDaysAction = nudgeExecutionTaskFollowUpAction.bind(null, task.id, 2);
            const bumpWeekAction = nudgeExecutionTaskFollowUpAction.bind(null, task.id, 7);
            const markDoneAction = markExecutionTaskStatusAction.bind(null, task.id, "DONE", undefined);

            return (
              <Card key={task.id}>
                <CardContent className="pt-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <input
                        className="mt-1 h-4 w-4 rounded border-border"
                        form="bulk-task-update-form"
                        name="taskIds"
                        type="checkbox"
                        value={task.id}
                      />
                      <div>
                        <p className="text-lg font-semibold">{task.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {task.domain.name}
                          {task.project ? ` / ${task.project.name}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{formatExecutionLabel(task.type)}</Badge>
                      <Badge variant="outline">{formatExecutionLabel(task.status)}</Badge>
                      <Badge variant="outline">{formatExecutionLabel(task.whenBucket)}</Badge>
                      <Badge variant="secondary">{formatExecutionLabel(task.priority)}</Badge>
                      {task.estimatedDuration && (
                        <Badge variant="outline">{formatExecutionDurationBucket(task.estimatedDuration)}</Badge>
                      )}
                      {task.pinToTodayUntilDone && <Badge variant="default">Pinned Today</Badge>}
                      {task.isQuickWinCandidate && <Badge variant="secondary">Quick Win Candidate</Badge>}
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 lg:grid-cols-5">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Waiting On</p>
                      <p className="mt-1 text-sm">{task.waitingOn || "None"}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Due</p>
                      <p className="mt-1 text-sm">{task.dueDate ? task.dueDate.toLocaleDateString() : "None"}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Follow Up</p>
                      <p className="mt-1 text-sm">{task.followUpDate ? task.followUpDate.toLocaleDateString() : "None"}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Estimate</p>
                      <p className="mt-1 text-sm">
                        {task.estimatedDuration ? formatExecutionDurationBucket(task.estimatedDuration) : "None"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Source</p>
                      <p className="mt-1 text-sm">{task.source || "None"}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Updated</p>
                      <p className="mt-1 text-sm">{task.updatedAt.toLocaleDateString()}</p>
                    </div>
                  </div>

                  {task.note && <p className="mt-3 text-sm text-muted-foreground">{task.note}</p>}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <form action={markDoneAction}>
                      <button className="h-8 rounded-md border border-border px-3 text-xs font-medium" type="submit">
                        Mark Done
                      </button>
                    </form>
                    <form action={bumpTwoDaysAction}>
                      <button className="h-8 rounded-md border border-border px-3 text-xs font-medium" type="submit">
                        Follow Up +2d
                      </button>
                    </form>
                    <form action={bumpWeekAction}>
                      <button className="h-8 rounded-md border border-border px-3 text-xs font-medium" type="submit">
                        Follow Up +1w
                      </button>
                    </form>
                  </div>

                  <details className="mt-4 rounded-lg border border-border/70 p-3">
                    <summary className="cursor-pointer text-sm font-medium">Edit Task</summary>
                    <form action={updateExecutionTaskAction} className="mt-3 grid gap-3">
                      <input name="taskId" type="hidden" value={task.id} />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue={task.domainId} name="domainId">
                          {domains.map((domain) => (
                            <option key={domain.id} value={domain.id}>
                              {domain.name}
                            </option>
                          ))}
                        </select>
                        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue={task.projectId ?? ""} name="projectId">
                          <option value="">No project</option>
                          {projects.map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <input className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue={task.title} name="title" required />
                      <div className="grid gap-2 sm:grid-cols-4">
                        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue={task.type} name="type">
                          {executionSelectOptions.taskTypes.map((value) => (
                            <option key={value} value={value}>
                              {formatExecutionLabel(value)}
                            </option>
                          ))}
                        </select>
                        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue={task.status} name="status">
                          {executionSelectOptions.taskStatuses.map((value) => (
                            <option key={value} value={value}>
                              {formatExecutionLabel(value)}
                            </option>
                          ))}
                        </select>
                        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue={task.priority} name="priority">
                          {executionSelectOptions.priorities.map((value) => (
                            <option key={value} value={value}>
                              {formatExecutionLabel(value)}
                            </option>
                          ))}
                        </select>
                        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue={task.whenBucket} name="whenBucket">
                          {executionSelectOptions.whenBuckets.map((value) => (
                            <option key={value} value={value}>
                              {formatExecutionLabel(value)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <select
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                        defaultValue={task.estimatedDuration ?? ""}
                        name="estimatedDuration"
                      >
                        <option value="">No estimate yet</option>
                        {executionSelectOptions.durationBuckets.map((value) => (
                          <option key={value} value={value}>
                            {formatExecutionDurationBucket(value)}
                          </option>
                        ))}
                      </select>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input
                          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                          defaultValue={task.dueDate ? task.dueDate.toISOString().slice(0, 10) : ""}
                          name="dueDate"
                          type="date"
                        />
                        <input
                          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                          defaultValue={task.followUpDate ? task.followUpDate.toISOString().slice(0, 10) : ""}
                          name="followUpDate"
                          type="date"
                        />
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input
                          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                          defaultValue={task.waitingOn ?? ""}
                          name="waitingOn"
                          placeholder="Waiting on"
                        />
                        <input
                          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                          defaultValue={task.source ?? ""}
                          name="source"
                          placeholder="Source"
                        />
                      </div>
                      <textarea className="min-h-[96px] rounded-md border border-input bg-background px-3 py-2 text-sm" defaultValue={task.note ?? ""} name="note" />
                      <div className="flex flex-wrap gap-4">
                        <label className="flex items-center gap-2 text-sm text-muted-foreground">
                          <input className="h-4 w-4" defaultChecked={task.isBlocked} name="isBlocked" type="checkbox" />
                          Blocked
                        </label>
                        <label className="flex items-center gap-2 text-sm text-muted-foreground">
                          <input
                            className="h-4 w-4"
                            defaultChecked={task.pinToTodayUntilDone}
                            name="pinToTodayUntilDone"
                            type="checkbox"
                          />
                          Keep on Today until done
                        </label>
                      </div>
                      <button className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground" type="submit">
                        Save
                      </button>
                    </form>
                    <form action={deleteExecutionTaskAction} className="mt-3">
                      <input name="taskId" type="hidden" value={task.id} />
                      <button className="h-9 rounded-md border border-destructive px-4 text-sm text-destructive" type="submit">
                        Delete Task
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
