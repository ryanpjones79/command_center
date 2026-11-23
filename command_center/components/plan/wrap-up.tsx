"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Moon } from "lucide-react";
import { planDoneAction, planTomorrowAction, type TomorrowResult } from "@/app/plan/actions";
import { v2PostponeAction } from "@/app/now/v2-actions";
import { areaLook } from "@/lib/v2/area-look";
import { cn } from "@/lib/utils";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const small = cn("h-8 rounded-lg border px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50", focusRing);

export type WrapTask = { id: string; title: string; areaSlug: string; label: string; due: string | null; overdue: boolean; time: string | null; minutes: number; high: boolean };
type RoutineLine = { title: string; areaSlug: string; done: number; target: number };
type FixedLine = { time: string; label: string; kind: "meeting" | "task" | "routine" };

const MAX_PICKS = 3;

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`step-${n}`} className="rounded-2xl border bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-start gap-3">
        <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-bold text-background">{n}</span>
        <div>
          <h2 className="text-base font-semibold" id={`step-${n}`}>{title}</h2>
          {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function TaskLine({ task }: { task: WrapTask }) {
  return (
    <span className="min-w-0">
      <span className="flex items-center gap-2 font-medium">
        <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", areaLook(task.areaSlug).dot)} />
        <span className="truncate">{task.title}</span>
        {task.high && <span className="shrink-0 text-xs font-bold text-amber-500">!</span>}
      </span>
      <span className="block pl-4 text-xs text-muted-foreground">
        {[task.label, task.time ? `at ${task.time}` : null, task.due ? `${task.overdue ? "overdue · " : "due "}${task.due}` : null].filter(Boolean).join(" · ")}
      </span>
    </span>
  );
}

export function WrapUp({ unfinished, doneToday, routines, candidates, tomorrowFixed, tomorrowLabel, calendarKnown, planHref }: {
  unfinished: WrapTask[]; doneToday: number; routines: RoutineLine[]; candidates: WrapTask[]; tomorrowFixed: FixedLine[]; tomorrowLabel: string; calendarKnown: boolean; planHref: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [settled, setSettled] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [result, setResult] = useState<TomorrowResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const settle = (task: WrapTask, choice: "DONE" | "TOMORROW" | "THIS_WEEK" | "DROP") =>
    startTransition(async () => {
      const outcome = choice === "DONE" ? await planDoneAction(task.id) : await v2PostponeAction(task.id, choice);
      if (!outcome.ok) { setError(outcome.message); return; }
      setError(null);
      setSettled((current) => ({ ...current, [task.id]: choice === "DONE" ? "Done" : choice === "TOMORROW" ? "Tomorrow" : choice === "THIS_WEEK" ? "Later this week" : "Dropped" }));
      if (choice === "TOMORROW" && picked.length < MAX_PICKS) setPicked((current) => [...current, task.id]);
      router.refresh();
    });
  const togglePick = (id: string) => setPicked((current) => (current.includes(id) ? current.filter((item) => item !== id) : current.length >= MAX_PICKS ? current : [...current, id]));
  const plan = () => startTransition(async () => { setResult(await planTomorrowAction(picked)); router.refresh(); });

  const moved = unfinished.filter((task) => settled[task.id] === "Tomorrow");
  const pool = [...moved, ...candidates];
  const visible = showAll ? pool : pool.slice(0, 8);
  const left = unfinished.filter((task) => !settled[task.id]).length;

  return (
    <div className="space-y-4">
      <Step hint={`${doneToday} done today.${unfinished.length ? " Give each of these an outcome." : ""}`} n={1} title="Close out today">
        {unfinished.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Check aria-hidden className="h-4 w-4 text-primary" /> Nothing left hanging from today.</p>
        ) : (
          <ul className="divide-y divide-border/60 rounded-xl border">
            {unfinished.map((task) => (
              <li className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between" key={task.id}>
                <TaskLine task={task} />
                {settled[task.id] ? (
                  <span className="shrink-0 text-xs font-semibold text-primary">✓ {settled[task.id]}</span>
                ) : (
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    <button className={cn(small, "border-primary/40 text-primary")} disabled={pending} onClick={() => settle(task, "DONE")} type="button">Done</button>
                    <button className={small} disabled={pending} onClick={() => settle(task, "TOMORROW")} type="button">Tomorrow</button>
                    <button className={small} disabled={pending} onClick={() => settle(task, "THIS_WEEK")} type="button">Later</button>
                    <button className={small} disabled={pending} onClick={() => settle(task, "DROP")} type="button">Drop</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {error && <p aria-live="polite" className="mt-2 text-sm font-medium text-destructive">{error}</p>}
        {routines.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {routines.map((routine) => (
              <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs", routine.target && routine.done >= routine.target ? "border-primary/40 text-primary" : "text-muted-foreground")} key={routine.title}>
                <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", areaLook(routine.areaSlug).dot)} />
                {routine.title} <span className="tabular-nums font-semibold">{routine.done}/{routine.target}</span>
              </span>
            ))}
            <span className="self-center text-xs text-muted-foreground">routines this week</span>
          </div>
        )}
      </Step>

      <Step hint="The 1 to 3 things that have to happen. They go first; routines fill the rest." n={2} title={`Pick tomorrow's must-dos · ${tomorrowLabel}`}>
        {tomorrowFixed.length > 0 && (
          <div className="mb-3 rounded-xl bg-muted/50 p-3">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Already on tomorrow</p>
            <ul className="space-y-1 text-sm">
              {tomorrowFixed.map((line, index) => (
                <li className="flex gap-3" key={index}>
                  <span className="w-16 shrink-0 tabular-nums text-muted-foreground">{line.time}</span>
                  <span className="min-w-0 truncate">{line.label}{line.kind === "routine" && <span className="text-muted-foreground"> · routine</span>}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {!calendarKnown && <p className="mb-2 text-xs text-amber-600 dark:text-amber-300">Google Calendar couldn&apos;t be read, so tomorrow&apos;s meetings may be missing.</p>}
        {pool.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open to-dos. Tomorrow will be routines and whatever comes in.</p>
        ) : (
          <>
            <ul className="space-y-1.5">
              {visible.map((task) => {
                const on = picked.includes(task.id);
                const full = !on && picked.length >= MAX_PICKS;
                return (
                  <li key={task.id}>
                    <button
                      aria-pressed={on}
                      className={cn("flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors disabled:opacity-40", on ? "border-primary/60 bg-primary/10" : "hover:bg-muted", focusRing)}
                      disabled={full}
                      onClick={() => togglePick(task.id)}
                      type="button"
                    >
                      <span aria-hidden className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px]", on ? "border-transparent bg-primary text-primary-foreground" : "")}>{on ? "✓" : ""}</span>
                      <TaskLine task={task} />
                    </button>
                  </li>
                );
              })}
            </ul>
            {pool.length > 8 && <button className="mt-2 text-xs text-muted-foreground underline underline-offset-2" onClick={() => setShowAll((value) => !value)} type="button">{showAll ? "Show fewer" : `Show all ${pool.length}`}</button>}
          </>
        )}
      </Step>

      <Step hint="Fixed items stay put. Must-dos go first, then anything due, then routines in the gaps. Some time stays free." n={3} title="Plan tomorrow">
        <div className="flex flex-wrap items-center gap-3">
          <button className={cn("inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60", focusRing)} disabled={pending} onClick={plan} type="button">
            <Moon aria-hidden className="h-4 w-4" /> {pending ? "Planning…" : result ? "Plan again" : "Plan tomorrow"}
          </button>
          <p className="text-xs text-muted-foreground">{picked.length} must-do{picked.length === 1 ? "" : "s"} picked{left ? ` · ${left} from today still open` : ""}</p>
        </div>
        {result && (
          <div aria-live="polite" className="mt-4 space-y-3">
            <p className="text-sm font-medium">{result.message}</p>
            {result.placed.length > 0 && (
              <ol className="divide-y divide-border/60 rounded-xl border">
                {result.placed.map((line, index) => (
                  <li className="flex items-center gap-3 px-3 py-2 text-sm" key={index}>
                    <span className="w-24 shrink-0 tabular-nums text-muted-foreground sm:w-40">{line.time}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{line.title}</span>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", line.routine ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary")}>{line.routine ? "routine" : "to-do"}</span>
                  </li>
                ))}
              </ol>
            )}
            {result.unplaced.length > 0 && (
              <p className="text-xs text-muted-foreground">Didn&apos;t fit: {result.unplaced.map((item) => item.title).join(", ")}.</p>
            )}
            <Link className="inline-flex h-10 items-center rounded-xl border px-4 text-sm font-semibold hover:bg-muted" href={planHref}>Open tomorrow in Plan →</Link>
          </div>
        )}
      </Step>
    </div>
  );
}
