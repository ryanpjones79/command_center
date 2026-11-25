"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { bookPlanAction, bookSlotAction, habitDoneAction, moveBlockAction, nextSlotAction, pinTodayAction, planDoneAction, previewDayAction, scheduleCheckinReviewAction, takeOverAction, waitingOnAction, type PlanMessage, type PreviewLine, type PreviewResult } from "@/app/plan/actions";
import type { Board, BoardArea, BoardLink, BoardTask } from "@/server/v2/board";
import type { Habit } from "@/server/v2/habits";
import type { QuickTarget } from "@/lib/v2/quick-add";
import { NewTaskButton } from "@/components/plan/task-composer";
import { CoachCard } from "@/components/plan/coach-card";
import type { CoachMessage } from "@/server/v2/coach";
import { SOURCE_LABEL, taskMatches, type QuickFilter } from "@/lib/v2/plan-filters";
import { v2PostponeAction } from "@/app/now/v2-actions";
import { dayLoad, personalBusy, planningStartMin } from "@/lib/v2/day-load";
import { respectsWorkHours } from "@/lib/v2/availability";
import { shortTitle } from "@/lib/v2/short-title";
import { areaLook } from "@/lib/v2/area-look";

// Plan is the scheduling workspace: the calendar leads, and a rail beside it shows bookable time, a preview of
// the proposed day, missed blocks, and a short list of actions ready for Ryan (one click books the first free
// time). Actions an agent is still preparing are listed apart and can't be booked until they're ready. Routines,
// app check-ins and the full to-do list are folded away. Drag any card onto the calendar; drag a block to move it,
// pull its bottom edge to change its length, drag it back to the rail to unschedule it. A booked task is the same
// task row everywhere (Plan, Now, Google Calendar), so moving it never duplicates it or loses its source.

const PX_PER_MIN = 1;
const SNAP = 15;
const DRAG_TYPE = "application/x-ryanos-task";
const MIN = 60_000;

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

const greeting = (iso: string, timeZone: string) => {
  const hour = Math.floor(minutesInZone(iso, timeZone) / 60);
  return hour < 5 ? "Late night" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
};

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

export function PlanBoard({ board, view, coach = null }: { board: Board; view: "day" | "3" | "week"; coach?: CoachMessage | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<PlanMessage | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [scheduling, setScheduling] = useState<BoardTask | null>(null);
  // Tap a task, then tap a time: the task waiting to be placed.
  const [picked, setPicked] = useState<BoardTask | null>(null);
  const phone = useIsPhone();
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [previewing, startPreview] = useTransition();
  const [closed, setClosed] = useState<Set<string>>(new Set());
  useEffect(() => setClosed(readClosed()), []);
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
    for (const task of [...board.blocks, ...board.waiting, ...board.routineTasks]) map.set(task.id, task);
    return map;
  }, [board]);

  const withOverride = (task: BoardTask): BoardTask => (overrides[task.id] ? { ...task, ...overrides[task.id] } : task);
  const withOverrideMaybe = (task: BoardTask | undefined) => (task ? withOverride(task) : null);
  const blocks = [...new Set([...board.blocks.map((task) => task.id), ...Object.keys(overrides)])]
    .map((id) => allTasks.get(id))
    .filter((task): task is BoardTask => Boolean(task))
    .map(withOverride)
    .filter((task) => task.start && task.end);

  const filtering = Boolean(query.trim());
  const keep = (task: BoardTask) => taskMatches(withOverride(task), query, NO_QUICK);
  // Check-ins: items from Ryan's apps. To-dos: his own tasks.
  const isCheckin = (task: BoardTask) => Boolean(task.source);
  const mineAreas = board.areas
    .map((area) => ({ ...area, projects: area.projects.map((project) => ({ ...project, tasks: project.tasks.filter((task) => !isCheckin(task) && keep(task)) })).filter((project) => project.tasks.length > 0), loose: area.loose.filter((task) => !isCheckin(task) && keep(task)) }))
    .filter((area) => area.projects.length > 0 || area.loose.length > 0);
  const mineTasks = mineAreas.flatMap((area) => [...area.loose, ...area.projects.flatMap((project) => project.tasks)]);
  // Ready for Ryan: his own open to-dos (not check-ins, not waiting, not with an agent) that aren't booked yet.
  const ready = readyOrder(board.areas
    .flatMap((area) => [...area.loose, ...area.projects.flatMap((project) => project.tasks)])
    .filter((task) => !isCheckin(task) && task.ready === "ready")
    .map(withOverride)
    .filter((task) => !task.start));
  const shownWaiting = board.waiting.filter((task) => !task.source && keep(task));
  const checkins = board.areas
    .flatMap((area) => [...area.loose, ...area.projects.flatMap((project) => project.tasks)])
    .filter(isCheckin)
    .map(withOverride);
  const checkinGroups = [...new Set(checkins.map((task) => task.source as string))]
    .map((source) => ({ source, label: SOURCE_LABEL[source] ?? source, tasks: checkins.filter((task) => task.source === source) }))
    .sort((a, b) => b.tasks.length - a.tasks.length);
  const routinesLeft = board.habits.filter((habit) => habit.todayTaskId && !habit.done).length;

  const openTasks = [...board.areas.flatMap((area) => [...area.loose, ...area.projects.flatMap((project) => project.tasks)]), ...board.waiting].filter((task) => !task.source);
  const load = dayLoad(board, blocks, openTasks);
  // Missed: today's blocks that ended without being marked done.
  const todayStartMs = Date.parse(board.soonDays[0]);
  const missed = blocks.filter((task) => Date.parse(task.start as string) >= todayStartMs && Date.parse(task.end as string) <= Date.parse(board.now));
  const firstFree = (task: BoardTask) => freeStarts(board, blocks, board.soonDays[0], task.minutes, task, 1)[0] ?? freeStarts(board, blocks, board.soonDays[1], task.minutes, task, 1)[0] ?? null;
  const bookExact = (task: BoardTask, start: Date) => {
    const end = new Date(start.getTime() + task.minutes * MIN);
    run(() => bookSlotAction(task.id, start.toISOString(), end.toISOString()), { [task.id]: { start: start.toISOString(), end: end.toISOString() } });
  };
  const optionalToday = board.meetings.filter((meeting) => meeting.optional && Date.parse(meeting.start) >= Date.parse(board.soonDays[0]) && Date.parse(meeting.start) < Date.parse(board.soonDays[1]));
  const openPreview = () => startPreview(async () => {
    const result = await previewDayAction();
    // Commitments start ticked; "If there's time" extras start unticked.
    setSkip(new Set(result.items.filter((item) => item.group === "EXTRA").map((item) => item.taskId)));
    setPreview(result);
    setMessage({ ok: result.ok, message: result.message });
  });
  const bookPreview = () => {
    if (!preview) return;
    const items = preview.items.filter((item) => !skip.has(item.taskId)).map((item) => ({ taskId: item.taskId, start: item.start, end: item.end }));
    setPreview(null);
    run(() => bookPlanAction(items), Object.fromEntries(items.map((item) => [item.taskId, { start: item.start, end: item.end }])));
  };

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
          <p className="eyebrow">Plan · {greeting(board.now, tz)}</p>
          <h1 className="font-display mt-1 text-3xl font-medium tracking-tight sm:text-4xl">
            {dayLabel(first, tz)}
            {board.days.length > 1 ? <span className="text-muted-foreground"> – {dayLabel(board.days[board.days.length - 1], tz)}</span> : ""}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{fmtLength(load.freeMin)}</span> free today
            <span aria-hidden> · </span>
            <span className={load.dueCount ? "font-semibold text-destructive" : ""}>{load.dueCount} due</span>
            <span aria-hidden> · </span>
            {checkins.length} check-in{checkins.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <nav aria-label="Days shown" className="hidden rounded-full border bg-muted/60 p-1 md:flex">
            {(["day", "3", "week"] as const).map((option) => (
              <Link aria-current={option === view ? "page" : undefined} className={`rounded-full px-3.5 py-1.5 transition-colors ${option === view ? "bg-card font-semibold text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`} href={viewHref(option, dateKey(first, tz))} key={option}>
                {option === "day" ? "Day" : option === "3" ? "3 days" : "Week"}
              </Link>
            ))}
          </nav>
          <div className="flex items-center rounded-full border bg-muted/60 p-1">
            <Link aria-label="Earlier" className="flex h-7 w-7 items-center justify-center rounded-full text-base hover:bg-card" href={viewHref(view, shift(-step))}>‹</Link>
            <Link className="rounded-full px-3 py-1 font-medium hover:bg-card" href={viewHref(view)}>Today</Link>
            <Link aria-label="Later" className="flex h-7 w-7 items-center justify-center rounded-full text-base hover:bg-card" href={viewHref(view, shift(step))}>›</Link>
          </div>
          <Link className="rounded-full border px-3.5 py-2 font-medium text-muted-foreground hover:bg-muted hover:text-foreground" href="/plan/wrap-up" title="Evening wrap-up: close today and plan tomorrow">Wrap up</Link>
        </div>
      </header>

      <CoachCard coach={coach} onMessage={(result) => { setMessage(result); router.refresh(); }} onPlanDay={openPreview} />

      <div aria-live="polite" className="text-sm empty:-mt-4">
        {message && <p className={message.ok ? "text-muted-foreground" : "font-medium text-destructive"}>{message.message}</p>}
        {!board.calendarKnown && <p className="text-amber-700 dark:text-amber-400">Google Calendar couldn&apos;t be read, so meetings may be missing.</p>}
        {board.calendarSync.enabled && !board.calendarSync.ok && <p className="text-amber-700 dark:text-amber-400">Google Calendar sync: {board.calendarSync.message}</p>}
      </div>


      {/* The calendar is the workspace: main panel on desktop, pinned on top on a phone. The rail beside it
          holds what to book next; routines, check-ins and the full to-do list are folded away. */}
      <div className={view === "day" ? "flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(340px,400px)] lg:items-start" : "flex flex-col gap-4"}>
        <section aria-label="Calendar" className="sticky top-[3.6rem] z-30 -mx-4 min-w-0 border-b bg-background px-4 pb-2 pt-1 sm:-mx-6 sm:px-6 md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 lg:sticky lg:top-4">
          {picked && (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-2xl border border-primary/40 bg-gradient-to-r from-primary/15 to-accent/10 px-3 py-2 text-sm shadow-[0_0_24px_-8px_hsl(var(--primary)/0.6)]" role="status">
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
            preview={preview ? preview.items.map((item) => ({ ...item, off: skip.has(item.taskId) })) : []}
          />
        </section>

        <section
          aria-label="Schedule"
          className="flex min-w-0 flex-col gap-3"
          onDragOver={(event) => { if (event.dataTransfer.types.includes(DRAG_TYPE)) event.preventDefault(); }}
          onDrop={(event) => {
            const payload = readPayload(event);
            if (payload?.mode === "block") { event.preventDefault(); unschedule(payload.taskId); }
          }}
        >
          <div className="rounded-2xl border bg-card p-3">
            <div className="flex items-baseline justify-between gap-2 px-1">
              <h2 className="text-sm font-semibold">Bookable today</h2>
              <span className="text-sm font-semibold tabular-nums">{fmtLength(load.freeMin)}</span>
            </div>
            <p className="px-1 text-xs text-muted-foreground">For personal work: after meetings, booked blocks, work hours and protected time.</p>
            {!board.calendarKnown && <p className="mt-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">Google Calendar couldn&apos;t be read. These times are unconfirmed, not free.</p>}
            {load.windows.length > 0 ? (
              <ul aria-label="Free windows" className="mt-2 flex flex-wrap gap-1.5 px-1">
                {load.windows.slice(0, 6).map((window) => (
                  <li className="rounded-full border bg-emerald-500/10 px-2.5 py-1 text-xs tabular-nums" key={window.start}>{clock(window.start, tz)}–{clock(window.end, tz)} · {fmtLength(window.minutes)}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 px-1 text-xs text-muted-foreground">No free window of 15 minutes or more is left today.</p>
            )}
            {optionalToday.length > 0 && (
              <p className="mt-2 px-1 text-xs text-muted-foreground">
                Optional, not blocking{board.availability.optionalBlocks ? " (set to block)" : ""}: {optionalToday.map((meeting) => `${meeting.title} ${clock(meeting.start, tz)}`).join(" · ")}
              </p>
            )}
            <details className="mt-2 px-1 text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">What this counts</summary>
              <ul className="mt-1.5 space-y-1">
                {board.availability.sources.map((source) => (
                  <li key={source.label}><span className={source.ok ? "font-semibold" : "font-semibold text-amber-700 dark:text-amber-300"}>{source.ok ? "✓" : "!"} {source.label}</span> <span className="text-muted-foreground">{source.detail}</span></li>
                ))}
                {board.availability.protections.map((line) => (
                  <li key={line.label}><span className="font-semibold">{line.label}</span> <span className="text-muted-foreground">{line.detail}</span></li>
                ))}
              </ul>
            </details>
            {preview ? (
              <PreviewPanel
                onBook={bookPreview}
                onCancel={() => setPreview(null)}
                onToggle={(taskId) => setSkip((current) => { const next = new Set(current); if (next.has(taskId)) next.delete(taskId); else next.add(taskId); return next; })}
                pending={pending}
                preview={preview}
                skip={skip}
                timeZone={tz}
              />
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-2 px-1">
                <button className="rounded-full bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-60" disabled={previewing} onClick={openPreview} type="button">{previewing ? "Planning…" : "✦ Preview my day"}</button>
                <NewTaskButton label="+ New task" onDone={setMessage} targets={board.targets} timeZone={tz} variant="chip" />
              </div>
            )}
          </div>

          {missed.length > 0 && (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3">
              <h2 className="px-1 text-sm font-semibold">Missed today <span className="font-normal text-muted-foreground">· {missed.length}</span></h2>
              <p className="px-1 text-xs text-muted-foreground">Moving it keeps the task, its project, links and source.</p>
              <ul className="mt-2 space-y-1.5">
                {missed.map((task) => (
                  <li className="rounded-xl border bg-card px-3 py-2" key={task.id}>
                    <p className="break-words text-sm font-medium leading-snug">{task.title}</p>
                    <p className="text-xs text-muted-foreground">Was {clock(task.start as string, tz)}–{clock(task.end as string, tz)}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                      <button className="rounded-full bg-primary px-2.5 py-1 font-semibold text-primary-foreground disabled:opacity-60" disabled={pending} onClick={() => run(() => nextSlotAction(task.id))} type="button">Next free slot</button>
                      <button className="rounded-full border bg-background/60 px-2.5 py-1 font-medium hover:border-primary/60 hover:text-primary" onClick={() => setScheduling(task)} type="button">Pick a time</button>
                      <button className="rounded-full border bg-background/60 px-2.5 py-1 text-muted-foreground hover:bg-muted" disabled={pending} onClick={() => unschedule(task.id)} type="button">Back to list</button>
                      <button className="rounded-full border bg-background/60 px-2.5 py-1 text-muted-foreground hover:bg-muted" disabled={pending} onClick={() => done(task.id)} type="button">Did it</button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-2xl border bg-card p-3">
            <div className="flex items-baseline justify-between gap-2 px-1">
              <h2 className="flex items-center gap-2 text-sm font-semibold">Ready for you <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">{ready.length}</span></h2>
              <span className="text-xs text-muted-foreground">one click books it</span>
            </div>
            {ready.length === 0 && <p className="mt-2 rounded-xl border p-3 text-sm text-muted-foreground">Nothing waiting to be booked.</p>}
            <ul className="mt-2 space-y-1.5">
              {ready.slice(0, READY_SHOWN).map((task) => (
                <ReadyCard
                  firstFree={firstFree(task)}
                  key={task.id}
                  onBook={(start) => bookExact(task, start)}
                  onDone={done}
                  onPick={togglePick}
                  onSchedule={setScheduling}
                  pending={pending}
                  pickedId={picked?.id ?? null}
                  task={task}
                  timeZone={tz}
                />
              ))}
            </ul>
            {ready.length > READY_SHOWN && <p className="mt-2 px-1 text-xs text-muted-foreground">{ready.length - READY_SHOWN} more under All to-dos.</p>}
          </div>

          {board.preparing.length > 0 && (
            <div className="rounded-2xl border border-dashed bg-card/60 p-3">
              <h2 className="px-1 text-sm font-semibold">Agent preparing <span className="font-normal text-muted-foreground">· not ready to book</span></h2>
              <ul className="mt-2 space-y-1.5">
                {board.preparing.map((task) => (
                  <li className="rounded-xl border bg-background/40 px-3 py-2" key={task.id}>
                    <p className="break-words text-sm font-medium leading-snug">{task.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span className="rounded-md border border-violet-400/40 bg-violet-500/10 px-1.5 font-medium text-violet-700 dark:text-violet-300">Agent preparing</span>
                      {task.doing && <span>{task.doing}</span>}
                      <span>then {fmtLength(task.minutes)} for you</span>
                    </p>
                    <TaskLinks links={task.links} />
                    <div className="mt-1.5 text-xs">
                      <button className="rounded-full border bg-background/60 px-2.5 py-1 font-medium hover:border-primary/60 hover:text-primary disabled:opacity-60" disabled={pending} onClick={() => run(() => takeOverAction(task.id))} type="button">Take it over</button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Fold count={mineTasks.length} title="All to-dos">
            <label className="sr-only" htmlFor="plan-search">Search to-dos</label>
            <input
              className="w-full rounded-xl border bg-background/60 px-3 py-2 text-sm placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              id="plan-search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search…"
              type="search"
              value={query}
            />
            {mineAreas.map((area) => (
              <AreaList
                area={area}
                filtering={filtering}
                key={area.id}
                onDone={done}
                onMessage={(result) => { setMessage(result); router.refresh(); }}
                onOpenChange={(open) => setAreaOpen(`open:${area.slug}`, !open)}
                onPick={togglePick}
                onSchedule={setScheduling}
                open={filtering || closed.has(`open:${area.slug}`)}
                overrides={overrides}
                pickedId={picked?.id ?? null}
                targets={board.targets}
                timeZone={tz}
              />
            ))}
            {filtering && mineTasks.length === 0 && <p className="rounded-xl border p-3 text-sm text-muted-foreground">Nothing matches.</p>}
            {shownWaiting.length > 0 && (
              <details className="rounded-xl border bg-background/40 p-3">
                <summary className="cursor-pointer text-sm font-semibold">Waiting on others ({shownWaiting.length})</summary>
                <ul className="mt-2 space-y-1.5">
                  {shownWaiting.map((task) => (
                    <TaskCard key={task.id} onDone={done} onMessage={(result) => { setMessage(result); router.refresh(); }} onPick={togglePick} onSchedule={setScheduling} pickedId={picked?.id ?? null} task={withOverride(task)} timeZone={tz} />
                  ))}
                </ul>
              </details>
            )}
          </Fold>

          <Fold count={routinesLeft} link={{ href: "/plan/routines", label: "Edit" }} title="Routines">
            {board.habits.length === 0 && <Link className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground hover:bg-muted" href="/plan/routines">+ Add routines (eBay listing, sourcing, workouts…)</Link>}
            <ul className="space-y-1.5">
              {board.habits.map((habit) => (
                <RoutineCard
                  habit={habit}
                  key={habit.routineId}
                  onMessage={(result) => { setMessage(result); router.refresh(); }}
                  onPick={togglePick}
                  onSchedule={setScheduling}
                  pickedId={picked?.id ?? null}
                  task={habit.todayTaskId ? withOverrideMaybe(allTasks.get(habit.todayTaskId)) : null}
                  timeZone={tz}
                />
              ))}
            </ul>
          </Fold>

          <Fold count={checkins.length} title="App check-ins">
            {checkinGroups.length === 0 && <p className="rounded-xl border p-3 text-sm text-muted-foreground">All clear. Nothing from your apps.</p>}
            {checkinGroups.map((group) => (
              <CheckinGroup
                count={group.tasks.length}
                key={group.source}
                label={group.label}
                onMessage={(result) => { setMessage(result); router.refresh(); }}
                source={group.source}
                tool={board.tools.find((tool) => tool.key === group.source) ?? null}
              >
                {group.tasks.map((task) => (
                  <CheckinCard key={task.id} onDone={done} onMessage={(result) => { setMessage(result); router.refresh(); }} onPick={togglePick} onSchedule={setScheduling} pickedId={picked?.id ?? null} task={task} timeZone={tz} />
                ))}
              </CheckinGroup>
            ))}
          </Fold>
        </section>
      </div>

      {scheduling && <ScheduleSheet blocks={blocks} board={board} onClose={() => setScheduling(null)} onDone={() => { done(scheduling.id); setScheduling(null); }} onPick={(start, minutes) => { schedule(scheduling, start, minutes); setScheduling(null); }} onUnschedule={() => { unschedule(scheduling.id); setScheduling(null); }} task={withOverride(scheduling)} />}
    </div>
  );
}

const READY_SHOWN = 6;
const PRIORITY_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

// Ready actions: Ryan's own open to-dos that aren't on the calendar, pinned-for-today first, then deadlines, then priority.
function readyOrder(tasks: BoardTask[]) {
  const deadline = (task: BoardTask) => Math.min(...[task.dueDate, task.expiresAt].map((value) => (value ? Date.parse(value) : Infinity)));
  return [...tasks].sort((a, b) =>
    Number(Boolean(b.committed)) - Number(Boolean(a.committed)) ||
    Number(b.urgent) - Number(a.urgent) ||
    (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2) ||
    deadline(a) - deadline(b)
  );
}

// A folded section of the rail: closed by default so the calendar and ready list lead.
function Fold({ title, count, link, children }: { title: string; count: number; link?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <details className="group rounded-2xl border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">{title}<span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">{count}</span></span>
        <span className="flex items-center gap-3">
          {link && <Link className="text-xs font-normal text-muted-foreground underline-offset-2 hover:underline" href={link.href} onClick={(event) => event.stopPropagation()}>{link.label}</Link>}
          <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-90">›</span>
        </span>
      </summary>
      <div className="flex flex-col gap-2.5 px-3 pb-3">{children}</div>
    </details>
  );
}

// Drafts and sources attached to a task (agent drafts, the posting or page it came from).
function TaskLinks({ links }: { links: BoardLink[] }) {
  if (links.length === 0) return null;
  return (
    <p className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
      {links.map((link) => {
        const external = /^https:/i.test(link.url);
        return (
          <a
            className={`rounded-md border px-1.5 py-0.5 font-medium hover:bg-muted ${link.kind === "draft" ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}`}
            href={link.url}
            key={`${link.kind}-${link.url}`}
            title={link.title}
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {link.kind === "draft" ? "Draft" : link.kind === "source" ? "Source" : "Link"}: {link.title}{external ? " ↗" : ""}
          </a>
        );
      })}
    </p>
  );
}

// A ready action: duration, links, and one click to book the first free time (or pick another).
function ReadyCard({ task, timeZone, firstFree, pending, pickedId, onBook, onDone, onPick, onSchedule }: {
  task: BoardTask; timeZone: string; firstFree: Date | null; pending: boolean; pickedId: string | null;
  onBook: (start: Date) => void; onDone: (id: string) => void; onPick: (task: BoardTask) => void; onSchedule: (task: BoardTask) => void;
}) {
  const today = firstFree ? dateKey(firstFree.toISOString(), timeZone) === dateKey(new Date().toISOString(), timeZone) : false;
  return (
    <li
      className={`cursor-grab rounded-xl border border-l-[3px] px-3 py-2.5 active:cursor-grabbing ${areaLook(task.areaSlug).card} ${pickedId === task.id ? "ring-2 ring-primary" : ""}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ taskId: task.id, minutes: task.minutes, mode: "task", grabMin: 0 } satisfies DragPayload));
        event.dataTransfer.effectAllowed = "move";
      }}
    >
      <div className="flex items-start gap-2">
        <button aria-label={`Mark done: ${task.title}`} className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/40 text-[10px] text-transparent hover:border-primary hover:text-primary" onClick={() => onDone(task.id)} type="button">✓</button>
        <div className="min-w-0 flex-1">
          <button aria-pressed={pickedId === task.id} className="block w-full break-words text-left text-sm font-medium leading-snug" onClick={() => onPick(task)} title={task.title} type="button">{shortTitle(task.title)}</button>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{fmtLength(task.minutes)}</span>
            {readyContext(task, timeZone).map((chip) => (
              <span className={`rounded-md border px-1.5 font-medium ${chip.tone === "due" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-primary/30 bg-primary/10 text-primary"}`} key={chip.label}>{chip.label}</span>
            ))}
            <span>{task.projectName ?? task.areaName}</span>
          </p>
          <TaskLinks links={task.links} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 pl-7 text-xs">
        {firstFree ? (
          <button className="rounded-full bg-primary px-2.5 py-1 font-semibold text-primary-foreground disabled:opacity-60" disabled={pending} onClick={() => onBook(firstFree)} type="button">
            Book {today ? "" : `${new Date(firstFree).toLocaleDateString("en-US", { timeZone, weekday: "short" })} `}{clock(firstFree.toISOString(), timeZone)}
          </button>
        ) : (
          <span className="rounded-full border px-2.5 py-1 text-muted-foreground">No free slot today or tomorrow</span>
        )}
        <button className="rounded-full border bg-background/60 px-2.5 py-1 font-medium hover:border-primary/60 hover:text-primary" onClick={() => onSchedule(task)} type="button">Other time</button>
      </div>
    </li>
  );
}

// The proposed day, before anything is booked: untick what you don't want, then book the rest.
function PreviewPanel({ preview, skip, pending, timeZone, onToggle, onBook, onCancel }: {
  preview: PreviewResult; skip: Set<string>; pending: boolean; timeZone: string;
  onToggle: (taskId: string) => void; onBook: () => void; onCancel: () => void;
}) {
  const kept = preview.items.filter((item) => !skip.has(item.taskId));
  const keptMinutes = kept.reduce((sum, item) => sum + (Date.parse(item.end) - Date.parse(item.start)) / MIN, 0);
  const line = (item: PreviewLine) => (
    <li key={item.taskId}>
      <label className="flex cursor-pointer items-start gap-2 rounded-lg px-1 py-1 text-sm hover:bg-muted/60">
        <input checked={!skip.has(item.taskId)} className="mt-1" onChange={() => onToggle(item.taskId)} type="checkbox" />
        <span className="min-w-0 flex-1">
          <span className={`block break-words font-medium leading-snug ${skip.has(item.taskId) ? "text-muted-foreground" : ""}`} title={item.title}>{shortTitle(item.title)}</span>
          <span className="block text-xs text-muted-foreground">{clock(item.start, timeZone)}–{clock(item.end, timeZone)} · <span className="text-foreground/80">{item.reason}</span></span>
        </span>
      </label>
    </li>
  );
  const commits = preview.items.filter((item) => item.group === "COMMIT");
  const extras = preview.items.filter((item) => item.group === "EXTRA");
  return (
    <div className="mt-3 rounded-xl border border-primary/40 bg-primary/5 p-3" role="region" aria-label="Proposed plan">
      <p className="text-sm font-semibold">Proposed plan <span className="font-normal text-muted-foreground">· nothing booked yet</span></p>
      {!preview.calendarKnown && <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">Google Calendar couldn&apos;t be read; check for meetings before booking.</p>}
      {preview.items.length === 0 && <p className="mt-1 text-sm text-muted-foreground">{preview.message}</p>}
      {commits.length > 0 && (
        <>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Commitments ({commits.length})</p>
          <ul className="mt-1 space-y-1">{commits.map(line)}</ul>
        </>
      )}
      {extras.length > 0 && (
        <>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">If there&apos;s time ({extras.length}, unticked)</p>
          <ul className="mt-1 space-y-1">{extras.map(line)}</ul>
        </>
      )}
      {preview.unplaced.length > 0 && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">{preview.unplaced.length} didn&apos;t fit</summary>
          <ul className="mt-1 space-y-0.5">
            {preview.unplaced.map((item) => <li key={item.title}><span className="font-medium" title={item.title}>{shortTitle(item.title, 48)}</span> <span className="text-muted-foreground">· {item.reason}</span></li>)}
          </ul>
        </details>
      )}
      <p className="mt-2 text-xs text-muted-foreground">{fmtLength(Math.round(keptMinutes))} picked; {preview.bufferMinutes} min stays free for interruptions.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className="rounded-full bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-60" disabled={pending || kept.length === 0} onClick={onBook} type="button">Book {kept.length} block{kept.length === 1 ? "" : "s"}</button>
        <button className="rounded-full border px-3.5 py-1.5 text-sm hover:bg-muted" onClick={onCancel} type="button">Cancel</button>
      </div>
    </div>
  );
}

// Why a ready action matters, in words: pinned, due, weekly priority, draft attached.
function readyContext(task: BoardTask, timeZone: string): { label: string; tone: "due" | "info" }[] {
  const out: { label: string; tone: "due" | "info" }[] = [];
  const deadline = [task.dueDate, task.expiresAt].filter((value): value is string => Boolean(value)).sort()[0];
  if (deadline) {
    const days = Math.round((Date.parse(dateKey(deadline, timeZone)) - Date.parse(dateKey(new Date().toISOString(), timeZone))) / 86_400_000);
    const word = deadline === task.expiresAt ? "Expires" : "Due";
    out.push({ label: days < 0 ? (word === "Due" ? "Overdue" : "Expired") : days === 0 ? `${word} today` : days === 1 ? `${word} tomorrow` : `${word} ${shortDate(deadline, timeZone)}`, tone: days <= 1 ? "due" : "info" });
  }
  if (task.committed) out.push({ label: "Pinned today", tone: "info" });
  if (task.weekly) out.push({ label: "Weekly priority", tone: "info" });
  if (task.links.some((link) => link.kind === "draft")) out.push({ label: "Draft attached", tone: "info" });
  return out;
}

const NO_QUICK = new Set<QuickFilter>();

const dragProps = (task: BoardTask) => ({
  draggable: true,
  onDragStart: (event: React.DragEvent) => {
    event.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ taskId: task.id, minutes: task.minutes, mode: task.start ? "block" : "task", grabMin: 0 } satisfies DragPayload));
    event.dataTransfer.effectAllowed = "move";
  }
});

// A routine for today: weekly progress, one-tap done, and drag or Schedule to give it time.
function RoutineCard({ habit, task, timeZone, onMessage, onSchedule, onPick, pickedId }: {
  habit: Habit; task: BoardTask | null; timeZone: string; onMessage: (result: PlanMessage) => void; onSchedule: (task: BoardTask) => void; onPick: (task: BoardTask) => void; pickedId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const weekMet = !habit.todayTaskId && habit.week.target > 0 && habit.week.done >= habit.week.target;
  const pct = habit.week.target ? Math.min(100, Math.round((habit.week.done / habit.week.target) * 100)) : 0;
  const finished = habit.done || weekMet;
  return (
    <li className={`rounded-xl border border-l-[3px] px-3 py-2.5 ${areaLook(habit.areaSlug).card} ${finished ? "opacity-60" : "cursor-grab active:cursor-grabbing"} ${task && pickedId === task.id ? "ring-2 ring-primary" : ""}`} {...(task && !finished ? dragProps(task) : {})}>
      <div className="flex items-start gap-2">
        <button
          aria-label={habit.done ? `Undo: ${habit.title}` : `Done: ${habit.title}`}
          aria-pressed={habit.done}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[10px] ${finished ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40 text-transparent hover:border-primary hover:text-primary"}`}
          disabled={pending || !habit.todayTaskId}
          onClick={() => startTransition(async () => onMessage(await habitDoneAction(habit.todayTaskId as string, !habit.done)))}
          type="button"
        >✓</button>
        <div className="min-w-0 flex-1">
          <button className="block w-full truncate text-left text-sm font-medium" disabled={!task || finished} onClick={() => task && onPick(task)} type="button">{habit.title}</button>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {weekMet ? "Week done" : habit.done ? "Done today" : `${fmtLength(habit.minutes)}${task?.start ? ` · ${clock(task.start, timeZone)}` : ""}`}
            {habit.week.target > 0 && <span className="tabular-nums"> · {habit.week.done}/{habit.week.target} this week</span>}
          </p>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${areaLook(habit.areaSlug).dot}`} style={{ width: `${pct}%` }} /></div>
        </div>
      </div>
      {task && !finished && (
        <div className="mt-2 pl-7 text-xs">
          <button className="rounded-full border bg-background/60 px-2.5 py-1 font-medium hover:border-primary/60 hover:text-primary" onClick={() => onSchedule(task)} type="button">{task.start ? "Move" : "Schedule"}</button>
        </div>
      )}
    </li>
  );
}

// One card per app: review them all in the app itself, or book one review block. Items stay listed underneath.
function CheckinGroup({ source, label, count, tool, onMessage, children }: {
  source: string; label: string; count: number; tool: { href: string | null; label: string } | null; onMessage: (result: PlanMessage) => void; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <div className="rounded-xl border bg-background/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{label} <span className="font-normal text-muted-foreground">· {count} to review</span></p>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
        {tool?.href && <a className="rounded-full bg-primary px-3 py-1 font-semibold text-primary-foreground" href={tool.href} rel="noopener noreferrer" target="_blank">Open {tool.label} ↗</a>}
        <button className="rounded-full border bg-background/60 px-2.5 py-1 font-medium hover:border-primary/60 hover:text-primary disabled:opacity-50" disabled={pending} onClick={() => startTransition(async () => onMessage(await scheduleCheckinReviewAction(source, label, count, tool?.href ?? null)))} type="button">{pending ? "Booking…" : "Schedule review"}</button>
        <button aria-expanded={open} className="rounded-full border bg-background/60 px-2.5 py-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setOpen((value) => !value)} type="button">{open ? "Hide items" : `Show ${count}`}</button>
      </div>
      {open && <ul className="mt-2 space-y-1.5">{children}</ul>}
    </div>
  );
}

// An item from one of Ryan's apps: clear it (done / tomorrow / open it there) or, if it needs real time, schedule it.
function CheckinCard({ task, timeZone, onDone, onSchedule, onMessage, onPick, pickedId }: { task: BoardTask; timeZone: string } & CardHandlers) {
  const [pending, startTransition] = useTransition();
  const deadline = task.expiresAt ? `expires ${shortDate(task.expiresAt, timeZone)}` : task.dueDate ? `due ${shortDate(task.dueDate, timeZone)}` : null;
  return (
    <li className={`cursor-grab rounded-lg border bg-card px-2.5 py-2 active:cursor-grabbing ${pickedId === task.id ? "ring-2 ring-primary" : ""} ${task.start ? "opacity-60" : ""}`} {...dragProps(task)}>
      <button className="line-clamp-2 block w-full text-left text-[13px] font-medium leading-snug" onClick={() => onPick(task)} title={task.title} type="button">{shortTitle(task.title)}</button>
      <p className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
        {deadline && <span className={task.urgent ? "font-semibold text-destructive" : ""}>{deadline}</span>}
        {task.start && <span>{dayLabel(task.start, timeZone)} {clock(task.start, timeZone)}</span>}
        {(task.priority === "HIGH" || task.priority === "CRITICAL") && <span className="font-bold text-amber-500">!</span>}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1 text-[11px]">
        <button className="rounded-md border border-primary/40 px-2 py-0.5 font-semibold text-primary hover:bg-primary/10" disabled={pending} onClick={() => onDone(task.id)} type="button">Done</button>
        <button className="rounded-md border px-2 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" disabled={pending} onClick={() => startTransition(async () => onMessage(await v2PostponeAction(task.id, "TOMORROW")))} type="button">Tomorrow</button>
        <button className="rounded-md border px-2 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => onSchedule(task)} type="button">{task.start ? "Move" : "Schedule"}</button>
        <a className="rounded-md border px-2 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" href={task.href} {...(task.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>Open ↗</a>
      </div>
    </li>
  );
}

// New task button with its own result line (used on Now).
export function QuickAddBox({ targets, timeZone }: { targets: QuickTarget[]; timeZone: string }) {
  const [message, setMessage] = useState<PlanMessage | null>(null);
  return (
    <div className="space-y-2">
      <NewTaskButton label="New task — pick the project, day and length" onDone={setMessage} targets={targets} timeZone={timeZone} />
      <p aria-live="polite" className={`min-h-5 text-sm ${message && !message.ok ? "font-medium text-destructive" : "text-muted-foreground"}`}>{message?.message}</p>
    </div>
  );
}

type CardHandlers = {
  onDone: (id: string) => void; onSchedule: (task: BoardTask) => void; onMessage: (result: PlanMessage) => void;
  onPick: (task: BoardTask) => void; pickedId: string | null;
};

function AreaList({ area, overrides, timeZone, targets, open, filtering, onOpenChange, ...handlers }: {
  area: BoardArea; overrides: Record<string, Override>; timeZone: string; targets: QuickTarget[]; open: boolean; filtering: boolean; onOpenChange: (open: boolean) => void;
} & CardHandlers) {
  const unplaced = (tasks: BoardTask[]) => tasks.map((task) => (overrides[task.id] ? { ...task, ...overrides[task.id] } : task));
  const count = area.projects.reduce((sum, project) => sum + project.tasks.length, 0) + area.loose.length;
  return (
    <details className="group rounded-xl border bg-background/40" onToggle={(event) => { if (!filtering && event.currentTarget.open !== open) onOpenChange(event.currentTarget.open); }} open={open}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2.5">
          <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${areaLook(area.slug).dot}`} />
          {area.name}
        </span>
        <span className="flex items-center gap-2">
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">{count} open</span>
          <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-90">›</span>
        </span>
      </summary>
      <div className="space-y-3 px-3 pb-3">
        {area.projects.length === 0 && area.loose.length === 0 && !filtering && <NewTaskButton label={`+ Add to ${area.name}`} onDone={handlers.onMessage} presetId={area.id} targets={targets} timeZone={timeZone} variant="chip" />}
        {area.projects.map((project) => (
          <div key={project.id}>
            <div className="flex items-center justify-between gap-2 px-1">
              <p className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{project.name}</p>
              {!filtering && <NewTaskButton label="+ Add" onDone={handlers.onMessage} presetId={project.id} targets={targets} timeZone={timeZone} variant="chip" />}
            </div>
            <ul className="mt-1 space-y-1.5">
              {unplaced(project.tasks).map((task) => <TaskCard key={task.id} task={task} timeZone={timeZone} {...handlers} />)}
            </ul>
          </div>
        ))}
        {area.loose.length > 0 && (
          <div>
            <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">No project</p>
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
      className={`cursor-grab rounded-xl border border-l-[3px] px-3 py-2.5 transition-all hover:-translate-y-px hover:shadow-md active:cursor-grabbing ${areaLook(task.areaSlug).card} ${task.start && pickedId !== task.id ? "opacity-55" : ""} ${pickedId === task.id ? "shadow-[0_0_24px_-6px_hsl(var(--primary)/0.7)] ring-2 ring-primary" : ""}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ taskId: task.id, minutes: task.minutes, mode: task.start ? "block" : "task", grabMin: 0 } satisfies DragPayload));
        event.dataTransfer.effectAllowed = "move";
      }}
    >
      <div className="flex items-start gap-2">
        <button aria-label={`Mark done: ${task.title}`} className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/40 text-[10px] text-transparent transition-colors hover:border-primary hover:bg-primary/15 hover:text-primary" onClick={() => onDone(task.id)} type="button">✓</button>
        <div className="min-w-0 flex-1">
          <button aria-pressed={pickedId === task.id} className="block w-full break-words text-left text-sm font-medium leading-snug focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={() => onPick(task)} title={task.title} type="button">{shortTitle(task.title)}</button>
          <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
            {task.source && <span className="rounded-md border bg-background/60 px-1.5 text-[11px] font-medium">{SOURCE_LABEL[task.source] ?? task.source}</span>}
            {deadline && <span className={task.urgent ? "rounded-md bg-destructive/15 px-1.5 font-semibold text-destructive" : ""}>{deadline}</span>}
            <span>{fmtLength(task.minutes)}</span>
            {task.start && <span>{dayLabel(task.start, timeZone)} {clock(task.start, timeZone)}</span>}
            {task.waitingOn && <span>waiting on {task.waitingOn}</span>}
            {(task.priority === "HIGH" || task.priority === "CRITICAL") && <span className="font-bold text-amber-500">{task.priority === "CRITICAL" ? "!!" : "!"}</span>}
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 pl-7 text-xs">
        {!task.start && (
          <button aria-pressed={Boolean(task.committed)} className={`rounded-full border px-2.5 py-1 font-medium ${task.committed ? "border-primary/60 bg-primary/15 text-primary" : "bg-background/60 hover:border-primary/60 hover:text-primary"}`} disabled={pending} onClick={() => startTransition(async () => onMessage(await pinTodayAction(task.id, !task.committed)))} title={task.committed ? "Pinned to today; tap to unpin" : "Do it today; Plan my day will fit it in"} type="button">{task.committed ? "📌 Today" : "Today"}</button>
        )}
        <button className="rounded-full border bg-background/60 px-2.5 py-1 font-medium hover:border-primary/60 hover:text-primary" onClick={() => onSchedule(task)} type="button">{task.start ? "Move" : "Schedule"}</button>
        <button className="rounded-full border bg-background/60 px-2.5 py-1 text-muted-foreground hover:bg-muted hover:text-foreground" disabled={pending} onClick={() => startTransition(async () => onMessage(await v2PostponeAction(task.id, "TOMORROW")))} type="button">Tomorrow</button>
        <button className="rounded-full border bg-background/60 px-2.5 py-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setWaiting((open) => !open)} type="button">{task.waitingOn ? "Waiting…" : "Waiting on…"}</button>
        <button className="rounded-full border bg-background/60 px-2.5 py-1 text-muted-foreground hover:border-destructive/50 hover:text-destructive" disabled={pending} onClick={() => { if (window.confirm(`Drop "${task.title}"?`)) startTransition(async () => onMessage(await v2PostponeAction(task.id, "DROP"))); }} type="button">Drop</button>
        <a className="rounded-full border bg-background/60 px-2.5 py-1 text-muted-foreground hover:bg-muted hover:text-foreground" href={task.href} {...(task.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>Open</a>
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

type GhostBlock = { taskId: string; title: string; start: string; end: string; areaSlug: string; off: boolean };

function CalendarGrid({ board, days, blocks, allTasks, compact = false, picked, preview = [], onPlace, onOpenBlock, onSchedule, onUnschedule, onDone }: {
  board: Board; days: string[]; blocks: BoardTask[]; allTasks: Map<string, BoardTask>; compact?: boolean; preview?: GhostBlock[];
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
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="grid border-b" style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` }}>
        <div />
        {days.map((day) => {
          const today = dateKey(day, tz) === todayKey;
          return (
            <div className="flex items-center justify-center gap-2 px-2 py-2.5" key={day}>
              <span className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${today ? "text-primary" : "text-muted-foreground"}`}>{new Date(day).toLocaleDateString("en-US", { timeZone: tz, weekday: "short" })}</span>
              <span className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-sm font-bold tabular-nums ${today ? "bg-primary text-primary-foreground shadow-[0_0_16px_-2px_hsl(var(--primary)/0.7)]" : ""}`}>{new Date(day).toLocaleDateString("en-US", { timeZone: tz, day: "numeric" })}</span>
            </div>
          );
        })}
      </div>
      <div className={compact ? "h-[34vh] overflow-y-auto" : "h-[calc(100vh-15rem)] min-h-[420px] overflow-y-auto"} ref={scroller}>
        <div className="relative grid" style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))`, height }}>
          <div className="relative">
            {Array.from({ length: (range.end - range.start) / 60 }, (_, index) => (
              <span className="absolute right-2 -translate-y-1/2 text-[10px] font-medium uppercase tabular-nums tracking-wide text-muted-foreground/80" key={index} style={{ top: index * 60 * PX_PER_MIN }}>
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
                className={`relative border-l border-border/60 ${isToday ? "bg-primary/[0.025]" : ""}`}
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
                style={{ backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${30 * PX_PER_MIN - 1}px, hsl(var(--border) / 0.35) ${30 * PX_PER_MIN - 1}px, hsl(var(--border) / 0.35) ${30 * PX_PER_MIN}px, transparent ${30 * PX_PER_MIN}px, transparent ${60 * PX_PER_MIN - 1}px, hsl(var(--border) / 0.8) ${60 * PX_PER_MIN - 1}px, hsl(var(--border) / 0.8) ${60 * PX_PER_MIN}px)` }}
              >
                {[{ from: range.start, to: board.workdayStartMin }, { from: board.dayEndMin, to: range.end }].map((shade) => shade.to > shade.from && (
                  <div aria-hidden className="offhours absolute inset-x-0" key={shade.from} style={{ top: (shade.from - range.start) * PX_PER_MIN, height: (shade.to - shade.from) * PX_PER_MIN }} />
                ))}
                {board.availability.work.filter((window) => columnOf(window.start) === dayIndex).map((window) => {
                  const top = (minutesInZone(window.start, tz) - range.start) * PX_PER_MIN;
                  const length = (Date.parse(window.end) - Date.parse(window.start)) / MIN;
                  return (
                    <div aria-label={`Work hours ${clock(window.start, tz)}–${clock(window.end, tz)}, protected`} className="pointer-events-none absolute inset-x-0 border-y border-dashed border-amber-400/25 bg-amber-400/[0.04]" key={`work-${window.start}`} style={{ top, height: length * PX_PER_MIN }}>
                      <span className="absolute right-1 top-0.5 rounded bg-amber-400/15 px-1 text-[9.5px] font-semibold uppercase tracking-wide text-amber-700/80 dark:text-amber-300/80">Work · protected</span>
                    </div>
                  );
                })}
                {dayMeetings.map((meeting) => {
                  const top = (minutesInZone(meeting.start, tz) - range.start) * PX_PER_MIN;
                  const length = Math.max(15, (Date.parse(meeting.end) - Date.parse(meeting.start)) / MIN);
                  const optional = meeting.optional && !board.availability.optionalBlocks;
                  return (
                    <div className={`absolute inset-x-1 overflow-hidden rounded-lg border px-1.5 py-0.5 text-[11px] leading-tight backdrop-blur-sm ${optional ? "border-dashed border-sky-400/40 bg-transparent opacity-70" : "border-l-[3px] border-sky-400/30 border-l-sky-400 bg-sky-500/10"}`} key={`${meeting.start}-${meeting.title}`} style={{ top, height: length * PX_PER_MIN - 2 }} title={`${meeting.title} ${clock(meeting.start, tz)}–${clock(meeting.end, tz)}${optional ? " · optional, doesn't block time" : ""}`}>
                      <p className="truncate font-medium">{meeting.title}</p>
                      <p className="text-muted-foreground">{clock(meeting.start, tz)}{optional ? " · optional" : ""}</p>
                    </div>
                  );
                })}
                {preview.filter((ghost) => !ghost.off && columnOf(ghost.start) === dayIndex).map((ghost) => {
                  const top = (minutesInZone(ghost.start, tz) - range.start) * PX_PER_MIN;
                  const length = (Date.parse(ghost.end) - Date.parse(ghost.start)) / MIN;
                  return (
                    <div aria-label={`Proposed: ${ghost.title} at ${clock(ghost.start, tz)}`} className="pointer-events-none absolute inset-x-1 z-[5] overflow-hidden rounded-lg border-2 border-dashed border-primary/70 bg-primary/10 px-1.5 py-0.5 text-[11px] leading-tight" key={`ghost-${ghost.taskId}`} style={{ top, height: Math.max(15, length) * PX_PER_MIN - 2 }}>
                      <p className="truncate font-semibold">{ghost.title}</p>
                      {length >= 35 && <p className="truncate text-muted-foreground">Proposed · {clock(ghost.start, tz)}</p>}
                    </div>
                  );
                })}
                {dayBlocks.map((task) => {
                  const startMin = minutesInZone(task.start as string, tz);
                  const length = (Date.parse(task.end as string) - Date.parse(task.start as string)) / MIN;
                  const shownEnd = resize?.taskId === task.id ? resize.endMin : startMin + length;
                  const top = (startMin - range.start) * PX_PER_MIN;
                  // Short blocks get one line (title + time) so nothing overflows; full text is in the tooltip.
                  const short = shownEnd - startMin < 35;
                  return (
                    <div
                      className={`absolute left-1 right-1 cursor-grab overflow-hidden rounded-lg border border-white/20 bg-gradient-to-br px-1.5 ${short ? "py-0 text-[10.5px] leading-[13px]" : "py-0.5 text-[11px] leading-tight"} text-white shadow-lg transition-shadow hover:shadow-xl active:cursor-grabbing ${areaLook(task.areaSlug).block}`}
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
                        <p className={`min-w-0 font-semibold ${short ? "truncate" : "line-clamp-2 break-words"}`}>
                          {task.title}
                          {short && <span className="font-normal text-white/75"> · {clock(task.start as string, tz)}</span>}
                        </p>
                        <span className="relative z-10 flex shrink-0 gap-0.5">
                          <button aria-label={`Done: ${task.title}`} className="rounded px-1 hover:bg-white/25" onClick={(event) => { event.stopPropagation(); onDone(task.id); }} type="button">✓</button>
                          <button aria-label={`Back to list: ${task.title}`} className="rounded px-1 hover:bg-white/25" onClick={(event) => { event.stopPropagation(); onUnschedule(task.id); }} type="button">×</button>
                        </span>
                      </div>
                      {!short && <p className="truncate text-white/80">{clock(task.start as string, tz)} · {fmtLength(Math.round(shownEnd - startMin))}{task.source ? ` · ${SOURCE_LABEL[task.source] ?? task.source}` : ""}</p>}
                      <div
                        aria-label={`Change length of ${task.title}`}
                        className={`absolute bottom-0 cursor-ns-resize hover:bg-white/30 ${short ? "left-0 right-12 h-1" : "inset-x-0 h-2"}`}
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
                      const busy = [...dayMeetings.filter((m) => !m.optional || board.availability.optionalBlocks).map((m) => [Date.parse(m.start), Date.parse(m.end)]), ...dayBlocks.filter((b) => b.id !== picked.id).map((b) => [Date.parse(b.start as string), Date.parse(b.end as string)])];
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
                  <div aria-hidden className="pointer-events-none absolute inset-x-1 h-[30px] rounded-lg border-2 border-dashed border-primary bg-primary/10" style={{ top: (hover.minute - range.start) * PX_PER_MIN }}>
                    <span className="m-1 inline-block rounded-md bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{new Date(Date.UTC(2000, 0, 1, 0, hover.minute)).toLocaleTimeString("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit" })}</span>
                  </div>
                )}
                {isToday && nowMin >= range.start && nowMin <= range.end && (
                  <div aria-hidden className="pointer-events-none absolute inset-x-0 z-10" style={{ top: (nowMin - range.start) * PX_PER_MIN }}>
                    <div className="h-[2px] bg-gradient-to-r from-destructive to-destructive/30 shadow-[0_0_8px_hsl(var(--destructive)/0.8)]" />
                    <span className="now-dot absolute -left-1 -top-[5px] h-3 w-3 rounded-full bg-destructive ring-2 ring-card" />
                  </div>
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
// Free starts that fit the task, from now (or the planning start) to the end of the day, using the shared
// availability rules: blocking meetings, other blocks, and work hours unless it's a Work-area task.
export function freeStarts(board: Board, blocks: BoardTask[], dayStartIso: string, minutes: number, task: Pick<BoardTask, "id" | "areaSlug" | "workContext">, limit = 6) {
  const dayStart = Date.parse(dayStartIso);
  const busy = personalBusy(board, blocks, { excludeId: task.id, work: respectsWorkHours(task.areaSlug, task.workContext) });
  const nowRounded = Math.ceil(Date.parse(board.now) / (SNAP * MIN)) * SNAP * MIN;
  const out: Date[] = [];
  for (let t = Math.max(dayStart + planningStartMin(board.workdayStartMin) * MIN, nowRounded); t + minutes * MIN <= dayStart + board.dayEndMin * MIN && out.length < limit; t += SNAP * MIN) {
    const end = t + minutes * MIN;
    if (busy.every(({ start, end: stop }) => stop <= t || start >= end)) {
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
  const options = board.soonDays.map((day, index) => ({ label: index === 0 ? "Today" : "Tomorrow", starts: freeStarts(board, blocks, day, minutes, task) }));
  const pickCustom = () => {
    if (!custom) return;
    // datetime-local is wall time in Ryan's zone: shift by the zone offset at that moment.
    const naive = new Date(`${custom}:00Z`);
    const offset = minutesInZone(naive.toISOString(), tz) - (naive.getUTCHours() * 60 + naive.getUTCMinutes());
    const wrapped = offset > 720 ? offset - 1440 : offset < -720 ? offset + 1440 : offset;
    onPick(new Date(naive.getTime() - wrapped * MIN), minutes);
  };
  return (
    <div aria-modal className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center" onClick={onClose} role="dialog">
      <div className="w-full max-w-md rounded-t-3xl border bg-card p-5 shadow-2xl sm:rounded-3xl" onClick={(event) => event.stopPropagation()}>
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
                  <button className="rounded-full border px-3.5 py-2 text-sm font-medium tabular-nums transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary" key={start.toISOString()} onClick={() => onPick(start, minutes)} type="button">{clock(start.toISOString(), tz)}</button>
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
          <button className="rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground" onClick={onDone} type="button">✓ Done</button>
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
