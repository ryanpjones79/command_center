"use client";

import { useActionState } from "react";
import { createNotebookEntryAction } from "@/app/library/notebooks/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { notebookEntryTypes } from "@/lib/notebook-options";
import { formatNotebookTitle } from "@/lib/notebook-format";

type NotebookOption = {
  id: string;
  number: number | null;
  title: string;
};

type DomainOption = {
  id: string;
  name: string;
};

type ProjectOption = {
  id: string;
  name: string;
  domain: { name: string };
};

function todayInputValue() {
  const today = new Date();
  const offsetDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
}

export function NotebookEntryForm({
  notebooks,
  activeNotebookId,
  domains,
  projects
}: {
  notebooks: NotebookOption[];
  activeNotebookId?: string | null;
  domains: DomainOption[];
  projects: ProjectOption[];
}) {
  const [state, formAction, pending] = useActionState(createNotebookEntryAction, {
    ok: true,
    error: ""
  });
  const defaultNotebookId = activeNotebookId ?? notebooks[0]?.id ?? "";
  const hasNotebooks = notebooks.length > 0;

  return (
    <form action={formAction} className="grid gap-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_110px]">
        <label className="space-y-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Notebook
          </span>
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            defaultValue={defaultNotebookId}
            disabled={!hasNotebooks}
            name="notebookId"
            required
          >
            {notebooks.map((notebook) => (
              <option key={notebook.id} value={notebook.id}>
                {formatNotebookTitle(notebook)}
                {notebook.title !== formatNotebookTitle(notebook) ? ` - ${notebook.title}` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Page
          </span>
          <Input min="1" name="pageNumber" placeholder="42" required type="number" />
        </label>
      </div>

      <label className="space-y-1 text-sm">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Title
        </span>
        <Input name="title" placeholder="What should this page be found by?" required />
      </label>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Type
          </span>
          <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" name="entryType">
            {notebookEntryTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Date
          </span>
          <Input defaultValue={todayInputValue()} name="date" type="date" />
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Area
          </span>
          <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" name="domainId">
            <option value="">No area</option>
            {domains.map((domain) => (
              <option key={domain.id} value={domain.id}>
                {domain.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Project
          </span>
          <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" name="projectId">
            <option value="">No project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name} / {project.domain.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="space-y-1 text-sm">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Summary
        </span>
        <Textarea name="summary" placeholder="Optional one-line pointer, not a transcript." rows={3} />
      </label>

      {!state.ok && <p className="text-sm text-destructive">{state.error}</p>}
      <Button disabled={pending || !hasNotebooks} type="submit">
        Save Index
      </Button>
    </form>
  );
}
