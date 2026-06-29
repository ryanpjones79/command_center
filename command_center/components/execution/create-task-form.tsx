"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import { createExecutionTaskAction } from "@/app/execution-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  describeRecurrenceFrequency,
  executionSelectOptions,
  executionWeekdayOptions,
  formatExecutionDurationBucket,
  formatExecutionLabel,
  formatRecurrenceFrequency
} from "@/lib/execution-options";

type DomainOption = {
  id: string;
  name: string;
};

type ProjectOption = {
  id: string;
  name: string;
  domainId: string;
};

function Field({
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

export function CreateTaskForm({
  domains,
  projects
}: {
  domains: DomainOption[];
  projects: ProjectOption[];
}) {
  const [state, formAction, pending] = useActionState(createExecutionTaskAction, {
    ok: true,
    error: ""
  });
  const defaultDomainId =
    domains.find((domain) => domain.name.toLowerCase() === "work")?.id ?? domains[0]?.id ?? "";

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Area">
          <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue={defaultDomainId} name="domainId">
            {domains.map((domain) => (
              <option key={domain.id} value={domain.id}>
                {domain.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Project">
          <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue="" name="projectId">
            <option value="">No project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Task name">
        <Input name="title" placeholder="What needs to happen?" required />
      </Field>
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label="Task type">
          <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue="ACTION" name="type">
            {executionSelectOptions.taskTypes.map((value) => (
              <option key={value} value={value}>
                {formatExecutionLabel(value)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            defaultValue="NOT_STARTED"
            name="status"
          >
            {executionSelectOptions.taskStatuses.map((value) => (
              <option key={value} value={value}>
                {formatExecutionLabel(value)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priority">
          <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue="MEDIUM" name="priority">
            {executionSelectOptions.priorities.map((value) => (
              <option key={value} value={value}>
                {formatExecutionLabel(value)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label="Planning bucket" help="Where this should live until you schedule or finish it.">
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            defaultValue="TODAY"
            name="whenBucket"
          >
            {executionSelectOptions.whenBuckets.map((value) => (
              <option key={value} value={value}>
                {formatExecutionLabel(value)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Due date" help="Use only when there is a real deadline.">
          <Input name="dueDate" type="date" />
        </Field>
        <Field label="Follow-up date" help="Use when this depends on someone else or needs a check-in.">
          <Input name="followUpDate" type="date" />
        </Field>
      </div>
      <Field label="Estimated time" help="<30 min tasks can be suggested as quick wins.">
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue="" name="estimatedDuration">
          <option value="">No estimate yet</option>
          {executionSelectOptions.durationBuckets.map((value) => (
            <option key={value} value={value}>
              {formatExecutionDurationBucket(value)}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Repeats" help="Creates the next copy when you complete this one.">
          <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue="NONE" name="recurrenceFrequency">
            {executionSelectOptions.recurrenceFrequencies.map((value) => (
              <option key={value} value={value}>
                {formatRecurrenceFrequency(value)}
              </option>
            ))}
          </select>
          <span className="text-[11px] leading-snug text-muted-foreground">
            Daily anchors, workweek operating tasks, weekly rituals, or custom weekdays.
          </span>
        </Field>
        <Field label="Repeat ends" help="Optional. Leave blank if it should keep repeating.">
          <Input name="recurrenceEndDate" type="date" />
        </Field>
      </div>
      <Field label="Custom weekdays" help="Used only when Repeats is set to Custom weekdays.">
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {executionWeekdayOptions.map((day) => (
            <label
              className="flex h-9 items-center justify-center gap-1 rounded-md border border-input px-2 text-xs text-muted-foreground"
              key={day.value}
            >
              <input className="h-3.5 w-3.5" name="recurrenceWeekdays" type="checkbox" value={day.value} />
              {day.label}
            </label>
          ))}
        </div>
        <div className="grid gap-1 text-[11px] leading-snug text-muted-foreground">
          {executionSelectOptions.recurrenceFrequencies
            .filter((value) => value !== "NONE")
            .map((value) => (
              <span key={value}>
                {formatRecurrenceFrequency(value)}: {describeRecurrenceFrequency(value)}
              </span>
            ))}
        </div>
      </Field>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Waiting on" help="Person, team, or dependency blocking the next move.">
          <Input name="waitingOn" placeholder="Name or dependency" />
        </Field>
        <Field label="Source" help="Where this came from, if useful later.">
          <Input name="source" placeholder="Email, meeting, brief, idea" />
        </Field>
      </div>
      <Field label="Notes">
        <Textarea name="note" placeholder="Short note" rows={3} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input className="h-4 w-4" name="isBlocked" type="checkbox" />
        Blocked
      </label>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input className="h-4 w-4" name="pinToTodayUntilDone" type="checkbox" />
        Keep on Today until done
      </label>
      {!state.ok && <p className="text-sm text-destructive">{state.error}</p>}
      <Button disabled={pending} type="submit">
        Add Task
      </Button>
    </form>
  );
}
