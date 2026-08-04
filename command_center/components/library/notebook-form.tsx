"use client";

import { useActionState } from "react";
import { createNotebookAction } from "@/app/library/notebooks/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function NotebookForm() {
  const [state, formAction, pending] = useActionState(createNotebookAction, {
    ok: true,
    error: ""
  });

  return (
    <form action={formAction} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
        <label className="space-y-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Number
          </span>
          <Input min="1" name="number" placeholder="03" type="number" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Title
          </span>
          <Input name="title" placeholder="Notebook 03" required />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Started Date
          </span>
          <Input name="startedAt" type="date" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Completed Date
          </span>
          <Input name="completedAt" type="date" />
        </label>
      </div>

      <label className="space-y-1 text-sm">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Description
        </span>
        <Textarea name="description" placeholder="What this physical notebook covers." rows={3} />
      </label>

      {!state.ok && <p className="text-sm text-destructive">{state.error}</p>}
      {state.ok && state.error === "" && (
        <p className="text-xs text-muted-foreground">
          Keep this light. The notebook stays on paper; RyanOS stores the pointer.
        </p>
      )}
      <Button disabled={pending} type="submit">
        Create Notebook
      </Button>
    </form>
  );
}
