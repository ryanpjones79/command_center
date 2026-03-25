"use client";

import { useActionState } from "react";
import { createExecutionTaskAction } from "@/app/execution-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  executionSelectOptions,
  formatExecutionDurationBucket,
  formatExecutionLabel
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
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue={defaultDomainId} name="domainId">
          {domains.map((domain) => (
            <option key={domain.id} value={domain.id}>
              {domain.name}
            </option>
          ))}
        </select>
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue="" name="projectId">
          <option value="">No project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </div>
      <Input name="title" placeholder="Task name" required />
      <div className="grid gap-2 sm:grid-cols-3">
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue="ACTION" name="type">
          {executionSelectOptions.taskTypes.map((value) => (
            <option key={value} value={value}>
              {formatExecutionLabel(value)}
            </option>
          ))}
        </select>
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
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue="MEDIUM" name="priority">
          {executionSelectOptions.priorities.map((value) => (
            <option key={value} value={value}>
              {formatExecutionLabel(value)}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
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
        <Input name="dueDate" type="date" />
        <Input name="followUpDate" type="date" />
      </div>
      <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue="" name="estimatedDuration">
        <option value="">No estimate yet</option>
        {executionSelectOptions.durationBuckets.map((value) => (
          <option key={value} value={value}>
            {formatExecutionDurationBucket(value)}
          </option>
        ))}
      </select>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input name="waitingOn" placeholder="Waiting on" />
        <Input name="source" placeholder="Source" />
      </div>
      <Textarea name="note" placeholder="Short note" rows={3} />
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
