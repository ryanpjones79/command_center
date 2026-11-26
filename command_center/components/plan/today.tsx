"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Board, BoardTask, ShelfProject } from "@/server/v2/board";
import { areaHex } from "@/lib/v2/area-look";
import { shortTitle } from "@/lib/v2/short-title";
import { blockingEvents, respectsWorkHours } from "@/lib/v2/availability";
import { gridWindow, reasonFor, startsFor, type Opening } from "@/lib/v2/today";

// Plan/Today building blocks (2026-11-25 redesign, references in the Claude handoff): the pinned project shelf,
// the next-action tray, action cards, the time grid, and the phone's time-picker sheet. All of them read the live
// board; every booking goes through the parent's handlers, which call the server scheduler (bookSlot) that
// rechecks the slot before writing.

export const DRAG_TYPE = "application/x-ryanos-task";
export type DragPayload = { taskId: string; minutes: number; mode: "task" | "block"; grabMin: number };
export type GhostBlock = { taskId: string; title: string; start: string; end: string; areaSlug: string; off: boolean };

const MIN = 60_000;
const SNAP = 15;

export function minutesInZone(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}
export const clockAt = (ms: number | string, timeZone: string) => new Date(ms).toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
const bare = (ms: number | string, timeZone: string) => clockAt(ms, timeZone).replace(/ [AP]M$/, "");
export const spanLabel = (ms1: number | string, ms2: number | string, timeZone: string) => `${bare(ms1, timeZone)}–${clockAt(ms2, timeZone)}`;
export const lengthLabel = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}` : `${minutes}m`);
const minuteLabel = (minute: number) => new Date(Date.UTC(2000, 0, 1, 0, minute)).toLocaleTimeString("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit" });
const tint = (hex: string, pct: number) => `color-mix(in srgb, ${hex} ${pct}%, hsl(var(--card)))`;

function readPayload(event: React.DragEvent): DragPayload | null {
  try {
    const raw = event.dataTransfer.getData(DRAG_TYPE);
    return raw ? (JSON.parse(raw) as DragPayload) : null;
  } catch {
    return null;
  }
}

const btn = "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border font-semibold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-today-accent/50 disabled:cursor-default disabled:opacity-60";
export const buttonStyles = {
  base: `${btn} border-border bg-card px-3 py-2 text-[0.85rem] text-today-ink2 hover:bg-today-accent-soft min-h-9`,
  primary: `${btn} border-today-accent bg-today-accent px-3 py-2 text-[0.85rem] text-white hover:opacity-90 min-h-9 dark:text-[hsl(230_40%_8%)]`,
  small: `${btn} border-border bg-card px-2 py-1 text-[0.79rem] text-today-ink2 hover:bg-today-accent-soft min-h-7`,
  ghost: `${btn} border-transparent bg-transparent px-2 py-1 text-[0.79rem] text-today-ink2 hover:bg-today-accent-soft min-h-7`
};
export const pill = "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-[7px] py-[3px] text-[0.75rem] font-semibold";
export const pills = {
  plain: `${pill} bg-muted text-today-ink2`,
  live: `${pill} bg-today-mint text-today-mint-ink`,
  blue: `${pill} bg-today-accent-soft text-today-accent-ink`,
  hot: `${pill} bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300`
};

// ——— Shelf ———

export function ProjectShelf({ shelf, selected, onSelect, mode, onMode }: {
  shelf: ShelfProject[]; selected: string; onSelect: (id: string) => void; mode: "shelf" | "focus"; onMode: (mode: "shelf" | "focus") => void;
}) {
  const shown = shelf.slice(0, 8);
  return (
    <section aria-label="Projects" className="mb-3.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2.5">
        <h2 className="text-[0.96rem] font-bold tracking-[-0.01em]">Pinned projects</h2>
        <div className="flex items-center gap-3">
          <p className="hidden text-[0.8rem] text-muted-foreground xl:block">{mode === "shelf" ? "Choose a project area; its actions due soonest come first." : "Start with the time you have and only the work that fits."}</p>
          <div aria-label="Planning mode" className="flex rounded-lg border bg-card p-0.5" role="group">
            {(["shelf", "focus"] as const).map((option) => (
              <button aria-pressed={mode === option} className={`rounded-md px-2.5 py-1 text-[0.79rem] font-semibold ${mode === option ? "bg-today-accent-soft text-today-accent-ink" : "text-muted-foreground hover:text-foreground"}`} key={option} onClick={() => onMode(option)} type="button">
                {option === "shelf" ? "Project shelf" : "Next free block"}
              </button>
            ))}
          </div>
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="rounded-xl border bg-card p-3 text-sm text-muted-foreground">Nothing ready to book in any area. Add a task from Projects.</p>
      ) : (
        <div className="grid gap-[7px]" style={{ gridTemplateColumns: `repeat(${Math.max(3, shown.length)}, minmax(0, 1fr))` }}>
          {shown.map((project) => {
            const hex = areaHex(project.areaSlug);
            const on = selected === project.id;
            return (
              <button
                aria-pressed={on}
                className="flex min-h-[71px] min-w-0 flex-col items-start justify-between gap-1.5 rounded-[10px] border bg-card px-2.5 py-[9px] text-left shadow-[0_3px_12px_#1f315409] transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-today-accent/50"
                key={project.id}
                onClick={() => onSelect(on ? "all" : project.id)}
                style={on ? { borderColor: hex, background: tint(hex, 12), boxShadow: `inset 0 -2px ${hex}` } : undefined}
                title={`${project.name} · ${project.areaName}`}
                type="button"
              >
                <strong className="flex min-w-0 items-start gap-[7px] text-[0.81rem] leading-tight">
                  <span aria-hidden className="mt-1 h-[9px] w-[9px] shrink-0 rounded-full" style={{ background: hex }} />
                  <span className="line-clamp-2 break-words">{project.name}</span>
                </strong>
                <small className="text-[0.74rem] text-muted-foreground">{project.workOnly ? `${project.ready} ready · work hours` : `${project.ready} ready`}</small>
              </button>
            );
          })}
        </div>
      )}
      {shelf.length > shown.length && <p className="mt-1.5 text-[0.75rem] text-muted-foreground">{shelf.length - shown.length} more under <a className="underline underline-offset-2" href="/projects">Projects</a>.</p>}
    </section>
  );
}

// ——— Action cards ———

export function ActionCard({ task, board, showProject, selected, onPlan, reason }: { task: BoardTask; board: Board; showProject: boolean; selected: boolean; onPlan: (task: BoardTask) => void; reason?: string }) {
  const hex = areaHex(task.areaSlug);
  const draft = task.links.find((link) => link.kind === "draft");
  const source = task.links.find((link) => link.kind === "source");
  return (
    <article
      aria-selected={selected}
      className={`flex min-w-0 cursor-grab items-start gap-1.5 rounded-[9px] border border-l-[3px] bg-today-track p-2 active:cursor-grabbing ${selected ? "outline outline-2 -outline-offset-2 outline-today-accent" : ""}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ taskId: task.id, minutes: task.minutes, mode: "task", grabMin: 0 } satisfies DragPayload));
        event.dataTransfer.effectAllowed = "move";
      }}
      style={{ borderLeftColor: hex }}
    >
      <span aria-hidden className="pt-0.5 text-[#637491] max-[1160px]:hidden">
        <svg fill="none" height="15" stroke="currentColor" strokeLinecap="round" strokeWidth="4" viewBox="0 0 24 24" width="15"><path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01" /></svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="mb-1 mt-px break-words text-[0.88rem] font-bold leading-tight" title={task.title}>{shortTitle(task.title)}</p>
        <div className="flex flex-wrap items-center gap-x-[7px] gap-y-1 text-[0.75rem] leading-snug text-muted-foreground">
          <strong className="text-today-ink2">{task.minutes} min</strong>
          <span>{reason ?? reasonFor(task, board.timeZone, board.now)}</span>
          {showProject && <span>· {task.projectName ?? task.areaName}</span>}
        </div>
        {(draft || source) && (
          <p className="mt-1 flex flex-wrap gap-x-2 text-[0.72rem]">
            {draft && <a className="font-semibold text-today-accent underline-offset-2 hover:underline" href={draft.url} title={draft.title} {...(/^https:/i.test(draft.url) ? { target: "_blank", rel: "noopener noreferrer" } : {})}>Draft ↗</a>}
            {source && <a className="text-muted-foreground underline-offset-2 hover:underline" href={source.url} title={source.title} {...(/^https:/i.test(source.url) ? { target: "_blank", rel: "noopener noreferrer" } : {})}>Source ↗</a>}
            <a className="text-muted-foreground underline-offset-2 hover:underline" href={task.href} {...(task.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>Details</a>
          </p>
        )}
      </div>
      <button aria-label={`Schedule ${task.title}`} aria-pressed={selected} className={`${buttonStyles.small} ml-auto px-[7px]`} onClick={() => onPlan(task)} type="button">{selected ? "Selected" : "Plan"}</button>
    </article>
  );
}

// The tray under the shelf: top priorities across projects, or the selected project's top three, with the rest a
// click away. Never navigates.
export function ActionTray({ board, ready, project, selectedTask, onPlan, onAll, reasons = {}, add }: {
  board: Board; ready: BoardTask[]; project: ShelfProject | null; selectedTask: string | null; onPlan: (task: BoardTask) => void; onAll: () => void; reasons?: Record<string, string>; add?: React.ReactNode;
}) {
  const [showAll, setShowAll] = useState(false);
  useEffect(() => setShowAll(false), [project?.id]);
  const items = showAll ? ready : ready.slice(0, 3);
  return (
    <section className="mb-3.5 rounded-[14px] border bg-card shadow-[0_3px_12px_#1f315409]">
      <div className="flex items-center justify-between gap-2.5 border-b px-3.5 py-2.5">
        <h2 className="text-[1.03rem] font-bold tracking-[-0.022em]">{project ? `${project.name} · next actions` : "Top priorities across projects"}</h2>
        <div className="flex flex-wrap items-center gap-[7px]">
          {add}
          <button aria-pressed={!project} className={buttonStyles.ghost} onClick={onAll} type="button">All priorities</button>
          <span className={pills.blue}>{ready.length} ready</span>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 p-[9px] md:grid-cols-2 lg:grid-cols-3">
        {items.length ? items.map((task) => <ActionCard board={board} key={task.id} onPlan={onPlan} selected={selectedTask === task.id} reason={reasons[task.id]} showProject task={task} />) : <p className="p-3 text-[0.9rem] text-muted-foreground">{project ? "No unscheduled actions in this area." : "Nothing ready to book. Agent-prepared work appears here once it's ready."}</p>}
      </div>
      {ready.length > 3 && (
        <p className="border-t px-3.5 py-2 text-[0.8rem] text-muted-foreground">
          {showAll ? "Showing all " : `${ready.length - 3} more ${project ? `in ${project.name}` : "ready"} · `}
          <button className={buttonStyles.ghost} onClick={() => setShowAll((value) => !value)} type="button">{showAll ? "Show top 3" : `View all ${ready.length} actions`}</button>
        </p>
      )}
    </section>
  );
}

// Secondary mode: start from the next opening and offer only what fits it; longer work stays one click away.
export function FocusTray({ board, ready, project, opening, fits, selectedTask, onPlan, onAll, reasons = {}, add }: {
  board: Board; ready: BoardTask[]; project: ShelfProject | null; opening: Opening | null; fits: (task: BoardTask) => boolean; selectedTask: string | null; onPlan: (task: BoardTask) => void; onAll: () => void; reasons?: Record<string, string>; add?: React.ReactNode;
}) {
  const tz = board.timeZone;
  const fitting = ready.filter(fits);
  const later = ready.filter((task) => !fits(task));
  return (
    <section aria-label="Next free block" className="mb-3.5 grid gap-2.5 lg:grid-cols-[minmax(180px,0.65fr)_minmax(0,2fr)]">
      <div className="grid content-center gap-1 rounded-xl border border-today-mint-line bg-today-mint p-[13px] text-today-mint-ink">
        <span className="text-[0.71rem] font-extrabold tracking-[0.08em]">NEXT FREE BLOCK</span>
        <strong className="text-[1.32rem] tracking-[-0.04em]">{opening ? spanLabel(opening.start, opening.end, tz) : "No open blocks"}</strong>
        <span className="text-[0.8rem]">{opening ? `${lengthLabel(opening.minutes)} available${opening.limit ? ` · ${opening.limit.charAt(0).toLowerCase()}${opening.limit.slice(1)}` : ""}` : "Unschedule something to make room."}</span>
      </div>
      <div className="rounded-[14px] border bg-card shadow-[0_3px_12px_#1f315409]">
        <div className="flex items-center justify-between gap-2.5 border-b px-3.5 py-2.5">
          <h2 className="text-[1.03rem] font-bold tracking-[-0.022em]">{project ? `${project.name} · what fits` : "What fits this block"}</h2>
          <div className="flex items-center gap-[7px]">
            {add}
            <button className={buttonStyles.ghost} onClick={onAll} type="button">All priorities</button>
            {ready.length > 0 && <span className={pills.blue}>{fitting.length} of {ready.length} fit</span>}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 p-[9px] md:grid-cols-2 lg:grid-cols-3">
          {fitting.length ? fitting.slice(0, 3).map((task) => <ActionCard board={board} key={task.id} onPlan={onPlan} selected={selectedTask === task.id} reason={reasons[task.id]} showProject task={task} />) : <p className="p-3 text-[0.9rem] text-muted-foreground">No actions from this selection fit the next block.</p>}
        </div>
        {fitting.length > 1 && <p className="border-t px-3.5 py-2 text-[0.8rem] text-muted-foreground">Options for this block. As you book a task, suggestions update to fit the time left.</p>}
        {later.length > 0 && (
          <details className="border-t px-3 py-2">
            <summary className="cursor-pointer text-[0.8rem] font-bold text-today-ink2">{later.length} {later.length === 1 ? "action needs" : "actions need"} a longer block</summary>
            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
              {later.map((task) => <ActionCard board={board} key={task.id} onPlan={onPlan} selected={selectedTask === task.id} reason={reasons[task.id]} showProject task={task} />)}
            </div>
          </details>
        )}
      </div>
    </section>
  );
}

// ——— Time grid ———

type GridProps = {
  board: Board; days: string[]; blocks: BoardTask[]; allTasks: Map<string, BoardTask>; phone: boolean; expanded: boolean;
  picked: BoardTask | null; preview: GhostBlock[]; onBook: (task: BoardTask, start: number, minutes: number) => void;
  onResize: (task: BoardTask, minutes: number) => void; onOpenBlock: (task: BoardTask) => void;
};

// Labels every 30 minutes, a line every 15; block position and height follow the real start and length. Busy
// meetings, work hours and protected blocks are muted; RyanOS blocks carry their area colour; optional events
// sit at the side and don't block. Drag a ready card or a block onto a free slot, or (after Plan) click a
// highlighted slot. Every drop or click goes to the server scheduler, which rechecks the slot.
export function TimeGrid({ board, days, blocks, allTasks, phone, expanded, picked, preview, onBook, onResize, onOpenBlock }: GridProps) {
  const tz = board.timeZone;
  const minuteOf = (iso: string) => minutesInZone(iso, tz);
  const windows = days.map((day) => gridWindow(board, blocks, day, minuteOf, expanded || days.length > 1));
  const start = Math.min(...windows.map((window) => window.start));
  const end = Math.max(...windows.map((window) => window.end));
  const pxm = phone ? 1.73 : 1.67;
  const height = (end - start) * pxm;
  const pos = (minute: number) => (minute - start) * pxm;
  const [hover, setHover] = useState<{ day: number; minute: number } | null>(null);
  const [resize, setResize] = useState<{ taskId: string; endMin: number } | null>(null);
  const firstTarget = useRef<HTMLButtonElement | null>(null);
  const nowMin = minuteOf(board.now);
  const todayIso = board.soonDays[0];
  const blocking = blockingEvents(board.meetings, board.availability.optionalBlocks);

  const pickedStarts = useMemo(() => new Map(days.map((day) => [day, new Set(picked ? startsFor(board, blocks, picked, day) : [])])), [board, blocks, picked, days]);
  useEffect(() => { if (picked) firstTarget.current?.focus({ preventScroll: true }); }, [picked]);

  const inDay = (iso: string, day: string) => Date.parse(iso) >= Date.parse(day) && Date.parse(iso) < Date.parse(day) + 86_400_000;
  const clip = (from: number, to: number) => ({ top: pos(Math.max(from, start)), height: Math.max(0, (Math.min(to, end) - Math.max(from, start)) * pxm) });
  // Blocks sit 1px inside their slot so back-to-back blocks stay visibly separate (as in the reference).
  const inset = (from: number, to: number) => { const box = clip(from, to); return { top: box.top + 1, height: Math.max(12, box.height - 2) }; };
  const labels = Array.from({ length: Math.floor((end - start) / 30) + 1 }, (_, index) => start + index * 30);
  const lines = Array.from({ length: Math.max(0, Math.floor((end - start) / 15) - 1) }, (_, index) => start + (index + 1) * 15);

  return (
    <div className={phone ? "grid grid-cols-[59px_minmax(0,1fr)] gap-x-1 pb-2 pl-[5px] pr-2 pt-3 max-[350px]:grid-cols-[52px_minmax(0,1fr)]" : "grid grid-cols-[72px_minmax(0,1fr)] gap-x-2 px-3.5 pb-3.5 pt-2.5"}>
      {days.length > 1 && (
        <>
          <div />
          <div className="mb-1.5 grid gap-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
            {days.map((day) => (
              <p className={`text-center text-[0.75rem] font-semibold ${day === todayIso ? "text-today-accent" : "text-muted-foreground"}`} key={day}>{new Date(day).toLocaleDateString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" })}</p>
            ))}
          </div>
        </>
      )}
      <div aria-hidden className="relative" style={{ height }}>
        {labels.map((minute) => (
          <span className={`absolute right-[5px] -translate-y-1/2 whitespace-nowrap font-semibold tabular-nums text-today-ink2 ${phone ? "right-0.5 text-[0.7rem]" : "text-[0.75rem]"}`} key={minute} style={{ top: pos(minute) }}>{minuteLabel(minute)}</span>
        ))}
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
        {days.map((day, dayIndex) => {
          const dayBlocks = blocks.filter((task) => inDay(task.start as string, day));
          const dayMeetings = board.meetings.filter((meeting) => inDay(meeting.start, day));
          const work = board.availability.work.filter((window) => inDay(window.start, day));
          const starts = pickedStarts.get(day) ?? new Set<number>();
          let targetGiven = false;
          return (
            <div
              aria-label={`Time grid for ${new Date(day).toLocaleDateString("en-US", { timeZone: tz, weekday: "long", month: "short", day: "numeric" })}, ${minuteLabel(start)} to ${minuteLabel(end)}`}
              className="relative overflow-hidden rounded-[9px] border border-today-track-line bg-today-track"
              key={day}
              onDragLeave={() => setHover(null)}
              onDragOver={(event) => {
                if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
                event.preventDefault();
                const minute = Math.floor((start + (event.clientY - event.currentTarget.getBoundingClientRect().top) / pxm) / SNAP) * SNAP;
                if (hover?.day === dayIndex && hover.minute === minute) return;
                setHover({ day: dayIndex, minute });
              }}
              onDrop={(event) => {
                const payload = readPayload(event);
                setHover(null);
                if (!payload) return;
                event.preventDefault();
                const task = allTasks.get(payload.taskId);
                if (!task) return;
                const pointer = start + (event.clientY - event.currentTarget.getBoundingClientRect().top) / pxm;
                const minute = payload.grabMin ? Math.round((pointer - payload.grabMin) / SNAP) * SNAP : Math.floor(pointer / SNAP) * SNAP;
                onBook(task, Date.parse(day) + Math.max(0, minute) * MIN, payload.minutes);
              }}
              role="group"
              style={{ height }}
            >
              {lines.map((minute) => (
                <span aria-hidden className={`pointer-events-none absolute inset-x-0 border-t ${(minute - start) % 30 === 0 ? "border-solid border-today-tick-major" : "border-dashed border-today-tick"}`} key={minute} style={{ top: pos(minute) }} />
              ))}
              {work.map((window) => {
                const from = minuteOf(window.start);
                const to = Date.parse(window.end) - Date.parse(day) >= 86_400_000 ? 24 * 60 : minuteOf(window.end);
                if (to <= start || from >= end) return null;
                return <FixedBlock key={`work-${window.start}`} label={spanLabel(window.start, window.end, tz)} phone={phone} style={clip(from, to)} title="Protected work" />;
              })}
              {dayMeetings.filter((meeting) => blocking.includes(meeting)).map((meeting) => {
                const from = minuteOf(meeting.start);
                const to = Date.parse(meeting.end) - Date.parse(day) >= 86_400_000 ? 24 * 60 : minuteOf(meeting.end);
                if (to <= start || from >= end) return null;
                return <FixedBlock key={`m-${meeting.start}-${meeting.title}`} label={spanLabel(meeting.start, meeting.end, tz)} phone={phone} style={clip(from, Math.max(to, from + 15))} title={meeting.title} />;
              })}
              {!phone && dayMeetings.filter((meeting) => !blocking.includes(meeting)).map((meeting) => {
                const from = minuteOf(meeting.start);
                if (from < start || from >= end) return null;
                return (
                  <span className="pointer-events-none absolute right-1.5 z-[2] max-w-[21%] truncate rounded-[5px] border border-dashed border-today-protected-line bg-card px-1.5 py-[3px] text-[0.7rem] text-today-ink2" key={`o-${meeting.start}-${meeting.title}`} style={{ top: pos(from) }} title={`${meeting.title} · optional, doesn't block scheduling`}>
                    {clockAt(meeting.start, tz).replace(":00", "")} · {meeting.title} · optional
                  </span>
                );
              })}
              {preview.filter((ghost) => !ghost.off && inDay(ghost.start, day)).map((ghost) => {
                const from = minuteOf(ghost.start);
                const length = (Date.parse(ghost.end) - Date.parse(ghost.start)) / MIN;
                const hex = areaHex(ghost.areaSlug);
                return (
                  <div aria-label={`Draft: ${ghost.title} at ${clockAt(ghost.start, tz)}`} className={`pointer-events-none absolute z-[4] flex items-center gap-[7px] overflow-hidden rounded-[7px] border border-l-4 border-dashed px-2 opacity-90 ${phone ? "left-[7px] right-1.5 text-[0.77rem]" : "left-2 right-[22%] text-[0.81rem]"}`} key={`ghost-${ghost.taskId}`} style={{ ...inset(from, from + length), borderColor: hex, background: tint(hex, 10) }}>
                    <strong className="min-w-0 truncate">{ghost.title}</strong>
                    <span className="ml-auto whitespace-nowrap text-[0.71rem] text-today-ink2">Draft · {length} min</span>
                  </div>
                );
              })}
              {dayBlocks.map((task) => {
                const from = minuteOf(task.start as string);
                const length = (Date.parse(task.end as string) - Date.parse(task.start as string)) / MIN;
                const shownEnd = resize?.taskId === task.id ? resize.endMin : from + length;
                if (shownEnd <= start || from >= end) return null;
                const hex = task.isProtected ? null : areaHex(task.areaSlug);
                return (
                  <div
                    className={`group absolute z-[3] flex cursor-grab items-center gap-[7px] overflow-hidden rounded-[7px] border border-l-4 px-2 leading-tight text-foreground active:cursor-grabbing ${phone ? "left-[7px] right-1.5 text-[0.77rem]" : "left-2 right-[22%] text-[0.81rem]"} ${hex ? "" : "border-today-protected-line bg-today-protected"}`}
                    draggable={!resize}
                    key={task.id}
                    onClick={() => onOpenBlock(task)}
                    onDragStart={(event) => {
                      const grabMin = (event.clientY - event.currentTarget.getBoundingClientRect().top) / pxm;
                      event.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ taskId: task.id, minutes: length, mode: "block", grabMin } satisfies DragPayload));
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpenBlock(task); } }}
                    role="button"
                    style={{ ...inset(from, Math.max(shownEnd, from + 10)), ...(hex ? { borderColor: hex, background: tint(hex, 14) } : {}) }}
                    tabIndex={0}
                    title={`${task.title} · ${spanLabel(task.start as string, task.end as string, tz)}. Drag to move; drag the bottom edge to change length; click for options.`}
                  >
                    <strong className="min-w-0 flex-1 truncate">{task.title}</strong>
                    <small className={`whitespace-nowrap text-today-ink2 ${phone ? "text-[0.66rem]" : "text-[0.71rem]"}`}>{task.isProtected ? spanLabel(task.start as string, task.end as string, tz) : `${Math.round(shownEnd - from)} min`}</small>
                    <span className="sr-only">{spanLabel(task.start as string, task.end as string, tz)}</span>
                    {!phone && (
                      <span
                        aria-hidden
                        className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize opacity-0 hover:bg-black/10 group-hover:opacity-100"
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          const column = event.currentTarget.closest("[role='group']") as HTMLElement;
                          const endAt = (pointer: PointerEvent) => Math.max(from + SNAP, Math.round((start + (pointer.clientY - column.getBoundingClientRect().top) / pxm) / SNAP) * SNAP);
                          const move = (pointer: PointerEvent) => setResize({ taskId: task.id, endMin: endAt(pointer) });
                          const up = (pointer: PointerEvent) => {
                            window.removeEventListener("pointermove", move);
                            window.removeEventListener("pointerup", up);
                            const endMin = endAt(pointer);
                            setResize(null);
                            if (endMin !== from + length) onResize(task, endMin - from);
                          };
                          window.addEventListener("pointermove", move);
                          window.addEventListener("pointerup", up);
                        }}
                      />
                    )}
                  </div>
                );
              })}
              {picked && (
                <div className="absolute inset-0 z-[6]">
                  {Array.from({ length: Math.floor((end - start) / SNAP) }, (_, slot) => {
                    const minute = start + slot * SNAP;
                    const at = Date.parse(day) + minute * MIN;
                    const ok = starts.has(at);
                    const first = ok && !targetGiven;
                    if (first) targetGiven = true;
                    return (
                      <button
                        aria-label={`${minuteLabel(minute)}, ${ok ? "available" : "unavailable"}`}
                        className={`absolute inset-x-0 border-0 text-left text-[0.75rem] font-bold focus-visible:outline-none ${ok ? "cursor-copy bg-today-accent-soft/50 text-transparent hover:bg-today-accent-soft hover:pl-[9px] hover:text-today-accent-ink focus-visible:bg-today-accent-soft focus-visible:pl-[9px] focus-visible:text-today-accent-ink" : "cursor-not-allowed bg-transparent text-transparent"}`}
                        key={slot}
                        onClick={() => { if (ok) onBook(picked, at, picked.minutes); }}
                        ref={first && dayIndex === 0 ? firstTarget : undefined}
                        style={{ top: slot * SNAP * pxm, height: SNAP * pxm }}
                        tabIndex={ok ? 0 : -1}
                        type="button"
                      >
                        {minuteLabel(minute)}
                      </button>
                    );
                  })}
                </div>
              )}
              {hover?.day === dayIndex && (
                <div aria-hidden className="pointer-events-none absolute inset-x-0 z-[5] bg-today-accent-soft pl-[9px] text-[0.75rem] font-bold text-today-accent-ink" style={{ top: pos(hover.minute), height: SNAP * pxm }}>{minuteLabel(hover.minute)}</div>
              )}
              {day === todayIso && nowMin > start && nowMin < end && (
                <div aria-hidden className="pointer-events-none absolute inset-x-0 z-[7] h-0.5 bg-destructive/80" style={{ top: pos(nowMin) }}>
                  <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-destructive" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FixedBlock({ title, label, style, phone }: { title: string; label: string; style: { top: number; height: number }; phone: boolean }) {
  if (style.height <= 0) return null;
  return (
    <div className={`pointer-events-none absolute z-[2] flex items-center gap-[7px] overflow-hidden rounded-[7px] border border-l-4 border-today-protected-line bg-today-protected px-2 leading-tight ${phone ? "left-[7px] right-1.5 text-[0.77rem]" : "left-2 right-[22%] text-[0.81rem]"}`} style={{ top: style.top + 1, height: Math.max(14, style.height - 2) }} title={`${title} · ${label}`}>
      <strong className="min-w-0 flex-1 truncate">{title}</strong>
      <small className={`whitespace-nowrap text-today-ink2 ${phone ? "text-[0.66rem]" : "text-[0.71rem]"}`}>{label}</small>
    </div>
  );
}

// Earlier time folded above the grid: what's before the window (protected work, meetings, blocks).
export function earlierLines(board: Board, blocks: BoardTask[], day: string, window: { start: number; end: number }) {
  const tz = board.timeZone;
  const dayStart = Date.parse(day);
  const from = dayStart + window.start * MIN;
  const to = dayStart + window.end * MIN;
  const lines: { at: number; text: string }[] = [];
  for (const work of board.availability.work) {
    if (Date.parse(work.start) < to && Date.parse(work.end) > from) lines.push({ at: Date.parse(work.start), text: `${spanLabel(work.start, work.end, tz)} · Protected work` });
  }
  for (const meeting of blockingEvents(board.meetings, board.availability.optionalBlocks)) {
    if (Date.parse(meeting.start) < to && Date.parse(meeting.start) >= from) lines.push({ at: Date.parse(meeting.start), text: `${spanLabel(meeting.start, meeting.end, tz)} · ${meeting.title}` });
  }
  for (const task of blocks) {
    if (task.start && task.end && Date.parse(task.start) < to && Date.parse(task.start) >= from) lines.push({ at: Date.parse(task.start), text: `${spanLabel(task.start, task.end, tz)} · ${task.isProtected ? "Protected · " : ""}${task.title}` });
  }
  return lines.sort((a, b) => a.at - b.at).map((line) => line.text);
}

// ——— Phone time picker ———

// Tap Plan → pick a time → Add to calendar. Picking a time alone saves nothing; Cancel writes nothing.
export function PlanSheet({ task, board, blocks, pending, onConfirm, onClose }: {
  task: BoardTask; board: Board; blocks: BoardTask[]; pending: boolean; onConfirm: (start: number) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [time, setTime] = useState<number | null>(null);
  const tz = board.timeZone;
  const today = startsFor(board, blocks, task, board.soonDays[0]);
  const tomorrow = today.length ? [] : startsFor(board, blocks, task, board.soonDays[1]);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  const work = !respectsWorkHours(task.areaSlug, task.workContext);
  const choices = today.length ? today : tomorrow;
  return (
    <dialog
      aria-labelledby="plan-sheet-title"
      className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[81%] w-full max-w-none overflow-y-auto rounded-t-2xl border bg-card p-0 text-foreground shadow-[0_-8px_32px_#20384d30] backdrop:bg-[#142b4766] md:bottom-auto md:top-[12vh] md:mx-auto md:max-w-md md:rounded-2xl"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      ref={ref}
    >
      <div className="px-3 pb-2 pt-[13px]">
        <h2 className="mb-1 text-base font-bold tracking-[-0.02em]" id="plan-sheet-title" title={task.title}>{shortTitle(task.title)}</h2>
        <p className="text-[0.79rem] text-muted-foreground">
          {task.minutes} minutes · {choices.length ? (today.length ? "Choose a time that fits today." : "Nothing fits today. Choose a time tomorrow.") : "No open time that fits today or tomorrow."}
          {work ? " Work tasks can use work hours." : ""}
        </p>
      </div>
      {choices.length > 0 && (
        <div className="grid grid-cols-3 gap-[5px] px-3 pb-[9px]">
          {choices.map((start) => (
            <button aria-pressed={time === start} className={`min-h-11 rounded-[7px] border text-[0.75rem] font-semibold tabular-nums ${time === start ? "border-today-accent bg-today-accent-soft text-today-accent-ink" : "border-today-track-line bg-today-track"}`} key={start} onClick={() => setTime(start)} type="button">
              {!today.length ? `${new Date(start).toLocaleDateString("en-US", { timeZone: tz, weekday: "short" })} ` : ""}{clockAt(start, tz)}
            </button>
          ))}
        </div>
      )}
      <div className="sticky bottom-0 flex justify-between gap-2 border-t bg-muted/60 px-3 pb-[calc(11px+env(safe-area-inset-bottom))] pt-2">
        <button className={`${buttonStyles.base} min-h-11`} onClick={onClose} type="button">Cancel</button>
        <button className={`${buttonStyles.primary} min-h-11`} disabled={time === null || pending} onClick={() => { if (time !== null) onConfirm(time); }} type="button">{pending ? "Adding…" : "Add to calendar"}</button>
      </div>
    </dialog>
  );
}
