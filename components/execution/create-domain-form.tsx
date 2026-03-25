"use client";

import { useActionState } from "react";
import { createExecutionDomainAction } from "@/app/execution-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CreateDomainForm() {
  const [state, formAction, pending] = useActionState(createExecutionDomainAction, {
    ok: true,
    error: ""
  });

  return (
    <form action={formAction} className="space-y-3">
      <Input name="name" placeholder="Domain name" required />
      <Input name="slug" placeholder="domain-slug" required />
      <Input name="description" placeholder="Optional description" />
      {!state.ok && <p className="text-sm text-destructive">{state.error}</p>}
      <Button disabled={pending} type="submit">
        Add Domain
      </Button>
    </form>
  );
}
