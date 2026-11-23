"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronDown, CornerDownLeft, SlidersHorizontal } from "lucide-react";
import { makeRoutineFromProjectAction } from "@/app/plan/routine-actions";
import { addNextStepAction } from "@/app/projects/v2-actions";
import { cn } from "@/lib/utils";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

// One project in the triage list: what it is, the one thing it needs, and its settings tucked away.
export function ProjectRow({ id, children, action, settings }: { id: string; children: React.ReactNode; action?: React.ReactNode; settings: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="scroll-mt-20 px-4 py-3.5 sm:px-5" id={`project-${id}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">{children}</div>
        <div className="flex shrink-0 items-center gap-1.5 sm:justify-end">
          <div className="min-w-0 flex-1 sm:flex-none">{action}</div>
          <button
            aria-expanded={open}
            aria-label="Project settings"
            className={cn("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground", open && "bg-muted text-foreground", focusRing)}
            onClick={() => setOpen((value) => !value)}
            title="Outcome, hours, status"
            type="button"
          >
            <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </div>
      {open && <div className="mt-3 space-y-3 rounded-xl border bg-background/50 p-3">{settings}</div>}
    </li>
  );
}

const LENGTHS = [
  { value: 15, label: "15m" },
  { value: 30, label: "30m" },
  { value: 60, label: "1h" },
  { value: 120, label: "2h" }
];

// Type a task right in the row; Enter saves it to the project, which then moves to "Needs time".
export function NextStepInline({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    if (!title.trim()) return;
    startTransition(async () => {
      const result = await addNextStepAction(projectId, title, minutes);
      if (result.ok) {
        setTitle("");
        setError(null);
        router.refresh();
      } else setError(result.message);
    });
  };
  return (
    <form
      className="w-full sm:w-[22rem]"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex h-10 items-center rounded-xl border bg-background/60 pl-3 pr-1 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20">
        <label className="sr-only" htmlFor={`next-${projectId}`}>Task</label>
        <input
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
          disabled={pending}
          id={`next-${projectId}`}
          maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Add a task…"
          value={title}
        />
        <div className="relative">
          <label className="sr-only" htmlFor={`len-${projectId}`}>How long</label>
          <select
            className="h-8 appearance-none rounded-lg bg-transparent pl-2 pr-5 text-xs font-medium text-muted-foreground outline-none hover:text-foreground"
            id={`len-${projectId}`}
            onChange={(event) => setMinutes(Number(event.target.value))}
            value={minutes}
          >
            {LENGTHS.map((length) => <option key={length.value} value={length.value}>{length.label}</option>)}
          </select>
          <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-1 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
        </div>
        <button
          aria-label="Add task"
          className={cn("ml-1 inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold transition-colors disabled:opacity-40", title.trim() ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground", focusRing)}
          disabled={pending || !title.trim()}
          type="submit"
        >
          {pending ? "Adding…" : <>Add <CornerDownLeft aria-hidden="true" className="h-3 w-3" /></>}
        </button>
      </div>
      {error && <p aria-live="polite" className="mt-1 text-xs font-medium text-destructive">{error}</p>}
    </form>
  );
}

// For a project that is really regular work (eBay listing, sourcing): turn it into a routine.
export function MakeRoutineButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        className={cn("h-9 rounded-lg border px-3 text-xs font-medium hover:bg-muted disabled:opacity-50", focusRing)}
        disabled={pending}
        onClick={() => startTransition(async () => { const result = await makeRoutineFromProjectAction(projectId); setMessage(result.message); router.refresh(); })}
        title="Regular work, no one-off tasks: fit it into free time instead"
        type="button"
      >
        {pending ? "Making it a routine…" : "↻ Make it a routine"}
      </button>
      {message && <span aria-live="polite" className="text-xs text-muted-foreground">{message}</span>}
    </div>
  );
}
