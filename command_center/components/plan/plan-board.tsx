"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { bookPlanAction, bookSlotAction, habitDoneAction, moveBlockAction, pinTodayAction, planDoneAction, previewDayAction, scheduleCheckinReviewAction, takeOverAction, waitingOnAction, type PlanMessage, type PreviewLine, type PreviewResult } from "@/app/plan/actions";
import type { Board, BoardArea, BoardLink, BoardTask, ShelfProject } from "@/server/v2/board";
import type { Habit } from "@/server/v2/habits";
import type { QuickTarget } from "@/lib/v2/quick-add";
import { NewTaskButton } from "@/components/plan/task-composer";
import { SOURCE_LABEL, taskMatches, type QuickFilter } from "@/lib/v2/plan-filters";
import { v2PostponeAction } from "@/app/now/v2-actions";
import { dayLoad, personalBusy, planningStartMin } from "@/lib/v2/day-load";
import { blockingEvents, respectsWorkHours } from "@/lib/v2/availability";
import { shortTitle } from "@/lib/v2/short-title";
import { areaHex, areaLook } from "@/lib/v2/area-look";
import { dueSoonest, fitsOpening, gridWindow, nextOpening, reasonFor, startsFor } from "@/lib/v2/today";
import { ActionTray, DRAG_TYPE, FocusTray, PlanSheet, ProjectShelf, TimeGrid, buttonStyles, clockAt, earlierLines, lengthLabel, minutesInZone, pills, spanLabel, type DragPayload } from "@/components/plan/today";

// Plan is Today (2026-11-25 redesign): when am I free, which project should I move, what have I committed to.
// Desktop: date and open time, the pinned project shelf, the next-action tray, then the calendar with a small
// commitments/Inbox rail. Drag a ready card onto the calendar, or press Plan and pick a highlighted time.
// Phone: heading, next-free callout, a swipeable project row, up to two actions that fit, and the time grid
// last; Plan opens a time sheet and nothing is saved until "Add to calendar". Every booking goes through the
// server scheduler (bookSlot), which rechecks the slot; a booked task is the same task row everywhere.

const MIN = 60_000;
const SNAP = 15;
type Override = { start: string | null; end: string | null };

const dateKey = (iso: string, timeZone: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone });
const dayLabel = (iso: string, timeZone: string) => new Date(iso).toLocaleDateString("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" });
const shortDate = (iso: string, timeZone: string) => new Date(iso).toLocaleDateString("en-US", { timeZone, month: "short", day: "numeric" });
const clock = (iso: string, timeZone: string) => clockAt(iso, timeZone);
const fmtLength = lengthLabel;

const MODE_KEY = "ryanos.plan.mode";
const CLOSED_KEY = "ryanos.plan.closedAreas";
function readClosed(): Set<string> {
  try { return new Set(JSON.parse(window.localStorage.getItem(CLOSED_KEY) ?? "[]") as string[]); } catch { return new Set(); }
}
function writeClosed(closed: Set<string>) {
  try { window.localStorage.setItem(CLOSED_KEY, JSON.stringify([...closed])); } catch { /* storage unavailable: still works, just not remembered */ }
}

function readPayload(event: React.DragEvent): DragPayload | null {
  try {
    const raw = event.dataTransfer.getData(DRAG_TYPE);
    return raw ? (JSON.parse(raw) as DragPayload) : null;
  } catch {
    return null;
  }
}

const CalendarIcon = () => (
  <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24" width="16"><rect height="16" rx="2" width="18" x="3" y="5" /><path d="M16 3v4M8 3v4M3 10h18m-12 5h3m3 0h1" /></svg>
);

export function PlanBoard({ board, view }: { board: Board; view: "day" | "3" | "week" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<PlanMessage | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [scheduling, setScheduling] = useState<BoardTask | null>(null);
  const [picked, setPicked] = useState<BoardTask | null>(null); // desktop: Plan pressed, waiting for a time
  const [sheetTask, setSheetTask] = useState<BoardTask | null>(null); // phone: the time sheet
  const [filter, setFilter] = useState<string>("all");
  const [phoneProject, setPhoneProject] = useState<string | null>(null);
  const [mode, setModeState] = useState<"shelf" | "focus">("shelf");
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [previewing, startPreview] = useTransition();
  const [closed, setClosed] = useState<Set<string>>(new Set());
  useEffect(() => {
    setClosed(readClosed());
    try { if (window.localStorage.getItem(MODE_KEY) === "focus") setModeState("focus"); } catch { /* default mode */ }
  }, []);
  const setMode = (next: "shelf" | "focus") => {
    setModeState(next);
    try { window.localStorage.setItem(MODE_KEY, next); } catch { /* not remembered */ }
  };
  const setAreaOpen = (slug: string, open: boolean) => setClosed((current) => {
    const next = new Set(current);
    if (open) next.delete(slug); else next.add(slug);
    writeClosed(next);
    return next;
  });
  const tz = board.timeZone;

  useEffect(() => setOverrides({}), [board]);
  useEffect(() => {
    if (!message?.ok) return;
    const timer = window.setTimeout(() => setMessage(null), 5000);
    return () => window.clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    if (!picked) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setPicked(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picked]);

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
  const everyTask = board.areas.flatMap((area) => [...area.loose, ...area.projects.flatMap((project) => project.tasks)]);
  const mineAreas = board.areas
    .map((area) => ({ ...area, projects: area.projects.map((project) => ({ ...project, tasks: project.tasks.filter((task) => !isCheckin(task) && keep(task)) })).filter((project) => project.tasks.length > 0), loose: area.loose.filter((task) => !isCheckin(task) && keep(task)) }))
    .filter((area) => area.projects.length > 0 || area.loose.length > 0);
  const mineTasks = mineAreas.flatMap((area) => [...area.loose, ...area.projects.flatMap((project) => project.tasks)]);
  // Ready for Ryan: his own open to-dos (not check-ins, not waiting, not with an agent) that aren't booked yet.
  const ready = readyOrder(everyTask.filter((task) => !isCheckin(task) && task.ready === "ready").map(withOverride).filter((task) => !task.start));
  const shownWaiting = board.waiting.filter((task) => !task.source && keep(task));
  const checkins = everyTask.filter(isCheckin).map(withOverride);
  const checkinGroups = [...new Set(checkins.map((task) => task.source as string))]
    .map((source) => ({ source, label: SOURCE_LABEL[source] ?? source, tasks: checkins.filter((task) => task.source === source) }))
    .sort((a, b) => b.tasks.length - a.tasks.length);

  const openTasks = [...everyTask, ...board.waiting].filter((task) => !task.source);
  const load = dayLoad(board, blocks, openTasks);
  const opening = nextOpening(board, blocks);
  const fits = (task: BoardTask) => fitsOpening(board, blocks, task, opening);
  const todayStartMs = Date.parse(board.soonDays[0]);
  const missed = blocks.filter((task) => Date.parse(task.start as string) >= todayStartMs && Date.parse(task.end as string) <= Date.parse(board.now));
  const optionalToday = board.meetings.filter((meeting) => meeting.optional && Date.parse(meeting.start) >= todayStartMs && Date.parse(meeting.start) < Date.parse(board.soonDays[1]));

  // Today's routines (walk, workout, eBay listing, ...) sit in a bar across the top of Today (2026-11-25 owner
  // feedback: "more prominent ... not tucked away on side"): tick one off, or Plan it like any other action.
  const routineTask = (habit: Habit) => (habit.todayTaskId ? withOverrideMaybe(allTasks.get(habit.todayTaskId)) : null);
  const shelf = board.shelf;
  const poolFor = (tile: ShelfProject | null) => (!tile ? ready : dueSoonest(ready.filter((task) => task.areaSlug === tile.areaSlug)));
  const shelfProject = filter === "all" ? null : shelf.find((project) => project.id === filter) ?? null;
  const trayReady = poolFor(shelfProject);
  const phoneSelected = shelf.find((project) => project.id === phoneProject) ?? shelf[0] ?? null;

  // Booking: the server scheduler rechecks the slot; a moved block keeps its task (and its links and source).
  const book = (task: BoardTask, startMs: number, minutes: number) => {
    const start = new Date(startMs).toISOString();
    const end = new Date(startMs + minutes * MIN).toISOString();
    setPicked(null);
    run(() => bookSlotAction(task.id, start, end), { [task.id]: { start, end } });
  };
  // A length change (resize, or another length in the Move sheet) uses the block editor, which records the length.
  const setLength = (task: BoardTask, start: Date, minutes: number) => {
    const end = new Date(start.getTime() + minutes * MIN);
    run(() => moveBlockAction(task.id, start.toISOString(), end.toISOString()), { [task.id]: { start: start.toISOString(), end: end.toISOString() } });
  };
  const unschedule = (taskId: string) => run(() => moveBlockAction(taskId, null, null), { [taskId]: { start: null, end: null } });
  const done = (taskId: string) => run(() => planDoneAction(taskId));
  const nextStart = (task: BoardTask) => startsFor(board, blocks, task, board.soonDays[0])[0] ?? startsFor(board, blocks, task, board.soonDays[1])[0] ?? null;

  const openPreview = () => startPreview(async () => {
    setPicked(null);
    const result = await previewDayAction();
    // Commitments start ticked; "If there's time" extras start unticked.
    setSkip(new Set(result.items.filter((item) => item.group === "EXTRA").map((item) => item.taskId)));
    setPreview(result);
    if (!result.ok) setMessage({ ok: false, message: result.message });
  });
  const bookPreview = () => {
    if (!preview) return;
    const items = preview.items.filter((item) => !skip.has(item.taskId)).map((item) => ({ taskId: item.taskId, start: item.start, end: item.end }));
    setPreview(null);
    run(() => bookPlanAction(items), Object.fromEntries(items.map((item) => [item.taskId, { start: item.start, end: item.end }])));
  };

  const first = board.days[0];
  const isTodayView = dateKey(first, tz) === dateKey(board.now, tz);
  const step = view === "week" ? 7 : view === "3" ? 3 : 1;
  const shift = (days: number) => dateKey(new Date(Date.parse(first) + days * 86_400_000 + 12 * 3_600_000).toISOString(), tz);
  const viewHref = (nextView: string, date?: string) => `/plan?view=${nextView}${date ? `&date=${date}` : ""}`;
  const minuteOf = (iso: string) => minutesInZone(iso, tz);
  const dayWindow = gridWindow(board, blocks, first, minuteOf, false);
  const evening = isTodayView && view === "day" && dayWindow.start >= 16 * 60;
  const calendarTitle = view !== "day" ? "Calendar" : !isTodayView ? `${dayLabel(first, tz)} calendar` : evening ? "Evening calendar" : dayWindow.start >= 12 * 60 ? "Afternoon calendar" : "Today's calendar";
  const earlier = view === "day" && dayWindow.earlier ? earlierLines(board, blocks, first, dayWindow.earlier) : [];
  const weekday = new Date(first).toLocaleDateString("en-US", { timeZone: tz, weekday: "long" }).toUpperCase();
  const eyebrow = `${weekday} · ${new Date(first).toLocaleDateString("en-US", { timeZone: tz, month: "long", day: "numeric" }).toUpperCase()}`;
  const phoneEyebrow = `${weekday} · ${new Date(first).toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric" }).toUpperCase()}`;
  const heading = view !== "day" ? `Plan ${dayLabel(first, tz)} – ${dayLabel(board.days[board.days.length - 1], tz)}` : isTodayView ? "Plan today" : `Plan ${new Date(first).toLocaleDateString("en-US", { timeZone: tz, weekday: "long" })}`;
  const previewLabel = minuteOf(board.now) >= 16 * 60 ? "Preview my evening" : "Preview my day";
  const todayBlocks = blocks.filter((task) => dateKey(task.start as string, tz) === dateKey(board.now, tz));
  const commitments = [
    ...todayBlocks.map((task) => ({ key: task.id, at: Date.parse(task.start as string), title: task.title, slug: task.isProtected ? "" : task.areaSlug, task })),
    ...blockingEvents(board.meetings, board.availability.optionalBlocks)
      .filter((meeting) => dateKey(meeting.start, tz) === dateKey(board.now, tz) && Date.parse(meeting.end) > Date.parse(board.now))
      .map((meeting) => ({ key: `${meeting.start}-${meeting.title}`, at: Date.parse(meeting.start), title: meeting.title, slug: "", task: null as BoardTask | null }))
  ].sort((a, b) => a.at - b.at);

  const grid = (phone: boolean) => (
    <TimeGrid
      allTasks={allTasks}
      blocks={blocks}
      board={board}
      days={phone ? [first] : board.days}
      expanded={expanded}
      onBook={book}
      onOpenBlock={(task) => { if (!picked) setScheduling(task); }}
      onResize={(task, minutes) => setLength(task, new Date(task.start as string), minutes)}
      phone={phone}
      picked={phone ? null : picked}
      preview={!phone && preview ? preview.items.map((item) => ({ ...item, off: skip.has(item.taskId) })) : []}
    />
  );
  const earlierFold = earlier.length > 0 && (
    <details className="border-b bg-muted/50 px-3.5 py-[7px] text-[0.77rem] text-today-ink2" onToggle={(event) => setExpanded(event.currentTarget.open)} open={expanded}>
      <summary className="w-fit cursor-pointer font-semibold">Earlier and protected time</summary>
      <p className="mt-1">{earlier.join(" · ")}</p>
    </details>
  );
  const warnings = (
    <>
      {!board.calendarKnown && <p className="text-[0.8rem] font-medium text-amber-700 dark:text-amber-400">Google Calendar couldn&apos;t be read, so meetings may be missing and open time is unconfirmed.</p>}
      {board.calendarSync.enabled && !board.calendarSync.ok && <p className="text-[0.8rem] text-amber-700 dark:text-amber-400">Google Calendar sync: {board.calendarSync.message}</p>}
    </>
  );

  // ——— Phone ———
  const phonePool = phoneSelected ? poolFor(phoneSelected) : [];
  const phoneFitting = phonePool.filter(fits);
  const phonePicks = (phoneSelected?.workOnly ? phonePool : phoneFitting).slice(0, 2);
  const phoneRest = phonePool.filter((task) => !phonePicks.includes(task));
  const phoneAction = (task: BoardTask) => (
    <article className="flex items-center justify-between gap-[9px] border-b border-border/70 px-2.5 py-1.5 last:border-b-0" key={task.id}>
      <div className="min-w-0">
        <h3 className="break-words text-[0.82rem] font-semibold leading-[1.3] tracking-[-0.01em]" title={task.title}>{shortTitle(task.title)}</h3>
        <p className="mt-0.5 text-[0.72rem] text-muted-foreground">{task.minutes} min · {reasonFor(task, tz, board.now)}{task.projectName ? ` · ${task.projectName}` : ""}</p>
      </div>
      <button aria-label={`Plan ${task.title}`} className="min-h-11 shrink-0 rounded-lg border border-today-accent-line bg-today-accent-soft px-2.5 py-1.5 text-[0.82rem] font-bold text-today-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-today-accent/50" onClick={() => setSheetTask(task)} type="button">Plan</button>
    </article>
  );

  return (
    <div>
      {/* ——— Phone (below 768px): the approved native layout ——— */}
      <div className="md:hidden">
        <div className="mb-[9px] flex items-center justify-between gap-[7px]">
          <div>
            <p className="mb-[3px] text-[0.68rem] font-extrabold uppercase tracking-[0.09em] text-today-accent">{phoneEyebrow}</p>
            <h1 className="text-[1.67rem] font-bold leading-[1.15] tracking-[-0.055em]">{heading}</h1>
          </div>
          <button
            className={`${buttonStyles.base} min-h-11`}
            onClick={() => {
              const calendar = document.getElementById("today-calendar");
              calendar?.focus({ preventScroll: true });
              // Scroll the window itself (scrollIntoView is unreliable under the sticky header); stop below the header.
              if (calendar) window.scrollTo({ top: calendar.getBoundingClientRect().top + window.scrollY - 68, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
            }}
            type="button"
          >
            <CalendarIcon /> Calendar
          </button>
        </div>
        {warnings}
        <RoutineBar
          habits={board.habits}
          onMessage={(result) => { setMessage(result); router.refresh(); }}
          onPlan={setSheetTask}
          phone={true}
          pickedId={picked?.id ?? null}
          taskFor={routineTask}
          timeZone={tz}
        />
        <section className="mb-[13px] flex items-center justify-between gap-2 rounded-[11px] border border-today-mint-line bg-today-mint px-2.5 py-[9px]">
          {opening ? (
            <>
              <div>
                <strong className="block text-[0.95rem] tracking-[-0.02em] text-today-mint-ink">Next free · {spanLabel(opening.start, opening.end, tz)}</strong>
                <p className="mt-0.5 text-[0.72rem] text-today-mint-ink/80">{opening.limit ?? "Unscheduled time"}</p>
              </div>
              <span className="whitespace-nowrap rounded-full border border-today-mint-line bg-card/70 px-[7px] py-1 text-[0.72rem] font-bold text-today-mint-ink">{opening.minutes} min</span>
            </>
          ) : (
            <strong className="text-[0.95rem] text-today-mint-ink">{isTodayView ? "No open blocks left today" : "Open time is shown for today"}</strong>
          )}
        </section>
        <div className="mx-px mb-1 flex items-center justify-between">
          <h2 className="text-[0.85rem] font-bold">Pinned projects</h2>
          {shelf.length > 2 && <span className="text-[0.7rem] text-muted-foreground">Swipe for more</span>}
        </div>
        <div aria-label="Pinned projects" className="-mx-4 mb-2 flex items-center gap-1.5 overflow-x-auto px-4 pb-[7px] pt-0.5 [scrollbar-width:thin]">
          {shelf.map((project) => {
            const on = phoneSelected?.id === project.id;
            return (
              <button aria-pressed={on} className={`inline-flex min-h-[42px] flex-none items-center gap-1.5 whitespace-nowrap rounded-[9px] border px-2.5 py-[5px] text-[0.76rem] font-bold ${on ? "border-today-accent bg-today-accent-soft text-today-accent-ink" : "bg-card"}`} key={project.id} onClick={() => setPhoneProject(project.id)} type="button">
                <span aria-hidden className="h-[7px] w-[7px] flex-none rounded-full" style={{ background: areaHex(project.areaSlug) }} />
                {project.name}
              </button>
            );
          })}
          {shelf.length === 0 && <p className="text-[0.8rem] text-muted-foreground">Nothing ready to book in any area.</p>}
        </div>
        {phoneSelected && (
          <section className="mb-2.5 overflow-hidden rounded-[11px] border bg-card">
            <header className="flex items-center justify-between gap-2 border-b px-2.5 py-2">
              <h2 className="text-[0.9rem] font-bold tracking-[-0.016em]">{phoneSelected.name}</h2>
              <span className="whitespace-nowrap rounded-full border border-today-accent-line bg-today-accent-soft px-[7px] py-1 text-[0.66rem] font-bold text-today-accent-ink">{phoneSelected.workOnly ? "Work hours only" : opening ? `${phoneFitting.length} of ${phonePool.length} fit` : `${phonePool.length} ready`}</span>
            </header>
            {phonePicks.length ? phonePicks.map(phoneAction) : <p className="m-0 p-[11px] text-[0.82rem] leading-[1.45] text-today-ink2">{phonePool.length ? "Nothing here fits the next block; see the others below." : "Nothing left to schedule here."}</p>}
            {phoneRest.length > 0 && (
              <details className="px-2.5">
                <summary className="min-h-[43px] cursor-pointer text-[0.75rem] font-bold leading-[43px] text-today-accent-ink">See {phoneRest.length} other {phoneRest.length === 1 ? "action" : "actions"}</summary>
                <div className="-mx-2.5">{phoneRest.map(phoneAction)}</div>
              </details>
            )}
          </section>
        )}
        <section aria-labelledby="today-calendar-title" className="scroll-mt-16 overflow-hidden rounded-[11px] border bg-card focus:outline-none" id="today-calendar" tabIndex={-1}>
          <header className="flex items-center justify-between gap-2 border-b px-2.5 py-[11px]">
            <h2 className="whitespace-nowrap text-base font-bold" id="today-calendar-title">{calendarTitle}</h2>
            <div className="flex flex-wrap justify-end gap-1">
              <span className="rounded-full border border-today-mint-line bg-today-mint px-[7px] py-1 text-[0.72rem] max-[380px]:text-[0.62rem] whitespace-nowrap font-bold text-today-mint-ink">{fmtLength(load.freeMin)} open</span>
              <span className="rounded-full border border-today-accent-line bg-muted px-[7px] py-1 text-[0.72rem] max-[380px]:text-[0.62rem] whitespace-nowrap font-bold text-today-ink2">15-min grid</span>
            </div>
          </header>
          {earlierFold}
          {grid(true)}
          <p className="px-2.5 pb-2.5 pt-px text-[0.76rem] leading-[1.4] text-muted-foreground">Use <strong>Plan</strong> above to book a task into an open slot.</p>
        </section>
      </div>

      {/* ——— Desktop and tablet: Project shelf ——— */}
      <div className="hidden md:block">
        <header className="mb-[18px] flex flex-wrap items-center justify-between gap-[18px]">
          <div>
            <p className="mb-1 text-[0.73rem] font-bold uppercase tracking-[0.12em] text-today-accent">{eyebrow}</p>
            <h1 className="text-[clamp(1.9rem,3vw,2.5rem)] font-bold leading-[1.12] tracking-[-0.055em]">{heading}</h1>
            <p className="mt-1.5 text-[0.92rem] leading-normal text-muted-foreground">
              <strong className="text-foreground">{fmtLength(load.freeMin)} open</strong>
              {opening ? <> · Next free {spanLabel(opening.start, opening.end, tz)}</> : isTodayView ? " · No open personal time left today" : ""}
              {load.dueCount > 0 && <> · <span className="font-semibold text-destructive">{load.dueCount} due</span></>}
            </p>
            {warnings}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className={buttonStyles.primary} disabled={previewing} onClick={openPreview} type="button">✦ {previewing ? "Planning…" : previewLabel}</button>
            <Link className={buttonStyles.base} href="/plan/wrap-up" title="Evening wrap-up: close today and plan tomorrow">Wrap up</Link>
            <nav aria-label="Days shown" className="flex rounded-lg border bg-card p-0.5 text-[0.8rem]">
              {(["day", "3", "week"] as const).map((option) => (
                <Link aria-current={option === view ? "page" : undefined} className={`rounded-md px-2.5 py-1 font-semibold ${option === view ? "bg-today-accent-soft text-today-accent-ink" : "text-muted-foreground hover:text-foreground"}`} href={viewHref(option, dateKey(first, tz))} key={option}>
                  {option === "day" ? "Day" : option === "3" ? "3 days" : "Week"}
                </Link>
              ))}
            </nav>
            <div className="flex items-center rounded-lg border bg-card p-0.5 text-[0.8rem]">
              <Link aria-label="Earlier" className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted" href={viewHref(view, shift(-step))}>‹</Link>
              <Link className="rounded-md px-2 py-1 font-semibold hover:bg-muted" href={viewHref(view)}>Today</Link>
              <Link aria-label="Later" className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted" href={viewHref(view, shift(step))}>›</Link>
            </div>
          </div>
        </header>

        <RoutineBar
          habits={board.habits}
          onMessage={(result) => { setMessage(result); router.refresh(); }}
          onPlan={(task) => setPicked((current) => (current?.id === task.id ? null : task))}
          phone={false}
          pickedId={picked?.id ?? null}
          taskFor={routineTask}
          timeZone={tz}
        />
        <ProjectShelf mode={mode} onMode={setMode} onSelect={setFilter} selected={filter} shelf={shelf} />
        {mode === "shelf" ? (
          <ActionTray board={board} onAll={() => setFilter("all")} onPlan={(task) => setPicked((current) => (current?.id === task.id ? null : task))} project={shelfProject} ready={trayReady} selectedTask={picked?.id ?? null} />
        ) : (
          <FocusTray board={board} fits={fits} onAll={() => setFilter("all")} onPlan={(task) => setPicked((current) => (current?.id === task.id ? null : task))} opening={opening} project={shelfProject} ready={trayReady} selectedTask={picked?.id ?? null} />
        )}

        <div className={view === "day" ? "grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(220px,26%)]" : "grid gap-3"}>
          <section aria-label={calendarTitle} className="min-w-0 overflow-hidden rounded-[14px] border bg-card shadow-[0_3px_12px_#1f315409]">
            <div className="flex items-center justify-between gap-2.5 border-b px-4 py-3.5">
              <h2 className="text-[1.03rem] font-bold tracking-[-0.022em]">{calendarTitle}</h2>
              <div className="flex flex-wrap items-center gap-[7px]">
                <span className={pills.live}>{fmtLength(load.freeMin)} open</span>
                <span className={pills.plain}>15-min increments</span>
              </div>
            </div>
            {earlierFold}
            {picked && (
              <div className="mx-[13px] mt-2 flex flex-wrap items-center gap-[7px] rounded-lg bg-today-accent-soft px-2 py-1.5 text-[0.8rem] text-today-accent-ink" role="status">
                <strong title={picked.title}>{shortTitle(picked.title, 60)}</strong>
                <span>Select a highlighted time or use the next opening.</span>
                <button className={`${buttonStyles.small} ml-auto`} disabled={pending} onClick={() => { const at = nextStart(picked); if (at === null) setMessage({ ok: false, message: "No open slot today or tomorrow is long enough." }); else book(picked, at, picked.minutes); }} type="button">Next opening</button>
                <button className={buttonStyles.ghost} onClick={() => setPicked(null)} type="button">Cancel</button>
              </div>
            )}
            {preview && (
              <PreviewPanel
                onBook={bookPreview}
                onCancel={() => setPreview(null)}
                onToggle={(taskId) => setSkip((current) => { const next = new Set(current); if (next.has(taskId)) next.delete(taskId); else next.add(taskId); return next; })}
                pending={pending}
                preview={preview}
                skip={skip}
                timeZone={tz}
              />
            )}
            <div className={view === "day" ? "max-h-[min(720px,calc(100vh-10rem))] overflow-y-auto" : "max-h-[calc(100vh-8rem)] overflow-y-auto"}>{grid(false)}</div>
            <p className="mx-3.5 mb-2.5 text-[0.75rem] text-muted-foreground">
              Drag to a time or choose Plan to book without dragging.
              {optionalToday.length > 0 && (board.availability.optionalBlocks ? " Optional events are set to block time." : ` Optional events don't block time (${optionalToday.map((meeting) => `${meeting.title} ${clock(meeting.start, tz)}`).join(", ")}).`)}
            </p>
          </section>

          <aside
            aria-label="Commitments and inbox"
            className={view === "day" ? "grid min-w-0 gap-2.5" : "grid min-w-0 gap-2.5 md:grid-cols-2 xl:grid-cols-3"}
            onDragOver={(event) => { if (event.dataTransfer.types.includes(DRAG_TYPE)) event.preventDefault(); }}
            onDrop={(event) => {
              const payload = readPayload(event);
              if (payload?.mode === "block") { event.preventDefault(); unschedule(payload.taskId); }
            }}
          >
            <RailCard badge={<span className={pills.plain}>{commitments.length}</span>} title="Your commitments">
              {commitments.length ? (
                <ul className="grid gap-2">
                  {commitments.map((item) => (
                    <li className="flex items-start gap-[7px]" key={item.key}>
                      <span aria-hidden className="mt-[5px] h-[9px] w-[9px] shrink-0 rounded-full" style={{ background: item.slug ? areaHex(item.slug) : "hsl(var(--t-protected-line))" }} />
                      <div className="min-w-0">
                        <strong className="text-foreground">{clock(new Date(item.at).toISOString(), tz)}</strong>
                        {item.task ? (
                          <button className="block w-full truncate text-left text-[0.77rem] hover:text-foreground hover:underline" onClick={() => item.task && setScheduling(item.task)} title={item.title} type="button">{item.title}</button>
                        ) : (
                          <p className="truncate text-[0.77rem]" title={item.title}>{item.title}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Nothing booked yet today.</p>
              )}
            </RailCard>

            <RailCard badge={<span className={board.decisions.count ? pills.hot : pills.plain}>{board.decisions.count}</span>} title="Needs a decision">
              <p className="line-clamp-2" title={board.decisions.first ?? undefined}>{board.decisions.first ? shortTitle(board.decisions.first, 70) : board.decisions.count ? `${board.decisions.count} captured idea${board.decisions.count === 1 ? "" : "s"} to sort.` : "Inbox clear."}</p>
              <div className="mt-2"><Link className={buttonStyles.small} href="/inbox">Open inbox</Link></div>
            </RailCard>

            {missed.length > 0 && (
              <RailCard badge={<span className={pills.hot}>{missed.length}</span>} title="Missed today">
                <p className="text-[0.75rem]">Moving it keeps the task, its project, links and source.</p>
                <ul className="mt-1.5 grid gap-2">
                  {missed.map((task) => (
                    <li key={task.id}>
                      <p className="break-words font-medium text-foreground" title={task.title}>{shortTitle(task.title, 60)}</p>
                      <p className="text-[0.75rem]">Was {clock(task.start as string, tz)}–{clock(task.end as string, tz)}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <button className={buttonStyles.small} disabled={pending} onClick={() => { const at = nextStart(task); if (at === null) setMessage({ ok: false, message: "No open slot today or tomorrow is long enough." }); else book(task, at, Math.round((Date.parse(task.end as string) - Date.parse(task.start as string)) / MIN)); }} type="button">Next free slot</button>
                        <button className={buttonStyles.ghost} onClick={() => setScheduling(task)} type="button">Pick a time</button>
                        <button className={buttonStyles.ghost} disabled={pending} onClick={() => done(task.id)} type="button">Did it</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </RailCard>
            )}

            {board.preparing.length > 0 && (
              <RailCard badge={<span className={pills.plain}>{board.preparing.length}</span>} title="Agent preparing">
                <p className="text-[0.75rem]">Not ready to book until the agent finishes.</p>
                <ul className="mt-1.5 grid gap-2">
                  {board.preparing.map((task) => (
                    <li key={task.id}>
                      <p className="break-words font-medium text-foreground" title={task.title}>{shortTitle(task.title, 60)}</p>
                      <p className="text-[0.75rem]">{task.doing ? `${task.doing} · ` : ""}then {fmtLength(task.minutes)} for you</p>
                      <TaskLinks links={task.links} />
                      <button className={`${buttonStyles.ghost} mt-1`} disabled={pending} onClick={() => run(() => takeOverAction(task.id))} type="button">Take it over</button>
                    </li>
                  ))}
                </ul>
              </RailCard>
            )}

            <details className="rounded-[14px] border bg-card px-3 py-2.5 text-[0.8rem] text-muted-foreground">
              <summary className="cursor-pointer font-semibold text-foreground">What counts as open time</summary>
              <ul className="mt-1.5 space-y-1">
                {board.availability.sources.map((source) => (
                  <li key={source.label}><span className={source.ok ? "font-semibold text-foreground" : "font-semibold text-amber-700 dark:text-amber-300"}>{source.ok ? "✓" : "!"} {source.label}</span> {source.detail}</li>
                ))}
                {board.availability.protections.map((line) => (
                  <li key={line.label}><span className="font-semibold text-foreground">{line.label}</span> {line.detail}</li>
                ))}
              </ul>
            </details>

            <Fold count={mineTasks.length} title="All to-dos">
              <label className="sr-only" htmlFor="plan-search">Search to-dos</label>
              <input className="w-full rounded-xl border bg-background/60 px-3 py-2 text-sm placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" id="plan-search" onChange={(event) => setQuery(event.target.value)} placeholder="Search…" type="search" value={query} />
              <NewTaskButton label="+ New task" onDone={setMessage} targets={board.targets} timeZone={tz} variant="chip" />
              {mineAreas.map((area) => (
                <AreaList
                  area={area}
                  filtering={filtering}
                  key={area.id}
                  onDone={done}
                  onMessage={(result) => { setMessage(result); router.refresh(); }}
                  onOpenChange={(open) => setAreaOpen(`open:${area.slug}`, !open)}
                  onPick={(task) => setPicked((current) => (current?.id === task.id ? null : task))}
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
                      <TaskCard key={task.id} onDone={done} onMessage={(result) => { setMessage(result); router.refresh(); }} onPick={(item) => setPicked(item)} onSchedule={setScheduling} pickedId={picked?.id ?? null} task={withOverride(task)} timeZone={tz} />
                    ))}
                  </ul>
                </details>
              )}
            </Fold>

            <Fold count={checkins.length} title="App check-ins">
              {checkinGroups.length === 0 && <p className="rounded-xl border p-3 text-sm text-muted-foreground">All clear. Nothing from your apps.</p>}
              {checkinGroups.map((group) => (
                <CheckinGroup count={group.tasks.length} key={group.source} label={group.label} onMessage={(result) => { setMessage(result); router.refresh(); }} source={group.source} tool={board.tools.find((tool) => tool.key === group.source) ?? null}>
                  {group.tasks.map((task) => (
                    <CheckinCard key={task.id} onDone={done} onMessage={(result) => { setMessage(result); router.refresh(); }} onPick={(item) => setPicked(item)} onSchedule={setScheduling} pickedId={picked?.id ?? null} task={task} timeZone={tz} />
                  ))}
                </CheckinGroup>
              ))}
            </Fold>
          </aside>
        </div>
      </div>

      {message && (
        <div className={`fixed inset-x-3.5 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex items-start gap-2 rounded-[10px] px-3.5 py-2.5 text-[0.85rem] text-white shadow-[0_12px_22px_#13203940] md:inset-x-auto md:bottom-5 md:right-6 md:max-w-[410px] ${message.ok ? "bg-[#182c4b]" : "bg-destructive"}`} role="status">
          <span className="min-w-0 flex-1">{message.message}</span>
          <button aria-label="Dismiss" className="rounded px-1 text-white/80 hover:text-white" onClick={() => setMessage(null)} type="button">×</button>
        </div>
      )}
      {sheetTask && (
        <PlanSheet
          blocks={blocks}
          board={board}
          onClose={() => setSheetTask(null)}
          onConfirm={(start) => { const task = sheetTask; setSheetTask(null); book(task, start, task.minutes); }}
          pending={pending}
          task={sheetTask}
        />
      )}
      {scheduling && <ScheduleSheet blocks={blocks} board={board} onClose={() => setScheduling(null)} onDone={() => { done(scheduling.id); setScheduling(null); }} onPick={(start, minutes) => { const task = withOverride(scheduling); setScheduling(null); if (minutes === task.minutes) book(task, start.getTime(), minutes); else setLength(task, start, minutes); }} onUnschedule={() => { unschedule(scheduling.id); setScheduling(null); }} task={withOverride(scheduling)} />}
    </div>
  );
}

function RailCard({ title, badge, children }: { title: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-[14px] border bg-card shadow-[0_3px_12px_#1f315409]">
      <div className="flex items-center justify-between gap-2.5 border-b px-3 py-[11px]">
        <h2 className="text-[0.92rem] font-bold tracking-[-0.022em]">{title}</h2>
        {badge}
      </div>
      <div className="px-3 py-2.5 text-[0.84rem] leading-[1.45] text-muted-foreground">{children}</div>
    </section>
  );
}

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
    <details className="group rounded-[14px] border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-[0.86rem] font-bold [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">{title}<span className={pills.plain}>{count}</span></span>
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

// The proposed day, before anything is booked: untick what you don't want, then book the rest. Drawn inside the
// calendar card, with the drafts shown dashed on the grid.
function PreviewPanel({ preview, skip, pending, timeZone, onToggle, onBook, onCancel }: {
  preview: PreviewResult; skip: Set<string>; pending: boolean; timeZone: string;
  onToggle: (taskId: string) => void; onBook: () => void; onCancel: () => void;
}) {
  const kept = preview.items.filter((item) => !skip.has(item.taskId));
  const keptMinutes = kept.reduce((sum, item) => sum + (Date.parse(item.end) - Date.parse(item.start)) / MIN, 0);
  const line = (item: PreviewLine) => (
    <li key={item.taskId}>
      <label className="flex cursor-pointer items-center gap-[7px] py-1 text-[0.85rem]">
        <input checked={!skip.has(item.taskId)} className="h-4 w-4" onChange={() => onToggle(item.taskId)} type="checkbox" />
        <strong className="min-w-[67px] text-today-accent">{clock(item.start, timeZone)}</strong>
        <span className={`min-w-0 flex-1 ${skip.has(item.taskId) ? "text-muted-foreground" : ""}`} title={item.title}>
          {shortTitle(item.title)} · {Math.round((Date.parse(item.end) - Date.parse(item.start)) / MIN)} min <span className="text-[0.75rem] text-muted-foreground">· {item.reason}</span>
        </span>
      </label>
    </li>
  );
  const commits = preview.items.filter((item) => item.group === "COMMIT");
  const extras = preview.items.filter((item) => item.group === "EXTRA");
  return (
    <section aria-label="Draft plan" className="mx-3.5 mb-[5px] mt-2 rounded-[9px] border border-today-accent-line bg-today-track px-2.5 py-[9px]">
      <p className="text-[0.83rem] text-today-ink2"><strong>Draft plan</strong> · Nothing is booked yet.</p>
      {!preview.calendarKnown && <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">Google Calendar couldn&apos;t be read; check for meetings before booking.</p>}
      {preview.items.length === 0 && <p className="mt-1 text-[0.83rem] text-muted-foreground">{preview.message}</p>}
      {commits.length > 0 && <ul className="mt-1">{commits.map(line)}</ul>}
      {extras.length > 0 && (
        <>
          <p className="mt-1.5 text-[0.7rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">If there&apos;s time · unticked</p>
          <ul>{extras.map(line)}</ul>
        </>
      )}
      {preview.unplaced.length > 0 && (
        <details className="mt-1 text-[0.75rem]">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">{preview.unplaced.length} didn&apos;t fit</summary>
          <ul className="mt-1 space-y-0.5">
            {preview.unplaced.map((item) => <li key={item.title}><span className="font-medium" title={item.title}>{shortTitle(item.title, 48)}</span> <span className="text-muted-foreground">· {item.reason}</span></li>)}
          </ul>
        </details>
      )}
      <p className="mt-1 text-[0.75rem] text-muted-foreground">{fmtLength(Math.round(keptMinutes))} picked; {preview.bufferMinutes} min stays free for interruptions.</p>
      <div className="mt-[7px] flex flex-wrap gap-2">
        <button className={`${buttonStyles.primary} min-h-7 px-2 py-1 text-[0.79rem]`} disabled={pending || kept.length === 0} onClick={onBook} type="button">Book selected ({kept.length})</button>
        <button className={buttonStyles.small} onClick={onCancel} type="button">Cancel preview</button>
      </div>
    </section>
  );
}

const NO_QUICK = new Set<QuickFilter>();

const dragProps = (task: BoardTask) => ({
  draggable: true,
  onDragStart: (event: React.DragEvent) => {
    event.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ taskId: task.id, minutes: task.minutes, mode: task.start ? "block" : "task", grabMin: 0 } satisfies DragPayload));
    event.dataTransfer.effectAllowed = "move";
  }
});

// Today's routines as a bar across the top of Today: one chip each with a tick, its length or booked time and
// weekly progress, and Plan (desktop: pick a time on the calendar or drag the chip; phone: the time sheet).
function RoutineBar({ habits, taskFor, timeZone, phone, pickedId, onPlan, onMessage }: {
  habits: Habit[]; taskFor: (habit: Habit) => BoardTask | null; timeZone: string; phone: boolean; pickedId: string | null; onPlan: (task: BoardTask) => void; onMessage: (result: PlanMessage) => void;
}) {
  const today = habits.filter((habit) => habit.todayTaskId);
  if (habits.length === 0) {
    return <Link className="mb-3 block rounded-[11px] border border-dashed px-3 py-2.5 text-[0.82rem] text-muted-foreground hover:bg-muted" href="/plan/routines">+ Add routines (eBay listing, sourcing, workouts…)</Link>;
  }
  const doneCount = today.filter((habit) => habit.done).length;
  const id = `routines-${phone ? "phone" : "desk"}`;
  return (
    <section aria-labelledby={id} className={`${phone ? "mb-[11px] rounded-[11px]" : "mb-3 rounded-[14px] shadow-[0_3px_12px_#1f315409]"} border bg-card px-3 py-2.5`}>
      <header className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[0.9rem] font-bold tracking-[-0.016em]" id={id}>
          Today&apos;s routines <span className="font-medium text-muted-foreground">· {today.length ? `${doneCount} of ${today.length} done` : "none today"}</span>
        </h2>
        <Link className="rounded-md px-1.5 py-1 text-[0.76rem] font-semibold text-today-accent-ink hover:bg-muted" href="/plan/routines">Edit</Link>
      </header>
      {today.length > 0 && (
        <ul className={phone ? "-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:thin]" : "flex flex-wrap gap-2"}>
          {today.map((habit) => <RoutineChip habit={habit} key={habit.routineId} onMessage={onMessage} onPlan={onPlan} phone={phone} pickedId={pickedId} task={taskFor(habit)} timeZone={timeZone} />)}
        </ul>
      )}
    </section>
  );
}

function RoutineChip({ habit, task, timeZone, phone, pickedId, onPlan, onMessage }: {
  habit: Habit; task: BoardTask | null; timeZone: string; phone: boolean; pickedId: string | null; onPlan: (task: BoardTask) => void; onMessage: (result: PlanMessage) => void;
}) {
  const [pending, startTransition] = useTransition();
  const booked = task?.start ? clock(task.start, timeZone) : null;
  const canPlan = Boolean(task && !habit.done && !task.start);
  const progress = habit.week.target > 0 ? `${habit.week.done}/${habit.week.target} this week` : habit.streak > 1 ? `${habit.streak}-day streak` : null;
  const detail = [habit.done ? "Done" : booked ? `At ${booked}` : fmtLength(habit.minutes), progress].filter(Boolean).join(" · ");
  return (
    <li
      className={`flex flex-none items-center gap-1.5 rounded-[10px] border p-1 pr-1.5 ${habit.done ? "bg-muted/60" : "bg-card"} ${canPlan && !phone ? "cursor-grab active:cursor-grabbing" : ""} ${task && pickedId === task.id ? "ring-2 ring-today-accent" : ""}`}
      style={{ borderLeft: `3px solid ${areaHex(habit.areaSlug)}` }}
      {...(task && canPlan && !phone ? dragProps(task) : {})}
    >
      <button
        aria-label={habit.done ? `Undo: ${habit.title}` : `Done: ${habit.title}`}
        aria-pressed={habit.done}
        className={`flex flex-none items-center justify-center rounded-full ${phone ? "h-11 w-9" : "h-8 w-8"} focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-today-accent/50`}
        disabled={pending}
        onClick={() => startTransition(async () => onMessage(await habitDoneAction(habit.todayTaskId as string, !habit.done)))}
        type="button"
      >
        <span aria-hidden className={`flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] ${habit.done ? "border-today-accent bg-today-accent text-white" : "border-muted-foreground/40 text-transparent hover:border-today-accent hover:text-today-accent"}`}>✓</span>
      </button>
      <div className="min-w-0">
        <p className={`whitespace-nowrap text-[0.82rem] font-semibold leading-tight ${habit.done ? "text-muted-foreground line-through" : ""}`}>{habit.title}</p>
        <p className="mt-0.5 whitespace-nowrap text-[0.7rem] text-muted-foreground">{detail}</p>
      </div>
      {canPlan && task && (
        <button aria-label={`Plan ${habit.title}`} className={`${phone ? "min-h-11" : "min-h-8"} ml-1 flex-none rounded-lg border border-today-accent-line bg-today-accent-soft px-2.5 py-1 text-[0.78rem] font-bold text-today-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-today-accent/50`} onClick={() => onPlan(task)} type="button">Plan</button>
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
