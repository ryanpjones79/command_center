import {
  bulkUpdateExecutionTasksAction,
  deleteExecutionTaskAction,
  markExecutionTaskStatusAction,
  nudgeExecutionTaskFollowUpAction,
  updateExecutionTaskAction
} from "@/app/execution-actions";
import type { ReactNode } from "react";
import { CreateTaskForm } from "@/components/execution/create-task-form";
import { SubmitButton } from "@/components/execution/submit-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  executionSelectOptions,
  executionWeekdayOptions,
  formatExecutionDurationBucket,
  formatExecutionLabel,
  formatRecurrenceFrequency,
  formatRecurrenceWeekdays,
  parseRecurrenceWeekdays
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

const taskEditFieldClass = "h-9 rounded-md border border-input bg-background px-3 text-sm";

function TaskEditField({
  label,
  help,
  children
}: {
  label: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
      {children}
      {help && <span className="text-[11px] leading-snug text-muted-foreground">{help}</span>}
    </div>
  );
}

export default async function TasksPage({ searchParams }: TasksPageProps) {
  const user = await requireUser();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : undefined;
  const whenBucket = typeof params.whenBucket === "string" ? params.whenBucket : undefined;
  const status = typeof params.status === "string" ? params.status : undefined;
  const domainId = typeof params.domainId === "string" ? params.domainId : undefined;
  const projectId = typeof params.projectId === "string" ? params.projectId : undefined;
  const priority = typeof params.priority === "string" ? params.priority : undefined;
  const taskId = typeof params.taskId === "string" ? params.taskId : undefined;
  const bulkUpdated = typeof params.bulkUpdated === "string" ? Number.parseInt(params.bulkUpdated, 10) : 0;
  const bulkAction = typeof params.bulkAction === "string" ? params.bulkAction : undefined;
  const bulkError = typeof params.bulkError === "string" ? params.bulkError : undefined;
  const currentFilters = new URLSearchParams();
  if (q) currentFilters.set("q", q);
  if (whenBucket) currentFilters.set("whenBucket", whenBucket);
  if (status) currentFilters.set("status", status);
  if (domainId) currentFilters.set("domainId", domainId);
  if (projectId) currentFilters.set("projectId", projectId);
  if (priority) currentFilters.set("priority", priority);
  if (taskId) currentFilters.set("taskId", taskId);
  const returnTo = currentFilters.toString() ? `/tasks?${currentFilters.toString()}` : "/tasks";

  const { tasks, domains, projects } = await getTaskMaintenanceData(user.id, {
    q,
    whenBucket,
    status,
    domainId,
    projectId,
    priority,
    taskId
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

      <section className="grid gap-4 xl:grid-cols-[minmax(430px,470px)_minmax(0,1fr)]">
        <Card className="h-fit overflow-hidden">
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
          {(bulkError || bulkUpdated > 0) && (
            <Card className={bulkError ? "border-destructive/50" : "border-emerald-400/40"}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
                <div>
                  <p className="text-sm font-medium">
                    {bulkError ||
                      `${bulkActionOptions.find((option) => option.value === bulkAction)?.label ?? "Bulk update"} applied to ${bulkUpdated} task${bulkUpdated === 1 ? "" : "s"}.`}
                  </p>
                  {bulkAction === "MOVE_PARKING_LOT" && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Parking Lot is a planning bucket. The tasks stay here and can be viewed with the Parking Lot filter.
                    </p>
                  )}
                </div>
                {bulkAction === "MOVE_PARKING_LOT" && (
                  <a className="rounded-md border border-border px-3 py-1.5 text-xs font-medium" href="/tasks?whenBucket=PARKING_LOT">
                    View Parking Lot
                  </a>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" method="get">
                <input
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm md:col-span-2 xl:col-span-3 2xl:col-span-1"
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
                <SubmitButton className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground md:w-fit" pendingLabel="Applying..." type="submit">
                  Apply
                </SubmitButton>
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
                className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_minmax(180px,220px)_minmax(180px,220px)_auto]"
                id="bulk-task-update-form"
              >
                <input name="returnTo" type="hidden" value={returnTo} />
                <p className="text-sm leading-6 text-muted-foreground md:col-span-2 xl:col-span-1">
                  Select tasks below, then move, pin, assign, or push follow-up dates in one pass. Parking Lot is a bucket, not a separate screen.
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
                <SubmitButton className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground md:w-fit xl:w-auto" pendingLabel="Applying..." type="submit">
                  Apply to Selected
                </SubmitButton>
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
            const selectedRecurrenceWeekdays = parseRecurrenceWeekdays(task.recurrenceWeekdays);
            const recurrenceWeekdayLabel = formatRecurrenceWeekdays(task.recurrenceWeekdays);
            const isLinkedTask = task.id === taskId;

            return (
              <Card className={isLinkedTask ? "border-primary/60 ring-2 ring-primary/20" : ""} id={`task-${task.id}`} key={task.id}>
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
                      {task.recurrenceFrequency !== "NONE" && (
                        <Badge variant="outline">
                          {formatRecurrenceFrequency(task.recurrenceFrequency)}
                          {recurrenceWeekdayLabel ? `: ${recurrenceWeekdayLabel}` : ""}
                        </Badge>
                      )}
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
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Repeats</p>
                      <p className="mt-1 text-sm">
                        {task.recurrenceFrequency === "NONE"
                          ? "No"
                          : `${formatRecurrenceFrequency(task.recurrenceFrequency)}${recurrenceWeekdayLabel ? `: ${recurrenceWeekdayLabel}` : ""}${task.recurrenceEndDate ? ` until ${task.recurrenceEndDate.toLocaleDateString()}` : ""}`}
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
                      <SubmitButton className="h-8 rounded-md border border-border px-3 text-xs font-medium disabled:opacity-60" pendingLabel="Saving..." type="submit">
                        Mark Done
                      </SubmitButton>
                    </form>
                    <form action={bumpTwoDaysAction}>
                      <SubmitButton className="h-8 rounded-md border border-border px-3 text-xs font-medium disabled:opacity-60" pendingLabel="Saving..." type="submit">
                        Follow Up +2d
                      </SubmitButton>
                    </form>
                    <form action={bumpWeekAction}>
                      <SubmitButton className="h-8 rounded-md border border-border px-3 text-xs font-medium disabled:opacity-60" pendingLabel="Saving..." type="submit">
                        Follow Up +1w
                      </SubmitButton>
                    </form>
                  </div>

                  <details className="mt-4 rounded-lg border border-border/70 p-3" open={isLinkedTask || undefined}>
                    <summary className="cursor-pointer text-sm font-medium">Edit Task</summary>
                    <form action={updateExecutionTaskAction} className="mt-3 grid gap-3">
                      <input name="taskId" type="hidden" value={task.id} />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <TaskEditField label="Area">
                          <select className={taskEditFieldClass} defaultValue={task.domainId} name="domainId">
                            {domains.map((domain) => (
                              <option key={domain.id} value={domain.id}>
                                {domain.name}
                              </option>
                            ))}
                          </select>
                        </TaskEditField>
                        <TaskEditField label="Project">
                          <select className={taskEditFieldClass} defaultValue={task.projectId ?? ""} name="projectId">
                            <option value="">No project</option>
                            {projects.map((project) => (
                              <option key={project.id} value={project.id}>
                                {project.name}
                              </option>
                            ))}
                          </select>
                        </TaskEditField>
                      </div>
                      <TaskEditField label="Task name">
                        <input className={taskEditFieldClass} defaultValue={task.title} name="title" required />
                      </TaskEditField>
                      <div className="grid gap-2 sm:grid-cols-4">
                        <TaskEditField label="Type">
                          <select className={taskEditFieldClass} defaultValue={task.type} name="type">
                            {executionSelectOptions.taskTypes.map((value) => (
                              <option key={value} value={value}>
                                {formatExecutionLabel(value)}
                              </option>
                            ))}
                          </select>
                        </TaskEditField>
                        <TaskEditField label="Status">
                          <select className={taskEditFieldClass} defaultValue={task.status} name="status">
                            {executionSelectOptions.taskStatuses.map((value) => (
                              <option key={value} value={value}>
                                {formatExecutionLabel(value)}
                              </option>
                            ))}
                          </select>
                        </TaskEditField>
                        <TaskEditField label="Priority">
                          <select className={taskEditFieldClass} defaultValue={task.priority} name="priority">
                            {executionSelectOptions.priorities.map((value) => (
                              <option key={value} value={value}>
                                {formatExecutionLabel(value)}
                              </option>
                            ))}
                          </select>
                        </TaskEditField>
                        <TaskEditField label="Planning bucket" help="Where this should live until scheduled or finished.">
                          <select className={taskEditFieldClass} defaultValue={task.whenBucket} name="whenBucket">
                            {executionSelectOptions.whenBuckets.map((value) => (
                              <option key={value} value={value}>
                                {formatExecutionLabel(value)}
                              </option>
                            ))}
                          </select>
                        </TaskEditField>
                      </div>
                      <TaskEditField label="Estimated time" help="<30 min tasks can be suggested as quick wins.">
                        <select
                          className={taskEditFieldClass}
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
                      </TaskEditField>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <TaskEditField label="Repeats" help="Creates the next copy when this one is marked done.">
                          <select
                            className={taskEditFieldClass}
                            defaultValue={task.recurrenceFrequency}
                            name="recurrenceFrequency"
                          >
                            {executionSelectOptions.recurrenceFrequencies.map((value) => (
                              <option key={value} value={value}>
                                {formatRecurrenceFrequency(value)}
                              </option>
                            ))}
                          </select>
                        </TaskEditField>
                        <TaskEditField label="Repeat ends" help="Optional. Leave blank if it should keep repeating.">
                          <input
                            className={taskEditFieldClass}
                            defaultValue={task.recurrenceEndDate ? task.recurrenceEndDate.toISOString().slice(0, 10) : ""}
                            name="recurrenceEndDate"
                            type="date"
                          />
                        </TaskEditField>
                      </div>
                      <TaskEditField label="Custom weekdays" help="Used only when Repeats is set to Custom weekdays.">
                        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                          {executionWeekdayOptions.map((day) => (
                            <label
                              className="flex h-9 items-center justify-center gap-1 rounded-md border border-input px-2 text-xs text-muted-foreground"
                              key={day.value}
                            >
                              <input
                                className="h-3.5 w-3.5"
                                defaultChecked={selectedRecurrenceWeekdays.has(day.value)}
                                name="recurrenceWeekdays"
                                type="checkbox"
                                value={day.value}
                              />
                              {day.label}
                            </label>
                          ))}
                        </div>
                      </TaskEditField>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <TaskEditField label="Due date" help="Use only when there is a real deadline.">
                          <input
                            className={taskEditFieldClass}
                            defaultValue={task.dueDate ? task.dueDate.toISOString().slice(0, 10) : ""}
                            name="dueDate"
                            type="date"
                          />
                        </TaskEditField>
                        <TaskEditField label="Follow-up date" help="Use when this depends on someone else or needs a check-in.">
                          <input
                            className={taskEditFieldClass}
                            defaultValue={task.followUpDate ? task.followUpDate.toISOString().slice(0, 10) : ""}
                            name="followUpDate"
                            type="date"
                          />
                        </TaskEditField>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <TaskEditField label="Waiting on" help="Person, team, or dependency blocking the next move.">
                          <input
                            className={taskEditFieldClass}
                            defaultValue={task.waitingOn ?? ""}
                            name="waitingOn"
                            placeholder="Name or dependency"
                          />
                        </TaskEditField>
                        <TaskEditField label="Source" help="Where this came from, if useful later.">
                          <input
                            className={taskEditFieldClass}
                            defaultValue={task.source ?? ""}
                            name="source"
                            placeholder="Email, meeting, brief, idea"
                          />
                        </TaskEditField>
                      </div>
                      <TaskEditField label="Notes">
                        <textarea className="min-h-[96px] rounded-md border border-input bg-background px-3 py-2 text-sm" defaultValue={task.note ?? ""} name="note" />
                      </TaskEditField>
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
                      <SubmitButton className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-70" pendingLabel="Saving..." type="submit">
                        Save
                      </SubmitButton>
                    </form>
                    <form action={deleteExecutionTaskAction} className="mt-3">
                      <input name="taskId" type="hidden" value={task.id} />
                      <SubmitButton className="h-9 rounded-md border border-destructive px-4 text-sm text-destructive disabled:opacity-60" pendingLabel="Deleting..." type="submit">
                        Delete Task
                      </SubmitButton>
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
