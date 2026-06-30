"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  clearTaskTimeBlockAction,
  scheduleTaskTimeBlockAction
} from "@/app/time-blocks/actions";
import {
  formatExecutionDurationBucket,
  formatExecutionLabel,
  formatRecurrenceFrequency,
  formatRecurrenceWeekdays
} from "@/lib/execution-options";

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
  type: string;
  status: string;
  priority: string;
  whenBucket: string;
  estimatedDuration: string | null;
  dueDate: Date | null;
  followUpDate: Date | null;
  waitingOn: string | null;
  note: string | null;
  source: string | null;
  isBlocked: boolean;
  pinToTodayUntilDone: boolean;
  recurrenceFrequency: string;
  recurrenceWeekdays: string | null;
  recurrenceEndDate: Date | null;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  domain: { name: string };
  project: { name: string } | null;
};

type AgendaItem =
  | {
      id: string;
      kind: "calendar";
      title: string;
      start: Date;
      end: Date;
      location: string | null;
    }
  | {
      id: string;
      kind: "task";
      title: string;
      start: Date;
      end: Date;
      task: BoardTask;
    };

type TimeBlockBoardProps = {
  calendarEvents: BoardCalendarEvent[];
  date: Date;
  scheduledTasks: BoardTask[];
  timeZone: string;
  unscheduledTasks: BoardTask[];
};

const defaultTimeZone = "America/Los_Angeles";
const startHour = 6;
const endHour = 21;
const slotMinutes = 30;
const pixelsPerMinute = 2;
const minimumTimedEventMinutes = 5;

function getZonedDateParts(value: Date, timeZone = defaultTimeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(value);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number.parseInt(map.year, 10),
    month: Number.parseInt(map.month, 10),
    day: Number.parseInt(map.day, 10),
    hour: Number.parseInt(map.hour, 10),
    minute: Number.parseInt(map.minute, 10),
    second: Number.parseInt(map.second, 10)
  };
}

function zonedDateTimeToUtc(
  parts: {
    year: number;
    month: number;
    day: number;
    hour?: number;
    minute?: number;
    second?: number;
  },
  timeZone = defaultTimeZone
) {
  const desired = {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0
  };
  let candidate = new Date(
    Date.UTC(
      desired.year,
      desired.month - 1,
      desired.day,
      desired.hour,
      desired.minute,
      desired.second
    )
  );

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const actual = getZonedDateParts(candidate, timeZone);
    const desiredWallTime = Date.UTC(
      desired.year,
      desired.month - 1,
      desired.day,
      desired.hour,
      desired.minute,
      desired.second
    );
    const actualWallTime = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second
    );
    candidate = new Date(
      candidate.getTime() + desiredWallTime - actualWallTime
    );
  }

  return candidate;
}

function formatClock(value: Date, timeZone = defaultTimeZone) {
  return value.toLocaleTimeString("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatShortDate(value: Date | null, timeZone = defaultTimeZone) {
  if (!value) return "None";

  return value.toLocaleDateString("en-US", {
    timeZone,
    month: "short",
    day: "numeric"
  });
}

function minutesFromStart(value: Date, timeZone = defaultTimeZone) {
  const local = getZonedDateParts(value, timeZone);
  return (local.hour - startHour) * 60 + local.minute;
}

function durationMinutes(start: Date, end: Date) {
  return Math.max(
    slotMinutes,
    Math.round((end.getTime() - start.getTime()) / 60000)
  );
}

function minutesForDurationBucket(value: string | null | undefined) {
  switch (value) {
    case "UNDER_30_MIN":
      return 30;
    case "THIRTY_TO_SIXTY_MIN":
      return 60;
    case "ONE_TO_TWO_HOURS":
      return 90;
    case "TWO_HOURS_PLUS":
      return 120;
    default:
      return 30;
  }
}

function addMinutes(value: Date, minutes: number) {
  return new Date(value.getTime() + minutes * 60000);
}

function startOfDay(value: Date, timeZone = defaultTimeZone) {
  const parts = getZonedDateParts(value, timeZone);
  return zonedDateTimeToUtc(
    { year: parts.year, month: parts.month, day: parts.day },
    timeZone
  );
}

function isSameLocalDay(left: Date, right: Date, timeZone = defaultTimeZone) {
  const leftParts = getZonedDateParts(left, timeZone);
  const rightParts = getZonedDateParts(right, timeZone);

  return (
    leftParts.year === rightParts.year &&
    leftParts.month === rightParts.month &&
    leftParts.day === rightParts.day
  );
}

function hasTimedDuration(
  event: BoardCalendarEvent,
  selectedDate: Date,
  timeZone = defaultTimeZone
) {
  return (
    !event.isAllDay &&
    isSameLocalDay(event.start, selectedDate, timeZone) &&
    isSameLocalDay(event.end, selectedDate, timeZone) &&
    event.end.getTime() - event.start.getTime() >=
      minimumTimedEventMinutes * 60000
  );
}

function slotStart(date: Date, index: number, timeZone = defaultTimeZone) {
  const parts = getZonedDateParts(date, timeZone);
  const totalMinutes = startHour * 60 + index * slotMinutes;

  return zonedDateTimeToUtc(
    {
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hour: Math.floor(totalMinutes / 60),
      minute: totalMinutes % 60
    },
    timeZone
  );
}

function overlaps(start: Date, end: Date, busyStart: Date, busyEnd: Date) {
  return start < busyEnd && end > busyStart;
}

function priorityTone(priority: string) {
  switch (priority) {
    case "CRITICAL":
      return "border-red-400/45 bg-red-500/12 text-red-100";
    case "HIGH":
      return "border-amber-400/45 bg-amber-500/12 text-amber-100";
    case "LOW":
      return "border-slate-400/30 bg-slate-500/10 text-slate-200";
    default:
      return "border-emerald-400/35 bg-emerald-500/12 text-emerald-100";
  }
}

export function TimeBlockBoard({
  calendarEvents,
  date,
  scheduledTasks,
  timeZone,
  unscheduledTasks
}: TimeBlockBoardProps) {
  const router = useRouter();
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [localScheduledTasks, setLocalScheduledTasks] =
    useState(scheduledTasks);
  const [localUnscheduledTasks, setLocalUnscheduledTasks] =
    useState(unscheduledTasks);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setLocalScheduledTasks(scheduledTasks);
    setLocalUnscheduledTasks(
      unscheduledTasks.map((task) => ({
        ...task,
        scheduledStart: null,
        scheduledEnd: null
      }))
    );
  }, [scheduledTasks, unscheduledTasks]);

  const slots = useMemo(() => {
    const count = ((endHour - startHour) * 60) / slotMinutes;
    return Array.from({ length: count }, (_, index) =>
      slotStart(date, index, timeZone)
    );
  }, [date, timeZone]);

  const dayHeight = (endHour - startHour) * 60 * pixelsPerMinute;
  const contextEvents = calendarEvents.filter(
    (event) => !hasTimedDuration(event, date, timeZone)
  );
  const timedEvents = calendarEvents.filter((event) =>
    hasTimedDuration(event, date, timeZone)
  );
  const selectedTask =
    [...localUnscheduledTasks, ...localScheduledTasks].find(
      (task) => task.id === selectedTaskId
    ) ?? null;
  const agendaItems = useMemo<AgendaItem[]>(() => {
    const calendarItems: AgendaItem[] = timedEvents.map((event) => ({
      id: event.id,
      kind: "calendar",
      title: event.summary,
      start: event.start,
      end: event.end,
      location: event.location
    }));
    const taskItems: AgendaItem[] = localScheduledTasks
      .filter((task) => task.scheduledStart && task.scheduledEnd)
      .map((task) => ({
        id: task.id,
        kind: "task",
        title: task.title,
        start: task.scheduledStart as Date,
        end: task.scheduledEnd as Date,
        task
      }));

    return [...calendarItems, ...taskItems].sort(
      (left, right) => left.start.getTime() - right.start.getTime()
    );
  }, [timedEvents, localScheduledTasks]);

  const findOpenSlots = (task: BoardTask, limit = 4) => {
    const duration = minutesForDurationBucket(task.estimatedDuration);
    const busy = [
      ...localScheduledTasks
        .filter(
          (item) =>
            item.id !== task.id && item.scheduledStart && item.scheduledEnd
        )
        .map((item) => ({
          start: item.scheduledStart as Date,
          end: item.scheduledEnd as Date
        }))
    ];
    const selectedDay = startOfDay(date, timeZone);
    const today = startOfDay(new Date(), timeZone);
    const now = new Date();

    return slots
      .filter((slot) => {
        const end = addMinutes(slot, duration);
        if (minutesFromStart(end, timeZone) > (endHour - startHour) * 60)
          return false;
        if (selectedDay.getTime() === today.getTime() && slot < now)
          return false;
        return !busy.some((item) => overlaps(slot, end, item.start, item.end));
      })
      .slice(0, limit);
  };

  const scheduleTask = (taskId: string, start: Date) => {
    const task = [...localUnscheduledTasks, ...localScheduledTasks].find(
      (item) => item.id === taskId
    );
    const previousScheduled = localScheduledTasks;
    const previousUnscheduled = localUnscheduledTasks;

    if (task) {
      const scheduledEnd = addMinutes(
        start,
        minutesForDurationBucket(task.estimatedDuration)
      );
      const busy = [
        ...localScheduledTasks
          .filter(
            (item) =>
              item.id !== taskId && item.scheduledStart && item.scheduledEnd
          )
          .map((item) => ({
            start: item.scheduledStart as Date,
            end: item.scheduledEnd as Date
          }))
      ];

      if (
        busy.some((item) => overlaps(start, scheduledEnd, item.start, item.end))
      ) {
        setMessage("That window overlaps a placed task.");
        return;
      }

      const movedTask = { ...task, scheduledStart: start, scheduledEnd };
      setLocalUnscheduledTasks((tasks) =>
        tasks.filter((item) => item.id !== taskId)
      );
      setLocalScheduledTasks((tasks) => [
        movedTask,
        ...tasks.filter((item) => item.id !== taskId)
      ]);
    }

    setPendingTaskId(taskId);
    setMessage("");
    startTransition(async () => {
      const result = await scheduleTaskTimeBlockAction(
        taskId,
        start.toISOString()
      );
      setPendingTaskId(null);
      if (result.ok) {
        setMessage("Timeblock saved.");
        router.refresh();
      } else {
        setLocalScheduledTasks(previousScheduled);
        setLocalUnscheduledTasks(previousUnscheduled);
        setMessage(result.error);
      }
    });
  };

  const clearTask = (taskId: string) => {
    const task = localScheduledTasks.find((item) => item.id === taskId);
    const previousScheduled = localScheduledTasks;
    const previousUnscheduled = localUnscheduledTasks;

    if (task) {
      setLocalScheduledTasks((tasks) =>
        tasks.filter((item) => item.id !== taskId)
      );
      setLocalUnscheduledTasks((tasks) => [
        { ...task, scheduledStart: null, scheduledEnd: null },
        ...tasks
      ]);
    }

    setPendingTaskId(taskId);
    setMessage("");
    startTransition(async () => {
      const result = await clearTaskTimeBlockAction(taskId);
      setPendingTaskId(null);
      if (result.ok) {
        setMessage("Timeblock cleared.");
        router.refresh();
      } else {
        setLocalScheduledTasks(previousScheduled);
        setLocalUnscheduledTasks(previousUnscheduled);
        setMessage(result.error);
      }
    });
  };

  const taskDetailPanel = selectedTask ? (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end bg-slate-950/70 p-3 backdrop-blur-sm sm:items-center sm:justify-center"
      onClick={() => setSelectedTaskId(null)}
      role="dialog"
    >
      <div
        className="max-h-[88vh] w-full overflow-y-auto rounded-[1.75rem] border border-white/10 bg-slate-950 p-4 text-white shadow-[0_24px_100px_rgba(0,0,0,0.48)] sm:max-w-2xl sm:p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200/80">
              Task Detail
            </p>
            <h3 className="mt-2 text-2xl font-semibold leading-tight">
              {selectedTask.title}
            </h3>
            <p className="mt-2 text-sm text-slate-300">
              {selectedTask.domain.name}
              {selectedTask.project ? ` / ${selectedTask.project.name}` : ""}
            </p>
          </div>
          <button
            className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-sm text-slate-200 hover:bg-white/15"
            onClick={() => setSelectedTaskId(null)}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs">
            {formatExecutionLabel(selectedTask.type)}
          </span>
          <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs">
            {formatExecutionLabel(selectedTask.status)}
          </span>
          <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs">
            {formatExecutionLabel(selectedTask.whenBucket)}
          </span>
          <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs text-amber-100">
            {formatExecutionLabel(selectedTask.priority)}
          </span>
          {selectedTask.estimatedDuration && (
            <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-xs text-emerald-100">
              {formatExecutionDurationBucket(selectedTask.estimatedDuration)}
            </span>
          )}
          {selectedTask.isBlocked && (
            <span className="rounded-full border border-red-300/30 bg-red-300/10 px-3 py-1 text-xs text-red-100">
              Blocked
            </span>
          )}
          {selectedTask.pinToTodayUntilDone && (
            <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100">
              Pinned Today
            </span>
          )}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
              Due
            </p>
            <p className="mt-1 text-sm font-medium">
              {formatShortDate(selectedTask.dueDate, timeZone)}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
              Follow Up
            </p>
            <p className="mt-1 text-sm font-medium">
              {formatShortDate(selectedTask.followUpDate, timeZone)}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
              Waiting On
            </p>
            <p className="mt-1 text-sm font-medium">
              {selectedTask.waitingOn || "None"}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
              Source
            </p>
            <p className="mt-1 text-sm font-medium">
              {selectedTask.source || "None"}
            </p>
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.06] p-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
            Repeats
          </p>
          <p className="mt-1 text-sm font-medium">
            {selectedTask.recurrenceFrequency === "NONE"
              ? "Does not repeat"
              : `${formatRecurrenceFrequency(selectedTask.recurrenceFrequency)}${
                  formatRecurrenceWeekdays(selectedTask.recurrenceWeekdays)
                    ? `: ${formatRecurrenceWeekdays(selectedTask.recurrenceWeekdays)}`
                    : ""
                }${
                  selectedTask.recurrenceEndDate
                    ? ` until ${formatShortDate(selectedTask.recurrenceEndDate, timeZone)}`
                    : ""
                }`}
          </p>
        </div>

        {selectedTask.note && (
          <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.06] p-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
              Notes
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-200">
              {selectedTask.note}
            </p>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          {selectedTask.scheduledStart && selectedTask.scheduledEnd ? (
            <button
              className="rounded-full bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950"
              disabled={isPending || pendingTaskId === selectedTask.id}
              onClick={() => clearTask(selectedTask.id)}
              type="button"
            >
              Move Back to Queue
            </button>
          ) : (
            findOpenSlots(selectedTask, 3).map((slot, index) => (
              <button
                className={
                  index === 0
                    ? "rounded-full bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950"
                    : "rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white"
                }
                disabled={isPending || pendingTaskId === selectedTask.id}
                key={slot.toISOString()}
                onClick={() => scheduleTask(selectedTask.id, slot)}
                type="button"
              >
                {index === 0 ? "Place next " : "Place "}
                {formatClock(slot, timeZone)}
              </button>
            ))
          )}
          <a
            className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white"
            href={`/tasks?q=${encodeURIComponent(selectedTask.title)}`}
          >
            Edit in Tasks
          </a>
        </div>
      </div>
    </div>
  ) : null;

  const mobileTaskQueue = (
    <section className="rounded-[1.75rem] border border-emerald-300/20 bg-slate-950/95 p-4 text-white shadow-[0_18px_70px_rgba(2,6,23,0.36)] lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200/80">
            Task Queue
          </p>
          <h3 className="mt-1 text-lg font-semibold">Tap to place</h3>
        </div>
        <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-xs text-slate-200">
          {localUnscheduledTasks.length} open
        </span>
      </div>
      <div className="mt-3 max-h-[58vh] space-y-2 overflow-y-auto pr-1">
        {localUnscheduledTasks.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-sm text-slate-300">
            <p>No unscheduled active tasks for this day.</p>
            <p className="mt-1 text-xs text-slate-400">
              If everything is already placed, it will show in the timeline
              below.
            </p>
          </div>
        )}
        {localUnscheduledTasks.map((task) => {
          const openSlots = findOpenSlots(task, 3);
          return (
            <div
              className={`rounded-2xl border p-3 ${priorityTone(task.priority)}`}
              key={task.id}
              onClick={() => setSelectedTaskId(task.id)}
              role="button"
              tabIndex={0}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm font-semibold text-white">
                    {task.title}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-slate-300">
                    <span>{task.domain.name}</span>
                    {task.project && <span>{task.project.name}</span>}
                    <span>{formatExecutionLabel(task.priority)}</span>
                    {task.estimatedDuration && (
                      <span>
                        {formatExecutionDurationBucket(task.estimatedDuration)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {openSlots.length === 0 && (
                  <span className="text-xs text-slate-300">
                    No clean slot found today.
                  </span>
                )}
                {openSlots.map((slot, index) => (
                  <button
                    className={
                      index === 0
                        ? "rounded-full bg-emerald-300 px-3 py-1.5 text-xs font-semibold text-slate-950"
                        : "rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white"
                    }
                    disabled={isPending || pendingTaskId === task.id}
                    key={slot.toISOString()}
                    onClick={(event) => {
                      event.stopPropagation();
                      scheduleTask(task.id, slot);
                    }}
                    type="button"
                  >
                    {index === 0 ? "Next " : ""}
                    {formatClock(slot, timeZone)}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );

  return (
    <div className="space-y-4">
      {taskDetailPanel}

      <section className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-slate-950 text-white shadow-[0_24px_80px_rgba(2,6,23,0.32)] lg:hidden">
        <div className="relative p-4">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(16,185,129,0.28),transparent_32%),radial-gradient(circle_at_90%_0%,rgba(245,158,11,0.20),transparent_28%)]" />
          <div className="relative">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200/80">
              Mobile Mission Control
            </p>
            <div className="mt-2 flex items-end justify-between gap-3">
              <div>
                <h3 className="text-2xl font-semibold leading-tight">
                  {date.toLocaleDateString("en-US", {
                    timeZone,
                    weekday: "long",
                    month: "short",
                    day: "numeric"
                  })}
                </h3>
                <p className="mt-1 text-sm text-slate-300">
                  Tap a task into the next clean opening. No drag-and-drop
                  gymnastics.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-right backdrop-blur">
                <p className="text-2xl font-semibold">
                  {localScheduledTasks.length}
                </p>
                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-300">
                  Placed
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.08] p-3">
                <p className="text-xl font-semibold">{timedEvents.length}</p>
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-300">
                  Calendar
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.08] p-3">
                <p className="text-xl font-semibold">
                  {localUnscheduledTasks.length}
                </p>
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-300">
                  Queue
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.08] p-3">
                <p className="text-xl font-semibold">{contextEvents.length}</p>
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-300">
                  FYI
                </p>
              </div>
            </div>
          </div>
        </div>

        {message && (
          <div className="mx-4 mb-4 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100">
            {message}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:hidden">
        {mobileTaskQueue}

        {contextEvents.length > 0 && (
          <section className="rounded-[1.5rem] border bg-card/95 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  All-day / FYI
                </p>
                <h3 className="mt-1 text-base font-semibold">
                  Visible, but not blocking time
                </h3>
              </div>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                {contextEvents.length}
              </span>
            </div>
            <div className="mt-3 flex snap-x gap-2 overflow-x-auto pb-1">
              {contextEvents.map((event) => (
                <div
                  className="min-w-[180px] snap-start rounded-2xl border bg-background/80 p-3"
                  key={event.id}
                >
                  <p className="line-clamp-2 text-sm font-medium">
                    {event.summary}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {event.isAllDay
                      ? "All-day item"
                      : formatClock(event.start, timeZone)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-[1.5rem] border bg-card/95 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Today Timeline
              </p>
              <h3 className="mt-1 text-lg font-semibold">
                Agenda + placed tasks
              </h3>
            </div>
            <span className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
              {agendaItems.length} items
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {agendaItems.length === 0 && (
              <div className="rounded-2xl border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
                No timed calendar items or scheduled tasks yet. Start from the
                queue below.
              </div>
            )}
            {agendaItems.map((item) => (
              <div
                className="grid grid-cols-[64px_minmax(0,1fr)] gap-3"
                key={`${item.kind}-${item.id}`}
              >
                <div className="pt-3 text-right">
                  <p className="text-sm font-semibold">
                    {formatClock(item.start, timeZone)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatClock(item.end, timeZone)}
                  </p>
                </div>
                <div
                  className={
                    item.kind === "calendar"
                      ? "rounded-2xl border border-amber-300/45 bg-amber-300/15 p-3"
                      : "rounded-2xl border border-emerald-300/45 bg-emerald-400/10 p-3"
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm font-semibold">
                        {item.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.kind === "calendar"
                          ? item.location || "Google Calendar"
                          : "Action OS task"}
                      </p>
                    </div>
                    {item.kind === "task" && (
                      <button
                        className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground"
                        disabled={isPending || pendingTaskId === item.task.id}
                        onClick={() => clearTask(item.task.id)}
                        type="button"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="hidden items-start gap-4 lg:grid xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-h-0 flex-col rounded-2xl border bg-card p-3 shadow-sm sm:p-4 xl:max-h-[calc(100vh-9rem)]">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Google Calendar + Task Blocks
              </p>
              <h3 className="text-xl font-semibold">
                {date.toLocaleDateString("en-US", {
                  timeZone,
                  weekday: "long",
                  month: "long",
                  day: "numeric"
                })}
              </h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Drag a task onto a 30-minute slot. Google events are read-only.
            </p>
          </div>

          {message && (
            <p className="mb-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              {message}
            </p>
          )}

          {contextEvents.length > 0 && (
            <div className="mb-3 rounded-xl border border-border bg-muted/30 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                All-day / FYI
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {contextEvents.map((event) => (
                  <span
                    className="rounded-full border border-border bg-background/70 px-2.5 py-1 text-xs text-muted-foreground"
                    key={event.id}
                    title={
                      event.isAllDay
                        ? "All-day Google Calendar item"
                        : "Google Calendar item with no timed duration"
                    }
                  >
                    {event.summary}
                    {!event.isAllDay
                      ? ` (${formatClock(event.start, timeZone)})`
                      : ""}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="min-h-[560px] overflow-auto rounded-xl xl:min-h-0">
            <div className="grid min-w-[720px] grid-cols-[72px_minmax(0,1fr)]">
              <div className="relative" style={{ height: dayHeight }}>
                {Array.from({ length: endHour - startHour + 1 }, (_, index) => (
                  <div
                    className="absolute left-0 pr-3 text-right text-xs text-muted-foreground"
                    key={index}
                    style={{ top: index * 60 * pixelsPerMinute - 6, width: 64 }}
                  >
                    {slotStart(date, index * 2, timeZone).toLocaleTimeString(
                      "en-US",
                      {
                        timeZone,
                        hour: "numeric"
                      }
                    )}
                  </div>
                ))}
              </div>

              <div
                className="relative rounded-xl border bg-background/50"
                style={{ height: dayHeight }}
              >
                {slots.map((slot) => (
                  <div
                    className="absolute left-0 right-0 border-t border-border/60"
                    key={slot.toISOString()}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const taskId =
                        event.dataTransfer.getData("text/plain") ||
                        draggedTaskId;
                      if (taskId) {
                        scheduleTask(taskId, slot);
                      }
                    }}
                    style={{
                      top: minutesFromStart(slot, timeZone) * pixelsPerMinute,
                      height: slotMinutes * pixelsPerMinute
                    }}
                  />
                ))}

                {timedEvents.map((event) => {
                  const top = Math.max(
                    0,
                    minutesFromStart(event.start, timeZone) * pixelsPerMinute
                  );
                  const height =
                    durationMinutes(event.start, event.end) * pixelsPerMinute;

                  return (
                    <div
                      className="pointer-events-none absolute left-0 right-0 z-[1] border-y border-amber-300/20 bg-amber-300/10"
                      key={`${event.id}-busy`}
                      style={{ top, height }}
                    />
                  );
                })}

                {timedEvents.map((event) => {
                  const top = Math.max(
                    0,
                    minutesFromStart(event.start, timeZone) * pixelsPerMinute
                  );
                  const height =
                    durationMinutes(event.start, event.end) * pixelsPerMinute;
                  return (
                    <div
                      className="absolute left-3 right-[52%] z-10 overflow-hidden rounded-lg border border-amber-400/70 bg-amber-300/90 p-2 text-amber-950 shadow-sm"
                      key={event.id}
                      style={{ top, height }}
                    >
                      <p className="truncate text-xs font-semibold">
                        {event.summary}
                      </p>
                      <p className="text-[11px] opacity-80">
                        {formatClock(event.start, timeZone)}-
                        {formatClock(event.end, timeZone)}
                      </p>
                    </div>
                  );
                })}

                {localScheduledTasks.map((task) => {
                  if (!task.scheduledStart || !task.scheduledEnd) return null;
                  const top = Math.max(
                    0,
                    minutesFromStart(task.scheduledStart, timeZone) *
                      pixelsPerMinute
                  );
                  const height =
                    durationMinutes(task.scheduledStart, task.scheduledEnd) *
                    pixelsPerMinute;
                  return (
                    <div
                      className="absolute left-[50%] right-3 z-20 cursor-grab overflow-hidden rounded-lg border border-primary/50 bg-primary/15 p-2 shadow-sm"
                      draggable
                      key={task.id}
                      onClick={() => setSelectedTaskId(task.id)}
                      onDragStart={(event) => {
                        setDraggedTaskId(task.id);
                        event.dataTransfer.setData("text/plain", task.id);
                      }}
                      style={{ top, height }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold">
                            {task.title}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatClock(task.scheduledStart, timeZone)}-
                            {formatClock(task.scheduledEnd, timeZone)}
                          </p>
                        </div>
                        <button
                          className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                          disabled={isPending || pendingTaskId === task.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            clearTask(task.id);
                          }}
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

        <aside className="space-y-3 xl:sticky xl:top-28 xl:max-h-[calc(100vh-8rem)] xl:overflow-y-auto">
          <section
            className="rounded-2xl border bg-card p-4 shadow-sm"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const taskId =
                event.dataTransfer.getData("text/plain") || draggedTaskId;
              if (taskId) {
                clearTask(taskId);
              }
            }}
          >
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Task Queue
            </p>
            <h3 className="mt-1 text-lg font-semibold">Drag to Timeblock</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Drop a scheduled task here to move it back to the queue.
            </p>
            <div className="mt-3 space-y-2">
              {localUnscheduledTasks.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No unscheduled active tasks.
                </p>
              )}
              {localUnscheduledTasks.map((task) => (
                <div
                  className="cursor-grab rounded-xl border bg-background/70 p-3 shadow-sm active:cursor-grabbing"
                  draggable
                  key={task.id}
                  onClick={() => setSelectedTaskId(task.id)}
                  onDragStart={(event) => {
                    setDraggedTaskId(task.id);
                    event.dataTransfer.setData("text/plain", task.id);
                  }}
                >
                  <p className="text-sm font-semibold leading-snug">
                    {task.title}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                    <span>{task.domain.name}</span>
                    {task.project && <span>{task.project.name}</span>}
                    <span>{formatExecutionLabel(task.priority)}</span>
                    {task.estimatedDuration && (
                      <span>
                        {formatExecutionDurationBucket(task.estimatedDuration)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
