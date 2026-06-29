"use client";

import { useMemo, useState, useTransition } from "react";
import { clearTaskTimeBlockAction, scheduleTaskTimeBlockAction } from "@/app/time-blocks/actions";
import { formatExecutionDurationBucket, formatExecutionLabel } from "@/lib/execution-options";

type BoardCalendarEvent = {
  id: string;
  summary: string;
  start: Date;
  end: Date;
  isAllDay: boolean;
  location: string | null;
};

type BoardTask = {
  id: string;
  title: string;
  priority: string;
  estimatedDuration: string | null;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  domain: { name: string };
  project: { name: string } | null;
};

type TimeBlockBoardProps = {
  calendarEvents: BoardCalendarEvent[];
  date: Date;
  scheduledTasks: BoardTask[];
  unscheduledTasks: BoardTask[];
};

const startHour = 6;
const endHour = 21;
const slotMinutes = 30;
const pixelsPerMinute = 2;

function toLocalDate(value: Date) {
  return new Date(value);
}

function formatClock(value: Date) {
  return value.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
  });
}

function minutesFromStart(value: Date) {
  const local = toLocalDate(value);
  return (local.getHours() - startHour) * 60 + local.getMinutes();
}

function durationMinutes(start: Date, end: Date) {
  return Math.max(slotMinutes, Math.round((end.getTime() - start.getTime()) / 60000));
}

function hasTimedDuration(event: BoardCalendarEvent) {
  return !event.isAllDay && event.end.getTime() > event.start.getTime();
}

function slotStart(date: Date, index: number) {
  const value = new Date(date);
  value.setHours(startHour, index * slotMinutes, 0, 0);
  return value;
}

export function TimeBlockBoard({ calendarEvents, date, scheduledTasks, unscheduledTasks }: TimeBlockBoardProps) {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const slots = useMemo(() => {
    const count = ((endHour - startHour) * 60) / slotMinutes;
    return Array.from({ length: count }, (_, index) => slotStart(date, index));
  }, [date]);

  const dayHeight = (endHour - startHour) * 60 * pixelsPerMinute;
  const contextEvents = calendarEvents.filter((event) => !hasTimedDuration(event));
  const timedEvents = calendarEvents.filter(hasTimedDuration);

  const scheduleTask = (taskId: string, start: Date) => {
    setPendingTaskId(taskId);
    setMessage("");
    startTransition(async () => {
      const result = await scheduleTaskTimeBlockAction(taskId, start.toISOString());
      setPendingTaskId(null);
      setMessage(result.ok ? "Timeblock saved." : result.error);
    });
  };

  const clearTask = (taskId: string) => {
    setPendingTaskId(taskId);
    setMessage("");
    startTransition(async () => {
      const result = await clearTaskTimeBlockAction(taskId);
      setPendingTaskId(null);
      setMessage(result.ok ? "Timeblock cleared." : result.error);
    });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-2xl border bg-card p-3 shadow-sm sm:p-4">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Google Calendar + Task Blocks</p>
            <h3 className="text-xl font-semibold">{date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</h3>
          </div>
          <p className="text-xs text-muted-foreground">Drag a task onto a 30-minute slot. Google events are read-only.</p>
        </div>

        {message && <p className="mb-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{message}</p>}

        {contextEvents.length > 0 && (
          <div className="mb-3 rounded-xl border border-border bg-muted/30 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">All-day / FYI</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {contextEvents.map((event) => (
                <span
                  className="rounded-full border border-border bg-background/70 px-2.5 py-1 text-xs text-muted-foreground"
                  key={event.id}
                  title={event.isAllDay ? "All-day Google Calendar item" : "Google Calendar item with no timed duration"}
                >
                  {event.summary}
                  {!event.isAllDay ? ` (${formatClock(event.start)})` : ""}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <div className="grid min-w-[720px] grid-cols-[72px_minmax(0,1fr)]">
            <div className="relative" style={{ height: dayHeight }}>
              {Array.from({ length: endHour - startHour + 1 }, (_, index) => (
                <div
                  className="absolute left-0 pr-3 text-right text-xs text-muted-foreground"
                  key={index}
                  style={{ top: index * 60 * pixelsPerMinute - 6, width: 64 }}
                >
                  {new Date(date.getFullYear(), date.getMonth(), date.getDate(), startHour + index).toLocaleTimeString("en-US", {
                    hour: "numeric"
                  })}
                </div>
              ))}
            </div>

            <div className="relative rounded-xl border bg-background/50" style={{ height: dayHeight }}>
              {slots.map((slot) => (
                <div
                  className="absolute left-0 right-0 border-t border-border/60"
                  key={slot.toISOString()}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const taskId = event.dataTransfer.getData("text/plain") || draggedTaskId;
                    if (taskId) {
                      scheduleTask(taskId, slot);
                    }
                  }}
                  style={{ top: minutesFromStart(slot) * pixelsPerMinute, height: slotMinutes * pixelsPerMinute }}
                />
              ))}

              {timedEvents
                .map((event) => {
                  const top = Math.max(0, minutesFromStart(event.start) * pixelsPerMinute);
                  const height = durationMinutes(event.start, event.end) * pixelsPerMinute;
                  return (
                    <div
                      className="absolute left-3 right-[52%] overflow-hidden rounded-lg border border-amber-400/70 bg-amber-300/90 p-2 text-amber-950 shadow-sm"
                      key={event.id}
                      style={{ top, height }}
                    >
                      <p className="truncate text-xs font-semibold">{event.summary}</p>
                      <p className="text-[11px] opacity-80">
                        {formatClock(event.start)}-{formatClock(event.end)}
                      </p>
                    </div>
                  );
                })}

              {scheduledTasks.map((task) => {
                if (!task.scheduledStart || !task.scheduledEnd) return null;
                const top = Math.max(0, minutesFromStart(task.scheduledStart) * pixelsPerMinute);
                const height = durationMinutes(task.scheduledStart, task.scheduledEnd) * pixelsPerMinute;
                return (
                  <div
                    className="absolute left-[50%] right-3 cursor-grab overflow-hidden rounded-lg border border-primary/50 bg-primary/15 p-2 shadow-sm"
                    draggable
                    key={task.id}
                    onDragStart={(event) => {
                      setDraggedTaskId(task.id);
                      event.dataTransfer.setData("text/plain", task.id);
                    }}
                    style={{ top, height }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold">{task.title}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatClock(task.scheduledStart)}-{formatClock(task.scheduledEnd)}
                        </p>
                      </div>
                      <button
                        className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                        disabled={isPending || pendingTaskId === task.id}
                        onClick={() => clearTask(task.id)}
                        type="button"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <aside className="space-y-3">
        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Task Queue</p>
          <h3 className="mt-1 text-lg font-semibold">Drag to Timeblock</h3>
          <div className="mt-3 space-y-2">
            {unscheduledTasks.length === 0 && <p className="text-sm text-muted-foreground">No unscheduled active tasks.</p>}
            {unscheduledTasks.map((task) => (
              <div
                className="cursor-grab rounded-xl border bg-background/70 p-3 shadow-sm active:cursor-grabbing"
                draggable
                key={task.id}
                onDragStart={(event) => {
                  setDraggedTaskId(task.id);
                  event.dataTransfer.setData("text/plain", task.id);
                }}
              >
                <p className="text-sm font-semibold leading-snug">{task.title}</p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                  <span>{task.domain.name}</span>
                  {task.project && <span>{task.project.name}</span>}
                  <span>{formatExecutionLabel(task.priority)}</span>
                  {task.estimatedDuration && <span>{formatExecutionDurationBucket(task.estimatedDuration)}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}
