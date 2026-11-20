"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addNextStepAction, setAttentionAction, setDesiredOutcomeAction, setProjectStateAction } from "@/app/projects/v2-actions";
import { cn } from "@/lib/utils";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const field = "h-11 rounded-lg border bg-background px-3 text-base";
const ghost = cn("h-10 rounded-lg border bg-background px-3 text-sm font-medium hover:bg-muted disabled:opacity-60", focusRing);

export function ProjectsTabs() {
  const pathname = usePathname();
  const tabs = [
    { href: "/projects", label: "Projects" },
    { href: "/projects/progress", label: "Progress" }
  ];
  return (
    <nav aria-label="Projects sections" className="inline-flex rounded-xl border bg-card p-1">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link aria-current={active ? "page" : undefined} className={cn("rounded-lg px-4 py-2 text-sm font-medium", active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground", focusRing)} href={tab.href} key={tab.href}>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    startTransition(async () => {
      const result = await fn();
      setMessage(result.message);
      router.refresh();
    });
  return { pending, message, run };
}

export function NextStepForm({ projectId }: { projectId: string }) {
  const { pending, message, run } = useRun();
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState("30");
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        run(() => addNextStepAction(projectId, title, Number(minutes)));
        setTitle("");
      }}
    >
      <label className="min-w-48 flex-1 text-sm">
        Next concrete step
        <input className={cn(field, "mt-1 w-full")} onChange={(event) => setTitle(event.target.value)} placeholder="What moves this forward?" value={title} />
      </label>
      <label className="text-sm">
        Minutes
        <input className={cn(field, "mt-1 w-24")} inputMode="numeric" min={15} onChange={(event) => setMinutes(event.target.value)} type="number" value={minutes} />
      </label>
      <button className={ghost} disabled={pending || !title.trim()} type="submit">Add</button>
      {message && <p aria-live="polite" className="basis-full text-sm text-muted-foreground">{message}</p>}
    </form>
  );
}

export function AttentionInput({ projectId, hours }: { projectId: string; hours: number }) {
  const { pending, message, run } = useRun();
  const [value, setValue] = useState(String(hours || ""));
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        run(() => setAttentionAction(projectId, Number(value)));
      }}
    >
      <label className="text-sm text-muted-foreground" htmlFor={`att-${projectId}`}>Hours this week</label>
      <input className={cn(field, "w-20")} id={`att-${projectId}`} inputMode="decimal" min={0} onChange={(event) => setValue(event.target.value)} step="0.5" type="number" value={value} />
      <button className={ghost} disabled={pending} type="submit">Set</button>
      {message && <span aria-live="polite" className="text-xs text-muted-foreground">{message}</span>}
    </form>
  );
}

export function ProjectStateMenu({ projectId }: { projectId: string }) {
  const { pending, message, run } = useRun();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {(["ACTIVE", "MONITORING", "PAUSED", "CLOSED"] as const).map((state) => (
        <button className={cn(ghost, "h-9 px-2.5 text-xs")} disabled={pending} key={state} onClick={() => run(() => setProjectStateAction(projectId, state))} type="button">
          {state === "ACTIVE" ? "Active" : state === "MONITORING" ? "Monitoring" : state === "PAUSED" ? "Pause" : "Close"}
        </button>
      ))}
      {message && <span aria-live="polite" className="text-xs text-muted-foreground">{message}</span>}
    </div>
  );
}

export function OutcomeEditor({ projectId, outcome }: { projectId: string; outcome: string | null }) {
  const { pending, message, run } = useRun();
  const [editing, setEditing] = useState(!outcome);
  const [value, setValue] = useState(outcome ?? "");
  if (!editing) {
    return (
      <p className="text-[15px]">
        <span className="text-muted-foreground">Outcome: </span>
        {outcome}{" "}
        <button className="-my-2 inline-flex min-h-10 items-center px-2 text-xs text-muted-foreground underline underline-offset-2" onClick={() => setEditing(true)} type="button">edit</button>
      </p>
    );
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        run(() => setDesiredOutcomeAction(projectId, value));
        setEditing(false);
      }}
    >
      <label className="sr-only" htmlFor={`out-${projectId}`}>Desired outcome</label>
      <input className={cn(field, "min-w-48 flex-1")} id={`out-${projectId}`} onChange={(event) => setValue(event.target.value)} placeholder="Desired outcome (one sentence)" value={value} />
      <button className={ghost} disabled={pending} type="submit">Save</button>
      {message && <span className="text-xs text-muted-foreground">{message}</span>}
    </form>
  );
}
