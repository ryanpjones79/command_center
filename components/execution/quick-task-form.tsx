"use client";

import { useActionState } from "react";
import { quickCaptureExecutionTaskAction } from "@/app/execution-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type DomainOption = {
  id: string;
  name: string;
};

export function QuickTaskForm({ domains }: { domains: DomainOption[] }) {
  const [state, formAction, pending] = useActionState(quickCaptureExecutionTaskAction, {
    ok: true,
    error: ""
  });
  const defaultDomainId =
    domains.find((domain) => domain.name.toLowerCase() === "work")?.id ?? domains[0]?.id ?? "";

  return (
    <form action={formAction} className="app-no-print flex flex-col gap-2 rounded-xl border bg-card/70 p-4 sm:flex-row">
      <select
        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        defaultValue={defaultDomainId}
        name="domainId"
      >
        {domains.map((domain) => (
          <option key={domain.id} value={domain.id}>
            {domain.name}
          </option>
        ))}
      </select>
      <Input className="flex-1" name="title" placeholder="Quick add to Today" required />
      <Button disabled={pending} type="submit">
        Add
      </Button>
      {!state.ok && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
