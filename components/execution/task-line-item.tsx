import { markExecutionTaskStatusAction, updateExecutionTaskAction } from "@/app/execution-actions";
import {
  executionSelectOptions,
  formatExecutionDurationBucket,
  formatExecutionLabel
} from "@/lib/execution-options";

type TaskItem = {
  id: string;
  domainId: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  whenBucket: string;
  estimatedDuration: string | null;
  dueDate: Date | null;
  followUpDate?: Date | null;
  waitingOn: string | null;
  note: string | null;
  source?: string | null;
  isBlocked?: boolean;
  isQuickWinCandidate?: boolean;
  pinToTodayUntilDone?: boolean;
  domain: { name: string };
  project: { id: string; name: string } | null;
};

type DomainOption = {
  id: string;
  name: string;
};

type ProjectOption = {
  id: string;
  name: string;
  domainId: string;
};

export function TaskLineItem({
  task,
  domains,
  projects
}: {
  task: TaskItem;
  domains: DomainOption[];
  projects: ProjectOption[];
}) {
  const completeAction = markExecutionTaskStatusAction.bind(null, task.id, "DONE", undefined);

  return (
    <div className="print-row border-b border-dashed border-border py-2 last:border-b-0">
      <div className="flex gap-3">
        <form action={completeAction} className="app-no-print pt-0.5">
          <button
            aria-label={`Mark ${task.title} done`}
            className="h-4 w-4 rounded-sm border border-foreground/60 bg-transparent"
            type="submit"
          />
        </form>
        <div className="print-check print-only mt-0.5 h-4 w-4 rounded-sm border border-black" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <p className="text-sm font-medium leading-tight">{task.title}</p>
            {task.project?.name && <span className="text-xs text-muted-foreground">{task.project.name}</span>}
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{task.domain.name}</span>
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {formatExecutionLabel(task.priority)}
            </span>
            {task.estimatedDuration && (
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {formatExecutionDurationBucket(task.estimatedDuration)}
              </span>
            )}
            {task.isQuickWinCandidate && (
              <span className="text-[11px] uppercase tracking-wide text-accent">Quick Win Candidate</span>
            )}
            {task.pinToTodayUntilDone && (
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Pinned</span>
            )}
            {task.dueDate && <span className="text-[11px] text-muted-foreground">Due {task.dueDate.toLocaleDateString()}</span>}
            {task.followUpDate && (
              <span className="text-[11px] text-muted-foreground">Follow up {task.followUpDate.toLocaleDateString()}</span>
            )}
            {task.waitingOn && <span className="text-[11px] text-muted-foreground">Waiting on {task.waitingOn}</span>}
          </div>
          {task.note && <p className="mt-1 text-xs text-muted-foreground">{task.note}</p>}

          <details className="app-no-print mt-2 rounded-lg border border-border/70 p-3">
            <summary className="cursor-pointer text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Quick Edit
            </summary>
            <form action={updateExecutionTaskAction} className="mt-3 grid gap-3">
              <input name="taskId" type="hidden" value={task.id} />
              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue={task.domainId}
                  name="domainId"
                >
                  {domains.map((domain) => (
                    <option key={domain.id} value={domain.id}>
                      {domain.name}
                    </option>
                  ))}
                </select>
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue={task.project?.id ?? ""}
                  name="projectId"
                >
                  <option value="">No project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
              <input
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                defaultValue={task.title}
                name="title"
                required
              />
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
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue={task.priority}
                  name="priority"
                >
                  {executionSelectOptions.priorities.map((value) => (
                    <option key={value} value={value}>
                      {formatExecutionLabel(value)}
                    </option>
                  ))}
                </select>
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue={task.whenBucket}
                  name="whenBucket"
                >
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
              <textarea
                className="min-h-[88px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                defaultValue={task.note ?? ""}
                name="note"
              />
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
          </details>
        </div>
      </div>
    </div>
  );
}
