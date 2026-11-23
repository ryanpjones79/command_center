"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { fillDayAction, moveBlockAction, planDoneAction, quickAddAction, waitingOnAction, type PlanMessage } from "@/app/plan/actions";
import type { Board, BoardArea, BoardTask } from "@/server/v2/board";
import { parseQuickAdd, type QuickTarget } from "@/lib/v2/quick-add";
import { QUICK_FILTERS, SOURCE_LABEL, suggestTargets, TAG_AT_END, taskMatches, type QuickFilter } from "@/lib/v2/plan-filters";

// Plan: every open task on the left (grouped by area and project, feed items labelled by source), the calendar
// on the right. Drag a task onto the calendar to schedule it, drag a block to move it, pull its bottom edge to
// change its length, drag it back to the list to unschedule it. On a phone, tap Schedule and pick a time.

const PX_PER_MIN = 1;
const SNAP = 15;
const DRAG_TYPE = "application/x-ryanos-task";
const MIN = 60_000;

const AREA_STYLE: Record<string, string> = {
  ebay: "border-l-amber-500 bg-amber-500/10",
  rykas: "border-l-orange-600 bg-orange-600/10",
  "betting-models": "border-l-violet-500 bg-violet-500/10",
  "casino-ap": "border-l-fuchsia-500 bg-fuchsia-500/10",
  work: "border-l-sky-600 bg-sky-600/10",
  health: "border-l-emerald-600 bg-emerald-600/10",
  golf: "border-l-lime-600 bg-lime-600/10",
  family: "border-l-rose-500 bg-rose-500/10",
  opportunities: "border-l-teal-600 bg-teal-600/10"
};
const areaStyle = (slug: string) => AREA_STYLE[slug] ?? "border-l-slate-500 bg-slate-500/10";

type DragPayload = { taskId: string; minutes: number; mode: "task" | "block"; grabMin: number };
type Override = { start: string | null; end: string | null };

function minutesInZone(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}
const clock = (iso: string, timeZone: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
const dayLabel = (iso: string, timeZone: string) => new Date(iso).toLocaleDateString("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" });
const dateKey = (iso: string, timeZone: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone });
const shortDate = (iso: string, timeZone: string) => new Date(iso).toLocaleDateString("en-US", { timeZone, month: "short", day: "numeric" });
const snap = (minutes: number) => Math.round(minutes / SNAP) * SNAP;
// Dropping inside a quarter-hour slot starts the block at that slot's top.
const snapDown = (minutes: number) => Math.floor(minutes / SNAP) * SNAP;
const fmtLength = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}` : `${minutes}m`);

// Phones (narrower than 768px) get the stacked layout with today's calendar pinned on top.
function useIsPhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setPhone(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return phone;
}

function readPayload(event: React.DragEvent): DragPayload | null {
  try {
    const raw = event.dataTransfer.getData(DRAG_TYPE);
    return raw ? (JSON.parse(raw) as DragPayload) : null;
  } catch {
    return null;
  }
}

const CLOSED_KEY = "ryanos.plan.closedAreas";

function readClosed(): Set<string> {
  try { return new Set(JSON.parse(window.localStorage.getItem(CLOSED_KEY) ?? "[]") as string[]); } catch { return new Set(); }
}
function writeClosed(closed: Set<string>) {
  try { window.localStorage.setItem(CLOSED_KEY, JSON.stringify([...closed])); } catch { /* storage unavailable: still works, just not remembered */ }
}

export function PlanBoard({ board, view }: { board: Board; view: "day" | "3" | "week" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<PlanMessage | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [scheduling, setScheduling] = useState<BoardTask | null>(null);
  // Tap a task, then tap a time: the task waiting to be placed.
  const [picked, setPicked] = useState<BoardTask | null>(null);
  const phone = useIsPhone();
  const [query, setQuery] = useState("");
  const [areaFilter, setAreaFilter] = useState<string | null>(null);
  const [quick, setQuick] = useState<Set<QuickFilter>>(new Set());
  const [closed, setClosed] = useState<Set<string>>(new Set());
  useEffect(() => setClosed(readClosed()), []);
  const toggleQuick = (key: QuickFilter) => setQuick((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else {
      next.add(key);
      if (key === "apps") next.delete("mine");
      if (key === "mine") next.delete("apps");
    }
    return next;
  });
  const setAreaOpen = (slug: string, open: boolean) => setClosed((current) => {
    const next = new Set(current);
    if (open) next.delete(slug); else next.add(slug);
    writeClosed(next);
    return next;
  });
  const tz = board.timeZone;

  useEffect(() => setOverrides({}), [board]);

  function run(action: () => Promise<PlanMessage>, optimistic?: Record<string, Override>) {
    if (optimistic) setOverrides((current) => ({ ...current, ...optimistic }));
    startTransition(async () => {
      const result = await action();
      setMessage(result);
      if (!result.ok && optimistic) setOverrides({});
      router.refresh();
    });
  }

  const allTasks = useMemo(() => {
    const map = new Map<string, BoardTask>();
    for (const area of board.areas) {
      for (const project of area.projects) for (const task of project.tasks) map.set(task.id, task);
      for (const task of area.loose) map.set(task.id, task);
    }
    for (const task of [...board.blocks, ...board.waiting]) map.set(task.id, task);
    return map;
  }, [board]);

  const withOverride = (task: BoardTask): BoardTask => (overrides[task.id] ? { ...task, ...overrides[task.id] } : task);
  const blocks = [...new Set([...board.blocks.map((task) => task.id), ...Object.keys(overrides)])]
    .map((id) => allTasks.get(id))
    .filter((task): task is BoardTask => Boolean(task))
    .map(withOverride)
    .filter((task) => task.start && task.end);

  const filtering = Boolean(query.trim() || areaFilter || quick.size);
  const keep = (task: BoardTask) => taskMatches(withOverride(task), query, quick);
  const totalOpen = board.areas.reduce((sum, area) => sum + area.loose.length + area.projects.reduce((n, project) => n + project.tasks.length, 0), 0) + board.waiting.length;
  const shownAreas = board.areas
    .filter((area) => !areaFilter || area.slug === areaFilter)
    .map((area) => filtering
      ? { ...area, projects: area.projects.map((project) => ({ ...project, tasks: project.tasks.filter(keep) })).filter((project) => project.tasks.length > 0), loose: area.loose.filter(keep) }
      : area)
    .filter((area) => !filtering || area.projects.length > 0 || area.loose.length > 0);
  const shownWaiting = board.waiting.filter((task) => (!areaFilter || task.areaSlug === areaFilter) && keep(task));
  const shownCount = shownAreas.reduce((sum, area) => sum + area.loose.length + area.projects.reduce((n, project) => n + project.tasks.length, 0), 0) + shownWaiting.length;

  const schedule = (task: BoardTask, start: Date, minutes: number) => {
    const end = new Date(start.getTime() + minutes * MIN);
    run(() => moveBlockAction(task.id, start.toISOString(), end.toISOString()), { [task.id]: { start: start.toISOString(), end: end.toISOString() } });
  };
  const unschedule = (taskId: string) => run(() => moveBlockAction(taskId, null, null), { [taskId]: { start: null, end: null } });
  const done = (taskId: string) => run(() => planDoneAction(taskId));
  const togglePick = (task: BoardTask) => {
    // The calendar is pinned above the list on phones, so it stays in view while picking.
    setPicked((current) => (current?.id === task.id ? null : task));
  };

  const first = board.days[0];
  const step = view === "week" ? 7 : view === "3" ? 3 : 1;
  const shift = (days: number) => dateKey(new Date(Date.parse(first) + days * 86_400_000 + 12 * 3_600_000).toISOString(), tz);
  const viewHref = (nextView: string, date?: string) => `/plan?view=${nextView}${date ? `&date=${date}` : ""}`;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Plan</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {dayLabel(first, tz)}
            {board.days.length > 1 ? ` – ${dayLabel(board.days[board.days.length - 1], tz)}` : ""}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <nav aria-label="Days shown" className="hidden overflow-hidden rounded-xl border md:flex">
            {(["day", "3", "week"] as const).map((option) => (
              <Link aria-current={option === view ? "page" : undefined} className={`px-3 py-2 ${option === view ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`} href={viewHref(option, dateKey(first, tz))} key={option}>
                {option === "day" ? "Day" : option === "3" ? "3 days" : "Week"}
              </Link>
            ))}
          </nav>
          <div className="flex overflow-hidden rounded-xl border">
            <Link aria-label="Earlier" className="px-3 py-2 hover:bg-muted" href={viewHref(view, shift(-step))}>‹</Link>
            <Link className="border-x px-3 py-2 hover:bg-muted" href={viewHref(view)}>Today</Link>
            <Link aria-label="Later" className="px-3 py-2 hover:bg-muted" href={viewHref(view, shift(step))}>›</Link>
          </div>
          <button className="rounded-xl bg-primary px-3 py-2 font-semibold text-primary-foreground disabled:opacity-60" disabled={pending} onClick={() => run(() => fillDayAction())} type="button">
            Fill my day
          </button>
        </div>
      </header>

      <QuickAdd onDone={(result) => { setMessage(result); router.refresh(); }} targets={board.targets} timeZone={tz} />

      <div aria-live="polite" className="min-h-6 text-sm">
        {message && <p className={message.ok ? "text-muted-foreground" : "font-medium text-destructive"}>{message.message}</p>}
        {!board.calendarKnown && <p className="text-amber-700 dark:text-amber-400">Google Calendar couldn&apos;t be read, so meetings may be missing.</p>}
        {board.calendarSync.enabled && !board.calendarSync.ok && <p className="text-amber-700 dark:text-amber-400">Google Calendar sync: {board.calendarSync.message}</p>}
      </div>

      {/* Phone: today's calendar stays pinned above the lists. Tablet and up: lists left, calendar right. */}
      <div className="flex flex-col gap-4 md:grid md:grid-cols-[minmax(300px,380px)_1fr]">
        <section aria-label="Calendar" className="sticky top-[3.6rem] z-30 order-first -mx-4 min-w-0 border-b bg-background px-4 pb-2 pt-1 sm:-mx-6 sm:px-6 md:static md:order-last md:mx-0 md:border-0 md:bg-transparent md:p-0">
          {picked && (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-primary/50 bg-primary/10 px-3 py-2 text-sm" role="status">
              <span className="min-w-0 truncate">Tap a time for <b>{picked.title}</b> ({fmtLength(picked.minutes)})</span>
              <button className="shrink-0 rounded-lg border bg-background px-2 py-1 text-xs" onClick={() => setPicked(null)} type="button">Cancel</button>
            </div>
          )}
          <CalendarGrid
            allTasks={allTasks}
            blocks={blocks}
            board={board}
            compact={phone}
            days={phone ? board.days.slice(0, 1) : board.days}
            onDone={done}
            onOpenBlock={setScheduling}
            onPlace={(start) => { if (picked) { schedule(picked, start, picked.minutes); setPicked(null); } }}
            onSchedule={schedule}
            onUnschedule={unschedule}
            picked={picked}
          />
        </section>

        <section
          aria-label="Projects and tasks"
          className="min-w-0 space-y-3 md:max-h-[calc(100vh-12rem)] md:overflow-y-auto md:pr-1"
          onDragOver={(event) => { if (event.dataTransfer.types.includes(DRAG_TYPE)) event.preventDefault(); }}
          onDrop={(event) => {
            const payload = readPayload(event);
            if (payload?.mode === "block") { event.preventDefault(); unschedule(payload.taskId); }
          }}
        >
          <div className="space-y-2 rounded-2xl border bg-card p-3">
            <label className="sr-only" htmlFor="plan-search">Search tasks</label>
            <input
              className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              id="plan-search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search tasks, projects, apps…"
              type="search"
              value={query}
            />
            <div aria-label="Filter by area" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 text-xs" role="group">
              {[{ slug: null as string | null, name: "All" }, ...board.areas.map((area) => ({ slug: area.slug as string | null, name: area.name }))].map((option) => (
                <button aria-pressed={areaFilter === option.slug} className={`shrink-0 rounded-full border px-2.5 py-1 ${areaFilter === option.slug ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`} key={option.slug ?? "all"} onClick={() => setAreaFilter(option.slug)} type="button">
                  {option.name}
                </button>
              ))}
            </div>
            <div aria-label="Quick filters" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 text-xs" role="group">
              {QUICK_FILTERS.map((option) => (
                <button aria-pressed={quick.has(option.key)} className={`shrink-0 rounded-full border px-2.5 py-1 ${quick.has(option.key) ? "border-primary bg-primary/15 font-semibold" : "hover:bg-muted"}`} key={option.key} onClick={() => toggleQuick(option.key)} type="button">
                  {option.label}
                </button>
              ))}
              {filtering && (
                <button className="ml-auto shrink-0 px-1 text-muted-foreground underline underline-offset-2" onClick={() => { setQuery(""); setAreaFilter(null); setQuick(new Set()); }} type="button">
                  Clear ({shownCount} of {totalOpen})
                </button>
              )}
            </div>
          </div>
          {shownAreas.map((area) => (
            <AreaList
              area={area}
              filtering={filtering}
              key={area.id}
              onDone={done}
              onMessage={(result) => { setMessage(result); router.refresh(); }}
              onOpenChange={(open) => setAreaOpen(area.slug, open)}
              onPick={togglePick}
              onSchedule={setScheduling}
              open={filtering || !closed.has(area.slug)}
              overrides={overrides}
              pickedId={picked?.id ?? null}
              timeZone={tz}
            />
          ))}
          {filtering && shownCount === 0 && <p className="rounded-2xl border p-4 text-sm text-muted-foreground">Nothing matches. <button className="underline underline-offset-2" onClick={() => { setQuery(""); setAreaFilter(null); setQuick(new Set()); }} type="button">Clear filters</button></p>}
          {shownWaiting.length > 0 && (
            <details className="rounded-2xl border bg-card p-3" onToggle={(event) => { if (!filtering) setAreaOpen("__waiting", event.currentTarget.open); }} open={filtering || !closed.has("__waiting")}>
              <summary className="cursor-pointer text-sm font-semibold">Waiting on others ({shownWaiting.length})</summary>
              <ul className="mt-2 space-y-1.5">
                {shownWaiting.map((task) => (
                  <TaskCard key={task.id} onDone={done} onMessage={(result) => { setMessage(result); router.refresh(); }} onPick={togglePick} onSchedule={setScheduling} pickedId={picked?.id ?? null} task={withOverride(task)} timeZone={tz} />
                ))}
              </ul>
            </details>
          )}
          {board.areas.length === 0 && board.waiting.length === 0 && <p className="rounded-2xl border p-4 text-sm text-muted-foreground">No open tasks. Add one above.</p>}
        </section>

      </div>

      {scheduling && <ScheduleSheet blocks={blocks} board={board} onClose={() => setScheduling(null)} onDone={() => { done(scheduling.id); setScheduling(null); }} onPick={(start, minutes) => { schedule(scheduling, start, minutes); setScheduling(null); }} onUnschedule={() => { unschedule(scheduling.id); setScheduling(null); }} task={withOverride(scheduling)} />}
    </div>
  );
}

// Stand-alone quick add (used on Now): shows its own result line.
export function QuickAddBox({ targets, timeZone }: { targets: QuickTarget[]; timeZone: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<PlanMessage | null>(null);
  return (
    <div className="space-y-2">
      <QuickAdd onDone={(result) => { setMessage(result); router.refresh(); }} targets={targets} timeZone={timeZone} />
      <p aria-live="polite" className={`min-h-5 text-sm ${message && !message.ok ? "font-medium text-destructive" : "text-muted-foreground"}`}>{message?.message}</p>
    </div>
  );
}

function areaNameFor(target: QuickTarget, targets: QuickTarget[]) {
  return targets.find((other) => other.kind === "AREA" && other.id === target.domainId)?.name ?? null;
}

// Where the task will land and what was understood, shown before it is saved.
function previewLine(text: string, targets: QuickTarget[], chosen: QuickTarget | null, timeZone: string) {
  if (!text.trim()) return null;
  const parsed = parseQuickAdd(text, targets, new Date(), timeZone, chosen);
  const target = targets.find((item) => item.kind === "PROJECT" && item.id === parsed.projectId)
    ?? targets.find((item) => item.kind === "AREA" && item.id === parsed.domainId) ?? null;
  const where = target
    ? target.kind === "PROJECT"
      ? `${target.name}${areaNameFor(target, targets) && areaNameFor(target, targets) !== target.name ? ` (${areaNameFor(target, targets)})` : ""}`
      : `${target.name} · no project`
    : "Admin · no project (add #project to file it)";
  const day = (value: Date) => value.toLocaleDateString("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" });
  const bits = [
    parsed.start ? `on calendar ${day(parsed.start)} ${parsed.start.toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" })}` : null,
    parsed.dueDate ? `due ${day(parsed.dueDate)}` : null,
    parsed.minutes ? fmtLength(parsed.minutes) : null,
    parsed.waitingOn ? `waiting on ${parsed.waitingOn}` : null,
    parsed.priority !== "MEDIUM" ? (parsed.priority === "CRITICAL" ? "critical" : "high priority") : null
  ].filter(Boolean);
  return { where, bits, unknown: parsed.unmatchedTag, title: parsed.title };
}

function QuickAdd({ onDone, projectId = null, compact = false, targets = [], timeZone = "America/Los_Angeles" }: {
  onDone: (result: PlanMessage) => void; projectId?: string | null; compact?: boolean; targets?: QuickTarget[]; timeZone?: string;
}) {
  const [text, setText] = useState("");
  const [chosen, setChosen] = useState<QuickTarget | null>(null);
  const [pending, startTransition] = useTransition();
  const tag = compact ? null : text.match(TAG_AT_END);
  const suggestions = tag ? suggestTargets(tag[2], targets) : [];
  const preview = compact ? null : previewLine(text, targets, chosen, timeZone);

  const choose = (target: QuickTarget) => {
    setChosen(target);
    setText((current) => current.replace(TAG_AT_END, "$1").replace(/\s+$/, "") + (current.replace(TAG_AT_END, "").trim() ? " " : ""));
  };
  const save = () => {
    if (!text.trim() || pending) return;
    startTransition(async () => {
      const result = await quickAddAction(text, compact ? projectId : chosen?.id ?? null);
      if (result.ok) { setText(""); setChosen(null); }
      onDone(result);
    });
  };
  const id = compact ? `add-${projectId}` : "quick-add";
  const byArea = targets.filter((target) => target.kind === "AREA").map((area) => ({ area, projects: targets.filter((target) => target.kind === "PROJECT" && target.domainId === area.id) }));

  return (
    <div className="relative">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (suggestions.length) choose(suggestions[0]); // Enter while picking a #project takes the first match
          else save();
        }}
      >
        <label className="sr-only" htmlFor={id}>{compact ? "Add a task to this project" : "Add a task"}</label>
        <input
          aria-autocomplete={compact ? undefined : "list"}
          aria-controls={suggestions.length ? `${id}-suggestions` : undefined}
          autoComplete="off"
          className={`min-w-0 flex-1 rounded-xl border bg-background px-3 ${compact ? "py-1.5 text-sm" : "py-2.5"} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
          id={id}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Escape" && tag) setText((current) => current.replace(TAG_AT_END, "$1")); }}
          placeholder={compact ? "Add task…" : "Add a task — type # to pick a project"}
          value={text}
        />
        {!compact && targets.length > 0 && (
          <>
            {/* A native picker (works well on phones) behind a small folder button. */}
            <div className="relative w-11 shrink-0">
              <span aria-hidden className={`pointer-events-none flex h-full items-center justify-center rounded-xl border text-base ${chosen ? "border-primary bg-primary/10" : "bg-background"}`}>📁</span>
              <label className="sr-only" htmlFor={`${id}-project`}>Choose a project</label>
              <select
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                id={`${id}-project`}
                onChange={(event) => setChosen(targets.find((target) => target.id === event.target.value) ?? null)}
                title="Choose a project"
                value={chosen?.id ?? ""}
              >
                <option value="">No project</option>
                {byArea.map(({ area, projects }) => (
                  <optgroup key={area.id} label={area.name}>
                    <option value={area.id}>{area.name} (no project)</option>
                    {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
          </>
        )}
        <button className={`rounded-xl border px-3 ${compact ? "text-sm" : ""} font-medium hover:bg-muted disabled:opacity-60`} disabled={pending || !text.trim()} type="submit">Add</button>
        {!compact && (
          <details className="relative hidden sm:block">
            <summary className="flex h-full cursor-pointer list-none items-center rounded-xl border px-3 text-sm text-muted-foreground hover:bg-muted">Tips</summary>
            <div className="absolute right-0 z-40 mt-2 w-72 rounded-xl border bg-card p-3 text-sm shadow-lg">
              <ul className="space-y-1">
                <li><b>#</b> then a few letters: pick a project from the list</li>
                <li><b>fri</b>, <b>tomorrow</b>, <b>11/30</b> due that day</li>
                <li><b>at 3pm</b> puts it on the calendar</li>
                <li><b>30m</b>, <b>1h</b> how long it takes</li>
                <li><b>@Heidi</b> waiting on Heidi</li>
                <li><b>!</b> high priority, <b>!!</b> critical</li>
              </ul>
            </div>
          </details>
        )}
      </form>

      {suggestions.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-40 mt-1 max-h-72 overflow-y-auto rounded-xl border bg-card p-1 shadow-lg" id={`${id}-suggestions`} role="listbox">
          {suggestions.map((target, index) => (
            <li aria-selected={index === 0} key={target.id} role="option">
              <button className="flex w-full items-baseline justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => choose(target)} onMouseDown={(event) => event.preventDefault()} type="button">
                <span className="font-medium">{target.name}</span>
                <span className="text-xs text-muted-foreground">{target.kind === "AREA" ? "area" : areaNameFor(target, targets)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!compact && (chosen || preview) && (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <span aria-hidden>→</span>
          {chosen ? (
            <span className="inline-flex items-center gap-1 rounded-lg border border-primary/50 bg-primary/10 px-2 py-0.5 font-medium text-foreground">
              {chosen.kind === "AREA" ? `${chosen.name} · no project` : chosen.name}
              <button aria-label="Clear project" className="px-0.5" onClick={() => setChosen(null)} type="button">×</button>
            </span>
          ) : (
            <span className={preview?.where.startsWith("Admin") ? "" : "font-medium text-foreground"}>{preview?.where}</span>
          )}
          {preview?.bits.map((bit) => <span key={bit}>· {bit}</span>)}
          {preview?.unknown && !chosen && <span className="text-amber-700 dark:text-amber-400">· no project matches #{preview.unknown}</span>}
        </p>
      )}
    </div>
  );
}

type CardHandlers = {
  onDone: (id: string) => void; onSchedule: (task: BoardTask) => void; onMessage: (result: PlanMessage) => void;
  onPick: (task: BoardTask) => void; pickedId: string | null;
};

function AreaList({ area, overrides, timeZone, open, filtering, onOpenChange, ...handlers }: {
  area: BoardArea; overrides: Record<string, Override>; timeZone: string; open: boolean; filtering: boolean; onOpenChange: (open: boolean) => void;
} & CardHandlers) {
  const unplaced = (tasks: BoardTask[]) => tasks.map((task) => (overrides[task.id] ? { ...task, ...overrides[task.id] } : task));
  const count = area.projects.reduce((sum, project) => sum + project.tasks.length, 0) + area.loose.length;
  return (
    <details className="rounded-2xl border bg-card" onToggle={(event) => { if (!filtering && event.currentTarget.open !== open) onOpenChange(event.currentTarget.open); }} open={open}>
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm font-semibold">
        <span>{area.name}</span>
        <span className="text-xs font-normal text-muted-foreground">{count} open</span>
      </summary>
      <div className="space-y-3 px-3 pb-3">
        {area.projects.map((project) => (
          <div key={project.id}>
            <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{project.name}</p>
            <ul className="mt-1 space-y-1.5">
              {unplaced(project.tasks).map((task) => <TaskCard key={task.id} task={task} timeZone={timeZone} {...handlers} />)}
            </ul>
            {!filtering && <div className="mt-1.5"><QuickAdd compact onDone={handlers.onMessage} projectId={project.id} /></div>}
          </div>
        ))}
        {area.loose.length > 0 && (
          <div>
            <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">No project</p>
            <ul className="mt-1 space-y-1.5">
              {unplaced(area.loose).map((task) => <TaskCard key={task.id} task={task} timeZone={timeZone} {...handlers} />)}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}

function TaskCard({ task, timeZone, onDone, onSchedule, onMessage, onPick, pickedId }: { task: BoardTask; timeZone: string } & CardHandlers) {
  const [waiting, setWaiting] = useState(false);
  const [who, setWho] = useState(task.waitingOn ?? "");
  const [pending, startTransition] = useTransition();
  const deadline = task.expiresAt ? `expires ${shortDate(task.expiresAt, timeZone)}` : task.dueDate ? `due ${shortDate(task.dueDate, timeZone)}` : null;
  const saveWaiting = (name: string | null) => startTransition(async () => { onMessage(await waitingOnAction(task.id, name)); setWaiting(false); });
  return (
    <li
      className={`group rounded-xl border border-l-4 px-3 py-2 ${areaStyle(task.areaSlug)} ${task.start && pickedId !== task.id ? "opacity-60" : ""} ${pickedId === task.id ? "ring-2 ring-primary" : ""}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ taskId: task.id, minutes: task.minutes, mode: task.start ? "block" : "task", grabMin: 0 } satisfies DragPayload));
        event.dataTransfer.effectAllowed = "move";
      }}
    >
      <div className="flex items-start gap-2">
        <button aria-label={`Mark done: ${task.title}`} className="mt-0.5 h-5 w-5 shrink-0 rounded-md border-2 border-muted-foreground/50 hover:border-primary" onClick={() => onDone(task.id)} type="button" />
        <div className="min-w-0 flex-1">
          <button aria-pressed={pickedId === task.id} className="block w-full break-words text-left text-sm font-medium leading-snug focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={() => onPick(task)} title="Tap, then tap a time on the calendar" type="button">{task.title}</button>
          <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
            {task.source && <span className="rounded bg-background/70 px-1 font-medium">{SOURCE_LABEL[task.source] ?? task.source}</span>}
            {deadline && <span className={task.urgent ? "font-semibold text-destructive" : ""}>{deadline}</span>}
            <span>{fmtLength(task.minutes)}</span>
            {task.start && <span>{dayLabel(task.start, timeZone)} {clock(task.start, timeZone)}</span>}
            {task.waitingOn && <span>waiting on {task.waitingOn}</span>}
            {(task.priority === "HIGH" || task.priority === "CRITICAL") && <span className="font-semibold">{task.priority === "CRITICAL" ? "!!" : "!"}</span>}
          </p>
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
        <button className="rounded-lg border bg-background px-2 py-1 hover:bg-muted" onClick={() => onSchedule(task)} type="button">{task.start ? "Move" : "Schedule"}</button>
        <button className="rounded-lg border bg-background px-2 py-1 hover:bg-muted" onClick={() => setWaiting((open) => !open)} type="button">{task.waitingOn ? "Waiting…" : "Waiting on…"}</button>
        <a className="rounded-lg border bg-background px-2 py-1 hover:bg-muted" href={task.href} {...(task.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>Open</a>
      </div>
      {waiting && (
        <form className="mt-2 flex gap-1.5" onSubmit={(event) => { event.preventDefault(); saveWaiting(who); }}>
          <label className="sr-only" htmlFor={`who-${task.id}`}>Waiting on</label>
          <input autoFocus className="min-w-0 flex-1 rounded-lg border bg-background px-2 py-1 text-sm" id={`who-${task.id}`} onChange={(event) => setWho(event.target.value)} placeholder="Who?" value={who} />
          <button className="rounded-lg border bg-background px-2 text-sm" disabled={pending || !who.trim()} type="submit">Save</button>
          {task.waitingOn && <button className="rounded-lg border bg-background px-2 text-sm" disabled={pending} onClick={() => saveWaiting(null)} type="button">Not waiting</button>}
        </form>
      )}
    </li>
  );
}

function gridRange(board: Board, blocks: BoardTask[]) {
  let start = Math.min(6 * 60, board.workdayStartMin - 60);
  let end = Math.max(22 * 60, board.dayEndMin + 60);
  for (const item of [...blocks.map((task) => ({ start: task.start as string, end: task.end as string })), ...board.meetings]) {
    start = Math.min(start, minutesInZone(item.start, board.timeZone));
    const endMin = minutesInZone(item.end, board.timeZone);
    if (endMin > 0) end = Math.max(end, endMin);
  }
  return { start: Math.max(0, Math.floor(start / 60) * 60), end: Math.min(24 * 60, Math.ceil(end / 60) * 60) };
}

function CalendarGrid({ board, days, blocks, allTasks, compact = false, picked, onPlace, onOpenBlock, onSchedule, onUnschedule, onDone }: {
  board: Board; days: string[]; blocks: BoardTask[]; allTasks: Map<string, BoardTask>; compact?: boolean;
  picked: BoardTask | null; onPlace: (start: Date) => void; onOpenBlock: (task: BoardTask) => void;
  onSchedule: (task: BoardTask, start: Date, minutes: number) => void; onUnschedule: (taskId: string) => void; onDone: (id: string) => void;
}) {
  const tz = board.timeZone;
  const range = gridRange(board, blocks);
  const height = (range.end - range.start) * PX_PER_MIN;
  const scroller = useRef<HTMLDivElement>(null);
  const [resize, setResize] = useState<{ taskId: string; endMin: number } | null>(null);
  const [hover, setHover] = useState<{ day: number; minute: number } | null>(null);
  const nowMin = minutesInZone(board.now, tz);
  const todayKey = dateKey(board.now, tz);

  useEffect(() => {
    // Open the day around the current time (or the workday start).
    const target = days.some((day) => dateKey(day, tz) === todayKey) ? nowMin - 90 : board.workdayStartMin - 30;
    scroller.current?.scrollTo({ top: Math.max(0, (target - range.start) * PX_PER_MIN) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.join(), compact]);

  const columnOf = (iso: string) => days.findIndex((day, index) => {
    const next = days[index + 1] ?? new Date(Date.parse(day) + 86_400_000).toISOString();
    return Date.parse(iso) >= Date.parse(day) && Date.parse(iso) < Date.parse(next);
  });
  const minuteAt = (event: React.DragEvent | React.PointerEvent, column: HTMLElement) => range.start + (event.clientY - column.getBoundingClientRect().top) / PX_PER_MIN;
  const toInstant = (dayIndex: number, minute: number) => new Date(Date.parse(days[dayIndex]) + minute * MIN);

  return (
    <div className="rounded-2xl border bg-card">
      <div className="grid border-b" style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` }}>
        <div />
        {days.map((day) => (
          <div className={`px-2 py-2 text-center text-sm font-semibold ${dateKey(day, tz) === todayKey ? "text-primary" : ""}`} key={day}>{dayLabel(day, tz)}</div>
        ))}
      </div>
      <div className={compact ? "h-[34vh] overflow-y-auto" : "max-h-[calc(100vh-14rem)] overflow-y-auto"} ref={scroller}>
        <div className="relative grid" style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))`, height }}>
          <div className="relative">
            {Array.from({ length: (range.end - range.start) / 60 }, (_, index) => (
              <span className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-muted-foreground" key={index} style={{ top: index * 60 * PX_PER_MIN }}>
                {index === 0 ? "" : new Date(Date.UTC(2000, 0, 1, (range.start / 60 + index) % 24)).toLocaleTimeString("en-US", { timeZone: "UTC", hour: "numeric" })}
              </span>
            ))}
          </div>
          {days.map((day, dayIndex) => {
            const isToday = dateKey(day, tz) === todayKey;
            const dayMeetings = board.meetings.filter((meeting) => columnOf(meeting.start) === dayIndex);
            const dayBlocks = blocks.filter((task) => columnOf(task.start as string) === dayIndex);
            return (
              <div
                aria-label={`Calendar for ${dayLabel(day, tz)}`}
                className="relative border-l"
                key={day}
                onDragLeave={() => setHover(null)}
                onDragOver={(event) => {
                  if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
                  event.preventDefault();
                  setHover({ day: dayIndex, minute: snapDown(minuteAt(event, event.currentTarget)) });
                }}
                onDrop={(event) => {
                  const payload = readPayload(event);
                  setHover(null);
                  if (!payload) return;
                  event.preventDefault();
                  const task = allTasks.get(payload.taskId);
                  if (!task) return;
                  // A list card starts at the slot under the pointer; a moved block keeps where it was grabbed.
                  const pointer = minuteAt(event, event.currentTarget);
                  const minute = payload.grabMin ? snap(pointer - payload.grabMin) : snapDown(pointer);
                  onSchedule(task, toInstant(dayIndex, Math.max(0, minute)), payload.minutes);
                }}
                style={{ backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${60 * PX_PER_MIN - 1}px, hsl(var(--border)) ${60 * PX_PER_MIN - 1}px, hsl(var(--border)) ${60 * PX_PER_MIN}px)` }}
              >
                {[{ from: range.start, to: board.workdayStartMin }, { from: board.dayEndMin, to: range.end }].map((shade) => shade.to > shade.from && (
                  <div aria-hidden className="absolute inset-x-0 bg-muted/40" key={shade.from} style={{ top: (shade.from - range.start) * PX_PER_MIN, height: (shade.to - shade.from) * PX_PER_MIN }} />
                ))}
                {dayMeetings.map((meeting) => {
                  const top = (minutesInZone(meeting.start, tz) - range.start) * PX_PER_MIN;
                  const length = Math.max(15, (Date.parse(meeting.end) - Date.parse(meeting.start)) / MIN);
                  return (
                    <div className="absolute inset-x-1 overflow-hidden rounded-md border border-slate-400/50 bg-slate-500/15 px-1.5 py-0.5 text-[11px] leading-tight" key={`${meeting.start}-${meeting.title}`} style={{ top, height: length * PX_PER_MIN - 2 }} title={`${meeting.title} ${clock(meeting.start, tz)}–${clock(meeting.end, tz)}`}>
                      <p className="truncate font-medium">{meeting.title}</p>
                      <p className="text-muted-foreground">{clock(meeting.start, tz)}</p>
                    </div>
                  );
                })}
                {dayBlocks.map((task) => {
                  const startMin = minutesInZone(task.start as string, tz);
                  const length = (Date.parse(task.end as string) - Date.parse(task.start as string)) / MIN;
                  const shownEnd = resize?.taskId === task.id ? resize.endMin : startMin + length;
                  const top = (startMin - range.start) * PX_PER_MIN;
                  return (
                    <div
                      className={`absolute left-1 right-1 cursor-grab overflow-hidden rounded-md border border-l-4 px-1.5 py-0.5 text-[11px] leading-tight shadow-sm active:cursor-grabbing ${areaStyle(task.areaSlug)}`}
                      draggable={!resize}
                      key={task.id}
                      onClick={() => { if (!picked) onOpenBlock(task); }}
                      onDragStart={(event) => {
                        const grabMin = (event.clientY - event.currentTarget.getBoundingClientRect().top) / PX_PER_MIN;
                        event.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ taskId: task.id, minutes: length, mode: "block", grabMin } satisfies DragPayload));
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      style={{ top, height: Math.max(15, shownEnd - startMin) * PX_PER_MIN - 2 }}
                      title={`${task.title} ${clock(task.start as string, tz)}–${clock(task.end as string, tz)}. Drag to move; drag the bottom edge to change length; drag to the list to unschedule.`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <p className="min-w-0 break-words font-semibold">{task.title}</p>
                        <span className="flex shrink-0 gap-0.5">
                          <button aria-label={`Done: ${task.title}`} className="rounded px-1 hover:bg-background/70" onClick={(event) => { event.stopPropagation(); onDone(task.id); }} type="button">✓</button>
                          <button aria-label={`Back to list: ${task.title}`} className="rounded px-1 hover:bg-background/70" onClick={(event) => { event.stopPropagation(); onUnschedule(task.id); }} type="button">×</button>
                        </span>
                      </div>
                      <p className="text-muted-foreground">{clock(task.start as string, tz)} · {fmtLength(Math.round(shownEnd - startMin))}{task.source ? ` · ${SOURCE_LABEL[task.source] ?? task.source}` : ""}</p>
                      <div
                        aria-label={`Change length of ${task.title}`}
                        className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize hover:bg-foreground/20"
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          const column = event.currentTarget.closest("[aria-label^='Calendar for']") as HTMLElement;
                          event.currentTarget.setPointerCapture(event.pointerId);
                          const move = (pointer: PointerEvent) => setResize({ taskId: task.id, endMin: Math.max(startMin + SNAP, snap(range.start + (pointer.clientY - column.getBoundingClientRect().top) / PX_PER_MIN)) });
                          const up = (pointer: PointerEvent) => {
                            window.removeEventListener("pointermove", move);
                            window.removeEventListener("pointerup", up);
                            const endMin = Math.max(startMin + SNAP, snap(range.start + (pointer.clientY - column.getBoundingClientRect().top) / PX_PER_MIN));
                            setResize(null);
                            if (endMin !== startMin + length) onSchedule(task, new Date(task.start as string), endMin - startMin);
                          };
                          window.addEventListener("pointermove", move);
                          window.addEventListener("pointerup", up);
                        }}
                        role="separator"
                      />
                    </div>
                  );
                })}
                {picked && (
                  <div className="absolute inset-0 z-20">
                    {Array.from({ length: (range.end - range.start) / SNAP }, (_, slot) => {
                      const minute = range.start + slot * SNAP;
                      const start = toInstant(dayIndex, minute);
                      const end = new Date(start.getTime() + picked.minutes * MIN);
                      const busy = [...dayMeetings.map((m) => [Date.parse(m.start), Date.parse(m.end)]), ...dayBlocks.filter((b) => b.id !== picked.id).map((b) => [Date.parse(b.start as string), Date.parse(b.end as string)])];
                      const free = busy.every(([from, to]) => to <= start.getTime() || from >= end.getTime()) && end.getTime() > Date.parse(board.now);
                      return (
                        <button
                          aria-label={`Place ${picked.title} at ${clock(start.toISOString(), tz)}${free ? "" : " (overlaps)"}`}
                          className={`absolute inset-x-0 border-t border-transparent hover:border-primary hover:bg-primary/30 focus-visible:bg-primary/30 focus-visible:outline-none ${free ? "bg-emerald-500/15" : ""}`}
                          key={slot}
                          onClick={() => onPlace(start)}
                          style={{ top: slot * SNAP * PX_PER_MIN, height: SNAP * PX_PER_MIN }}
                          type="button"
                        />
                      );
                    })}
                  </div>
                )}
                {hover?.day === dayIndex && (
                  <div aria-hidden className="pointer-events-none absolute inset-x-1 border-t-2 border-primary" style={{ top: (hover.minute - range.start) * PX_PER_MIN }}>
                    <span className="rounded bg-primary px-1 text-[10px] text-primary-foreground">{new Date(Date.UTC(2000, 0, 1, 0, hover.minute)).toLocaleTimeString("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit" })}</span>
                  </div>
                )}
                {isToday && nowMin >= range.start && nowMin <= range.end && (
                  <div aria-hidden className="pointer-events-none absolute inset-x-0 border-t-2 border-destructive" style={{ top: (nowMin - range.start) * PX_PER_MIN }} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Free starts that fit the task, from now (or the workday start) to the end of the day, around meetings and blocks.
export function freeStarts(board: Board, blocks: BoardTask[], dayStartIso: string, minutes: number, excludeId: string, limit = 6) {
  const dayStart = Date.parse(dayStartIso);
  const busy = [
    ...board.meetings.map((meeting) => [Date.parse(meeting.start), Date.parse(meeting.end)] as const),
    ...blocks.filter((task) => task.id !== excludeId).map((task) => [Date.parse(task.start as string), Date.parse(task.end as string)] as const)
  ];
  const nowRounded = Math.ceil(Date.parse(board.now) / (SNAP * MIN)) * SNAP * MIN;
  const out: Date[] = [];
  for (let t = Math.max(dayStart + board.workdayStartMin * MIN, nowRounded); t + minutes * MIN <= dayStart + board.dayEndMin * MIN && out.length < limit; t += SNAP * MIN) {
    const end = t + minutes * MIN;
    if (busy.every(([s, e]) => e <= t || s >= end)) {
      out.push(new Date(t));
      t = end - SNAP * MIN; // the next choice starts after this one
    }
  }
  return out;
}

function ScheduleSheet({ task, board, blocks, onPick, onUnschedule, onClose, onDone }: {
  task: BoardTask; board: Board; blocks: BoardTask[]; onPick: (start: Date, minutes: number) => void; onUnschedule: () => void; onClose: () => void; onDone: () => void;
}) {
  const tz = board.timeZone;
  const [minutes, setMinutes] = useState(task.minutes);
  const [custom, setCustom] = useState("");
  const options = board.soonDays.map((day, index) => ({ label: index === 0 ? "Today" : "Tomorrow", starts: freeStarts(board, blocks, day, minutes, task.id) }));
  const pickCustom = () => {
    if (!custom) return;
    // datetime-local is wall time in Ryan's zone: shift by the zone offset at that moment.
    const naive = new Date(`${custom}:00Z`);
    const offset = minutesInZone(naive.toISOString(), tz) - (naive.getUTCHours() * 60 + naive.getUTCMinutes());
    const wrapped = offset > 720 ? offset - 1440 : offset < -720 ? offset + 1440 : offset;
    onPick(new Date(naive.getTime() - wrapped * MIN), minutes);
  };
  return (
    <div aria-modal className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose} role="dialog">
      <div className="w-full max-w-md rounded-t-2xl border bg-card p-4 shadow-xl sm:rounded-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{task.start ? "Move" : "Schedule"}</p>
            <p className="break-words font-semibold">{task.title}</p>
          </div>
          <button aria-label="Close" className="rounded-lg border px-2 py-1" onClick={onClose} type="button">×</button>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          Length
          <select className="rounded-lg border bg-background px-2 py-1" onChange={(event) => setMinutes(Number(event.target.value))} value={minutes}>
            {[...new Set([15, 30, 45, 60, 90, 120, 180, task.minutes])].sort((a, b) => a - b).map((value) => <option key={value} value={value}>{fmtLength(value)}</option>)}
          </select>
        </label>
        {options.map((option) => (
          <div className="mt-3" key={option.label}>
            <p className="text-sm font-semibold">{option.label}</p>
            {option.starts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No free time that fits.</p>
            ) : (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {option.starts.map((start) => (
                  <button className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" key={start.toISOString()} onClick={() => onPick(start, minutes)} type="button">{clock(start.toISOString(), tz)}</button>
                ))}
              </div>
            )}
          </div>
        ))}
        <form className="mt-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); pickCustom(); }}>
          <label className="sr-only" htmlFor="custom-time">Pick a time</label>
          <input className="min-w-0 flex-1 rounded-lg border bg-background px-2 py-1.5 text-sm" id="custom-time" onChange={(event) => setCustom(event.target.value)} type="datetime-local" value={custom} />
          <button className="rounded-lg border px-3 text-sm" disabled={!custom} type="submit">Set</button>
        </form>
        {task.start && (
          <p className="mt-2 text-xs text-muted-foreground">Now {dayLabel(task.start, tz)} {clock(task.start, tz)}–{clock(task.end as string, tz)}. Pick a new time above, or change the length and tap a time.</p>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted" onClick={onDone} type="button">Done</button>
          {task.start ? (
            <button className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" onClick={onUnschedule} type="button">Take off calendar</button>
          ) : (
            <a className="rounded-lg border px-3 py-2 text-center text-sm hover:bg-muted" href={task.href} {...(task.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>Open</a>
          )}
        </div>
      </div>
    </div>
  );
}
