import { markExecutionTaskStatusAction, updateExecutionTaskAction } from "@/app/execution-actions";
import type { ReactNode } from "react";
import {
  executionSelectOptions,
  executionWeekdayOptions,
  formatExecutionDurationBucket,
  formatExecutionLabel,
  formatRecurrenceFrequency,
  formatRecurrenceWeekdays,
  parseRecurrenceWeekdays
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
  recurrenceFrequency: string;
  recurrenceWeekdays: string | null;
  recurrenceEndDate: Date | null;
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

function EditField({
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
  const fieldClass = "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm";
  const selectedRecurrenceWeekdays = parseRecurrenceWeekdays(task.recurrenceWeekdays);
  const recurrenceWeekdayLabel = formatRecurrenceWeekdays(task.recurrenceWeekdays);

  return (
    <div className="print-row border-b border-dashed border-border py-3 last:border-b-0 sm:py-2">
      <div className="flex gap-3">
        <form action={completeAction} className="app-no-print pt-0.5">
          <button
            aria-label={`Mark ${task.title} done`}
            className="h-5 w-5 rounded-sm border border-foreground/60 bg-transparent sm:h-4 sm:w-4"
            type="submit"
          />
        </form>
        <div className="print-check print-only mt-0.5 h-4 w-4 rounded-sm border border-black" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="w-full break-words text-sm font-medium leading-snug sm:w-auto sm:leading-tight">{task.title}</p>
            {task.project?.name && <span className="text-xs text-muted-foreground">{task.project.name}</span>}
            <span className="rounded border border-border/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {task.domain.name}
            </span>
            <span className="rounded border border-border/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {formatExecutionLabel(task.priority)}
            </span>
            {task.estimatedDuration && (
              <span className="rounded border border-border/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                {formatExecutionDurationBucket(task.estimatedDuration)}
              </span>
            )}
            {task.isQuickWinCandidate && (
              <span className="rounded border border-accent/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-accent">
                Quick Win Candidate
              </span>
            )}
            {task.pinToTodayUntilDone && (
              <span className="rounded border border-border/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                Pinned
              </span>
            )}
            {task.recurrenceFrequency !== "NONE" && (
              <span className="rounded border border-border/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                {formatRecurrenceFrequency(task.recurrenceFrequency)}
                {recurrenceWeekdayLabel ? `: ${recurrenceWeekdayLabel}` : ""}
              </span>
            )}
            {task.dueDate && <span className="text-[11px] text-muted-foreground">Due {task.dueDate.toLocaleDateString()}</span>}
            {task.recurrenceEndDate && (
              <span className="text-[11px] text-muted-foreground">Repeats until {task.recurrenceEndDate.toLocaleDateString()}</span>
            )}
            {task.followUpDate && (
              <span className="text-[11px] text-muted-foreground">Follow up {task.followUpDate.toLocaleDateString()}</span>
            )}
            {task.waitingOn && <span className="text-[11px] text-muted-foreground">Waiting on {task.waitingOn}</span>}
          </div>
          {task.note && <p className="mt-1 text-xs text-muted-foreground">{task.note}</p>}

          <details className="app-no-print mt-2 rounded-lg border border-border/70 p-2.5 sm:p-3">
            <summary className="cursor-pointer text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Quick Edit
            </summary>
            <form action={updateExecutionTaskAction} className="mt-3 grid gap-3">
              <input name="taskId" type="hidden" value={task.id} />
              <div className="grid gap-2 sm:grid-cols-2">
                <EditField label="Area">
                  <select
                    className={fieldClass}
                    defaultValue={task.domainId}
                    name="domainId"
                  >
                    {domains.map((domain) => (
                      <option key={domain.id} value={domain.id}>
                        {domain.name}
                      </option>
                    ))}
                  </select>
                </EditField>
                <EditField label="Project">
                  <select
                    className={fieldClass}
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
                </EditField>
              </div>
              <EditField label="Task name">
                <input
                  className={fieldClass}
                  defaultValue={task.title}
                  name="title"
                  required
                />
              </EditField>
              <div className="grid gap-2 sm:grid-cols-4">
                <EditField label="Type">
                  <select className={fieldClass} defaultValue={task.type} name="type">
                    {executionSelectOptions.taskTypes.map((value) => (
                      <option key={value} value={value}>
                        {formatExecutionLabel(value)}
                      </option>
                    ))}
                  </select>
                </EditField>
                <EditField label="Status">
                  <select className={fieldClass} defaultValue={task.status} name="status">
                    {executionSelectOptions.taskStatuses.map((value) => (
                      <option key={value} value={value}>
                        {formatExecutionLabel(value)}
                      </option>
                    ))}
                  </select>
                </EditField>
                <EditField label="Priority">
                  <select
                    className={fieldClass}
                    defaultValue={task.priority}
                    name="priority"
                  >
                    {executionSelectOptions.priorities.map((value) => (
                      <option key={value} value={value}>
                        {formatExecutionLabel(value)}
                      </option>
                    ))}
                  </select>
                </EditField>
                <EditField label="Planning bucket">
                  <select
                    className={fieldClass}
                    defaultValue={task.whenBucket}
                    name="whenBucket"
                  >
                    {executionSelectOptions.whenBuckets.map((value) => (
                      <option key={value} value={value}>
                        {formatExecutionLabel(value)}
                      </option>
                    ))}
                  </select>
                </EditField>
              </div>
              <EditField label="Estimated time" help="<30 min tasks can be suggested as quick wins.">
                <select
                  className={fieldClass}
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
              </EditField>
              <div className="grid gap-2 sm:grid-cols-2">
                <EditField label="Repeats" help="Creates the next copy when this one is marked done.">
                  <select
                    className={fieldClass}
                    defaultValue={task.recurrenceFrequency}
                    name="recurrenceFrequency"
                  >
                    {executionSelectOptions.recurrenceFrequencies.map((value) => (
                      <option key={value} value={value}>
                        {formatRecurrenceFrequency(value)}
                      </option>
                    ))}
                  </select>
                </EditField>
                <EditField label="Repeat ends" help="Optional. Leave blank if it should keep repeating.">
                  <input
                    className={fieldClass}
                    defaultValue={task.recurrenceEndDate ? task.recurrenceEndDate.toISOString().slice(0, 10) : ""}
                    name="recurrenceEndDate"
                    type="date"
                  />
                </EditField>
              </div>
              <EditField label="Custom weekdays" help="Used only when Repeats is set to Custom weekdays.">
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
              </EditField>
              <div className="grid gap-2 sm:grid-cols-2">
                <EditField label="Due date" help="Use only for real deadlines.">
                  <input
                    className={fieldClass}
                    defaultValue={task.dueDate ? task.dueDate.toISOString().slice(0, 10) : ""}
                    name="dueDate"
                    type="date"
                  />
                </EditField>
                <EditField label="Follow-up date" help="Use when you need to check back later.">
                  <input
                    className={fieldClass}
                    defaultValue={task.followUpDate ? task.followUpDate.toISOString().slice(0, 10) : ""}
                    name="followUpDate"
                    type="date"
                  />
                </EditField>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <EditField label="Waiting on" help="Person, team, or dependency blocking the next move.">
                  <input
                    className={fieldClass}
                    defaultValue={task.waitingOn ?? ""}
                    name="waitingOn"
                    placeholder="Name or dependency"
                  />
                </EditField>
                <EditField label="Source" help="Where this came from, if useful later.">
                  <input
                    className={fieldClass}
                    defaultValue={task.source ?? ""}
                    name="source"
                    placeholder="Email, meeting, brief, idea"
                  />
                </EditField>
              </div>
              <EditField label="Notes">
                <textarea
                  className="min-h-[88px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                  defaultValue={task.note ?? ""}
                  name="note"
                />
              </EditField>
              <div className="grid gap-2 sm:flex sm:flex-wrap sm:gap-4">
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
              <button className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground sm:w-fit" type="submit">
                Save
              </button>
            </form>
          </details>
        </div>
      </div>
    </div>
  );
}
