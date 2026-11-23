"use client";

import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { quickAddAction, type PlanMessage } from "@/app/plan/actions";
import { areaLook } from "@/lib/v2/area-look";
import type { QuickTarget } from "@/lib/v2/quick-add";

// New task panel: say what it is, pick where it goes (project chips grouped by area), and optionally when,
// how long, how important, and who you're waiting on. Opened from Plan's task drawer, from each project, and
// from Now. Shorthand typed in the title (#project, fri, at 3pm, 30m, @name, !) still works.

type Priority = "MEDIUM" | "HIGH" | "CRITICAL";
const LENGTHS = [15, 30, 45, 60, 90, 120];
const fmtLength = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}` : `${minutes}m`);

function dayKey(offset: number, timeZone: string) {
  return new Date(Date.now() + offset * 86_400_000).toLocaleDateString("en-CA", { timeZone });
}
function dayName(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
}
function clockName(time: string) {
  const [h, m] = time.split(":").map(Number);
  return new Date(Date.UTC(2000, 0, 1, h, m)).toLocaleTimeString("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit" });
}

type Props = { targets: QuickTarget[]; timeZone: string; presetId?: string | null; onClose: () => void; onDone?: (result: PlanMessage) => void };

export function TaskComposer({ targets, timeZone, presetId = null, onClose, onDone }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [targetId, setTargetId] = useState<string | null>(presetId);
  const [picking, setPicking] = useState(!presetId);
  const [search, setSearch] = useState("");
  const [day, setDay] = useState<string | null>(null);
  const [pickDate, setPickDate] = useState(false);
  const [time, setTime] = useState<string>("");
  const [minutes, setMinutes] = useState(30);
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [waitingOn, setWaitingOn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    titleRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const areas = useMemo(() => targets.filter((target) => target.kind === "AREA"), [targets]);
  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    return areas
      .map((area) => ({
        area,
        projects: targets.filter((target) => target.kind === "PROJECT" && target.domainId === area.id && (!term || target.name.toLowerCase().includes(term) || area.name.toLowerCase().includes(term)))
      }))
      .filter((group) => !term || group.projects.length > 0 || group.area.name.toLowerCase().includes(term));
  }, [areas, targets, search]);

  const target = targets.find((item) => item.id === targetId) ?? null;
  const targetArea = target ? areas.find((area) => area.id === target.domainId) ?? null : null;
  const slug = targetArea?.slug ?? "";

  const today = dayKey(0, timeZone);
  const tomorrow = dayKey(1, timeZone);
  const dayChoices = [
    { key: null as string | null, label: "No date" },
    { key: today, label: "Today" },
    { key: tomorrow, label: "Tomorrow" },
    ...[2, 3, 4, 5, 6].map((offset) => { const key = dayKey(offset, timeZone); return { key, label: dayName(key).split(",")[0] }; })
  ];

  const summary = [
    target ? (target.kind === "PROJECT" ? target.name : `${target.name} · no project`) : "Admin · no project",
    time ? `on the calendar ${day ? dayName(day) : "today"} ${clockName(time)}` : day ? `due ${day === today ? "today" : day === tomorrow ? "tomorrow" : dayName(day)}` : null,
    fmtLength(minutes),
    priority !== "MEDIUM" ? (priority === "CRITICAL" ? "critical" : "high priority") : null,
    waitingOn.trim() ? `waiting on ${waitingOn.trim()}` : null
  ].filter(Boolean).join(" · ");

  const save = (again: boolean) => {
    if (!title.trim()) { setError("Say what the task is first."); titleRef.current?.focus(); return; }
    setError(null);
    startTransition(async () => {
      const result = await quickAddAction(title, targetId, { day, time: time || null, minutes, priority, waitingOn: waitingOn.trim() || null });
      onDone?.(result);
      router.refresh();
      if (!result.ok) { setError(result.message); return; }
      if (again) {
        setSaved(result.message);
        setTitle("");
        setWaitingOn("");
        titleRef.current?.focus();
      } else onClose();
    });
  };

  const chip = (active: boolean) => `rounded-full border px-3 py-1.5 text-sm transition-colors ${active ? "border-transparent bg-foreground font-semibold text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`;

  return (
    <div aria-labelledby="new-task-title" aria-modal className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose} role="dialog">
      <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border bg-card shadow-2xl sm:rounded-3xl" onClick={(event) => event.stopPropagation()}>
        <div className={`h-1 w-full ${target ? areaLook(slug).dot : "bg-gradient-to-r from-emerald-400 via-cyan-400 to-violet-500"}`} />
        <div className="flex items-center justify-between px-5 pt-4">
          <h2 className="eyebrow" id="new-task-title">New task</h2>
          <button aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" onClick={onClose} type="button">×</button>
        </div>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => { event.preventDefault(); save(false); }}>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-4 pt-2">
            <div>
              <label className="sr-only" htmlFor="task-title">What needs doing?</label>
              <input
                className="w-full border-0 bg-transparent p-0 text-2xl font-semibold tracking-tight placeholder:font-normal placeholder:text-muted-foreground/60 focus:outline-none focus:ring-0"
                id="task-title"
                maxLength={300}
                onChange={(event) => { setTitle(event.target.value); setError(null); setSaved(null); }}
                placeholder="What needs doing?"
                ref={titleRef}
                value={title}
              />
              {error && <p className="mt-1 text-sm font-medium text-destructive" role="alert">{error}</p>}
              {saved && !error && <p className="mt-1 text-sm text-primary" role="status">✓ {saved} Add the next one.</p>}
            </div>

            {/* Where it goes */}
            <section aria-label="Project">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Project</p>
                {target && !picking && <button className="text-xs font-medium text-primary hover:underline" onClick={() => setPicking(true)} type="button">Change</button>}
              </div>
              {target && !picking ? (
                <button className={`mt-2 flex w-full items-center gap-3 rounded-2xl border border-l-[3px] px-4 py-3 text-left ${areaLook(slug).card}`} onClick={() => setPicking(true)} type="button">
                  <span aria-hidden className={`h-3 w-3 shrink-0 rounded-full ${areaLook(slug).dot}`} />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{target.kind === "PROJECT" ? target.name : `${target.name} (no project)`}</span>
                    <span className="block text-xs text-muted-foreground">{targetArea?.name}</span>
                  </span>
                </button>
              ) : (
                <div className="mt-2 rounded-2xl border bg-background/40 p-2">
                  <label className="sr-only" htmlFor="task-project-search">Find a project</label>
                  <input
                    className="w-full rounded-xl border bg-card px-3 py-2 text-sm placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    id="task-project-search"
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Find a project or area…"
                    type="search"
                    value={search}
                  />
                  <div className="mt-2 max-h-56 space-y-3 overflow-y-auto px-1 pb-1">
                    {groups.map(({ area, projects }) => (
                      <div key={area.id}>
                        <p className="flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          <span aria-hidden className={`h-2 w-2 rounded-full ${areaLook(area.slug ?? "").dot}`} />{area.name}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {projects.map((project) => (
                            <button aria-pressed={targetId === project.id} className={chip(targetId === project.id)} key={project.id} onClick={() => { setTargetId(project.id); setPicking(false); setSearch(""); }} type="button">{project.name}</button>
                          ))}
                          <button aria-pressed={targetId === area.id} className={`${chip(targetId === area.id)} border-dashed`} onClick={() => { setTargetId(area.id); setPicking(false); setSearch(""); }} type="button">No project</button>
                        </div>
                      </div>
                    ))}
                    {groups.length === 0 && <p className="px-1 text-sm text-muted-foreground">Nothing matches. Clear the search, or add the project from Projects first.</p>}
                  </div>
                </div>
              )}
            </section>

            {/* When */}
            <section aria-label="When">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">When</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {dayChoices.map((choice) => (
                  <button aria-pressed={day === choice.key && !pickDate} className={chip(day === choice.key && !pickDate)} key={choice.label} onClick={() => { setDay(choice.key); setPickDate(false); }} type="button">{choice.label}</button>
                ))}
                <button aria-pressed={pickDate} className={chip(pickDate)} onClick={() => setPickDate(true)} type="button">Pick a date</button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {pickDate && (
                  <>
                    <label className="sr-only" htmlFor="task-date">Date</label>
                    <input className="rounded-xl border bg-background px-3 py-2 text-sm" id="task-date" min={today} onChange={(event) => setDay(event.target.value || null)} type="date" value={day ?? ""} />
                  </>
                )}
                <label className="flex items-center gap-2 rounded-xl border bg-background px-3 py-1.5 text-sm text-muted-foreground">
                  At
                  <input aria-label="Time (puts it on the calendar)" className="bg-transparent text-foreground focus:outline-none" onChange={(event) => setTime(event.target.value)} step={900} type="time" value={time} />
                </label>
                {time && <button className="text-xs text-muted-foreground underline underline-offset-2" onClick={() => setTime("")} type="button">no time</button>}
                <span className="text-xs text-muted-foreground">{time ? "Goes on your calendar (and Google)." : "Add a time to put it on the calendar."}</span>
              </div>
            </section>

            {/* Length and priority */}
            <div className="grid gap-5 sm:grid-cols-2">
              <section aria-label="How long">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">How long</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {LENGTHS.map((value) => <button aria-pressed={minutes === value} className={chip(minutes === value)} key={value} onClick={() => setMinutes(value)} type="button">{fmtLength(value)}</button>)}
                </div>
              </section>
              <section aria-label="Priority">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Priority</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {([["MEDIUM", "Normal"], ["HIGH", "High !"], ["CRITICAL", "Critical !!"]] as const).map(([value, label]) => (
                    <button aria-pressed={priority === value} className={priority === value && value !== "MEDIUM" ? "rounded-full border border-transparent bg-amber-500 px-3 py-1.5 text-sm font-semibold text-black" : chip(priority === value)} key={value} onClick={() => setPriority(value)} type="button">{label}</button>
                  ))}
                </div>
              </section>
            </div>

            <section aria-label="Waiting on">
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground" htmlFor="task-waiting">Waiting on someone? <span className="font-normal normal-case tracking-normal">(optional)</span></label>
              <input className="mt-2 w-full rounded-xl border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/60" id="task-waiting" maxLength={80} onChange={(event) => setWaitingOn(event.target.value)} placeholder="Name" value={waitingOn} />
            </section>
          </div>

          <div className="border-t bg-background/40 px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <p className="mb-2 truncate text-xs text-muted-foreground"><span aria-hidden>→ </span>{summary}</p>
            <div className="flex gap-2">
              <button className="rounded-xl border px-3 py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-60" disabled={pending} onClick={() => save(true)} type="button">Add + another</button>
              <button className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60" disabled={pending} type="submit">{pending ? "Adding…" : "Add task"}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// Button that opens the panel. "field" looks like an input (Plan drawer, Now); "chip" is a small pill (project cards).
export function NewTaskButton({ targets, timeZone, presetId = null, variant = "field", label, highlight = false, onDone }: {
  targets: QuickTarget[]; timeZone: string; presetId?: string | null; variant?: "field" | "chip"; label?: string; highlight?: boolean; onDone?: (result: PlanMessage) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {variant === "field" ? (
        <button className="flex w-full items-center gap-3 rounded-xl border bg-card px-3 py-3 text-left text-[15px] text-muted-foreground shadow-sm transition-colors hover:border-primary/60 hover:text-foreground" onClick={() => setOpen(true)} type="button">
          <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400 text-sm font-bold text-black">+</span>
          {label ?? "New task"}
        </button>
      ) : (
        <button className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${highlight ? "border-amber-500/50 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:text-amber-300" : "hover:border-primary/60 hover:text-primary"}`} onClick={() => setOpen(true)} type="button">
          {label ?? "+ Add task"}
        </button>
      )}
      {/* Rendered on <body>: cards use transforms and blur, which would trap a fixed panel inside them. */}
      {open && createPortal(<TaskComposer onClose={() => setOpen(false)} onDone={onDone} presetId={presetId} targets={targets} timeZone={timeZone} />, document.body)}
    </>
  );
}
