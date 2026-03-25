"use client";

import { useActionState } from "react";
import { createExecutionProjectAction } from "@/app/execution-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { executionSelectOptions, formatExecutionLabel } from "@/lib/execution-options";

type DomainOption = {
  id: string;
  name: string;
};

export function CreateProjectForm({ domains }: { domains: DomainOption[] }) {
  const [state, formAction, pending] = useActionState(createExecutionProjectAction, {
    ok: true,
    error: ""
  });
  const defaultDomainId =
    domains.find((domain) => domain.name.toLowerCase() === "work")?.id ?? domains[0]?.id ?? "";

  return (
    <form action={formAction} className="space-y-3">
      <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" defaultValue={defaultDomainId} name="domainId">
        {domains.map((domain) => (
          <option key={domain.id} value={domain.id}>
            {domain.name}
          </option>
        ))}
      </select>
      <Input name="name" placeholder="Project name" required />
      <div className="grid gap-2 sm:grid-cols-2">
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue="ON_TRACK" name="status">
          {executionSelectOptions.projectStatuses.map((value) => (
            <option key={value} value={value}>
              {formatExecutionLabel(value)}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          defaultValue="ACTIVE_NOW"
          name="activeStatus"
        >
          {executionSelectOptions.activeStatuses.map((value) => (
            <option key={value} value={value}>
              {formatExecutionLabel(value)}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" defaultValue="NONE" name="weeklyFocus">
          {executionSelectOptions.weeklyFocuses.map((value) => (
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
      <Input name="nextAction" placeholder="Next action" />
      <Input name="waitingOn" placeholder="Waiting on" />
      <Textarea name="note" placeholder="Optional project note" rows={3} />
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input className="h-4 w-4" name="blocked" type="checkbox" />
        Blocked
      </label>
      {!state.ok && <p className="text-sm text-destructive">{state.error}</p>}
      <Button disabled={pending} type="submit">
        Add Project
      </Button>
    </form>
  );
}
