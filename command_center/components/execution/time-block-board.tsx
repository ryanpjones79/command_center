"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  clearTaskTimeBlockAction,
  importRyanOsLocalStateAction,
  saveDailyPlanAction,
  saveRykasBacklogAction,
  scheduleRyanOsBlockAction,
  scheduleTaskTimeBlockAction
} from "@/app/time-blocks/actions";
import {
  formatExecutionDurationBucket,
  formatExecutionLabel,
  formatRecurrenceFrequency,
  formatRecurrenceWeekdays
} from "@/lib/execution-options";
import { getDailyReadingForDate } from "@/lib/daily-readings";
import { CurrentSeasonCard } from "./current-season-card";
import { HowRyanOSWorksCard } from "./how-ryanos-works-card";
import { MorningCard } from "./morning-card";
import { MorningLaunchCard } from "./morning-launch-card";
import { ShutdownPanel } from "./shutdown-panel";
import { TodayPrincipleCard } from "./today-principle-card";
import { TimeBlockGrid } from "./time-block-grid";

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
  references: {
    id: string;
    provider: string;
    title: string;
    url: string | null;
    note: string | null;
  }[];
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
  currentSeason: {
    description: string | null;
    icon: string | null;
    projects: { id: string; name: string }[];
    themeColor: string | null;
    title: string;
  } | null;
  dailyPlan: {
    dateKey: string;
    needleMove: string | null;
    ruleStep: number | null;
    shutdownNote: string | null;
  };
  date: Date;
  rykasDay: {
    backlogAfter: number;
  };
  todaysPrinciple: {
    id: string;
    title: string;
    idea: string;
    takeaway: string | null;
    application: string | null;
    category: string;
    sourceType: string;
    sourceName: string | null;
    favorite: boolean;
    active: boolean;
    tags: string | null;
    reflections: { id: string; text: string; createdAt: Date }[];
  } | null;
  scheduledTasks: BoardTask[];
  timeZone: string;
  unscheduledTasks: BoardTask[];
};

type RyanOsBlockTemplate = {
  blockType: string;
  helper: string[];
  id: string;
  kind: "required" | "anchor";
  minutes: number;
  title: string;
};

const defaultTimeZone = "America/Los_Angeles";
const startHour = 6;
const endHour = 21;
const slotMinutes = 30;
const pixelsPerMinute = 2;
const minimumTimedEventMinutes = 5;
const emailProviderLabels: Record<string, string> = {
  gmail: "Gmail",
  outlook: "Outlook",
  other: "Email"
};

function isOpenableEmailReference(value: string | null) {
  if (!value) return false;
  return /^(https?:\/\/|mailto:|outlook:)/i.test(value.trim());
}

const decisionRules = [
  "CCHCS deadline / leadership-visible commitment within 48h",
  "SignalCare conversation available",
  "Anything 80% done and ready to ship",
  "Otherwise pipeline block"
];

const blockTypes = [
  "Needle Move",
  "CCHCS",
  "Pipeline",
  "Rykas",
  "Admin",
  "Personal",
  "Parking"
];

const wayOfBeingOptions = [
  "Present",
  "Patient",
  "Focused",
  "Disciplined",
  "Detached",
  "Curious",
  "Kind",
  "Brave"
];

const ryanOsBlockTemplates: RyanOsBlockTemplate[] = [
  {
    blockType: "CCHCS",
    helper: [
      "Protect state and leadership-visible work.",
      "Use a real work block, not residue."
    ],
    id: "cchcs",
    kind: "required",
    minutes: 90,
    title: "CCHCS"
  },
  {
    blockType: "Pipeline",
    helper: [
      "Build tomorrow's opportunities.",
      "LinkedIn comments",
      "Warm DMs",
      "Follow-ups",
      "Post",
      "Metric = conversations, not impressions"
    ],
    id: "pipeline",
    kind: "required",
    minutes: 30,
    title: "Pipeline — 30 minutes"
  },
  {
    blockType: "Rykas",
    helper: [
      "Keep Rykas moving without sourcing sprawl.",
      "Ship sold items",
      "Offers/relist",
      "List from backlog",
      "Source only if backlog <10"
    ],
    id: "rykas",
    kind: "required",
    minutes: 45,
    title: "Rykas — max 45 minutes"
  },
  {
    blockType: "Personal",
    helper: ["Health anchor.", "Walk if there is a clean opening."],
    id: "walking",
    kind: "anchor",
    minutes: 60,
    title: "Walking"
  },
  {
    blockType: "Personal",
    helper: ["Health anchor.", "Training matters, but it should fit the real day."],
    id: "workout",
    kind: "anchor",
    minutes: 60,
    title: "Workout"
  },
  {
    blockType: "Personal",
    helper: ["Practice anchor.", "Keep touch without making it fake urgency."],
    id: "golf-practice",
    kind: "anchor",
    minutes: 60,
    title: "Golf Practice"
  },
  {
    blockType: "Personal",
    helper: ["Quiet anchor.", "Sit for a few minutes when there is a clean opening."],
    id: "meditation",
    kind: "anchor",
    minutes: 15,
    title: "Meditation"
  }
];
const oftenAnchorTemplates = ryanOsBlockTemplates.filter(
  (template) => template.kind === "anchor"
);

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
  currentSeason,
  dailyPlan,
  date,
  rykasDay,
  todaysPrinciple,
  scheduledTasks,
  timeZone,
  unscheduledTasks
}: TimeBlockBoardProps) {
  const router = useRouter();
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [needleMove, setNeedleMove] = useState(dailyPlan.needleMove ?? "");
  const [decisionRule, setDecisionRule] = useState(
    decisionRules[Math.max(0, Math.min(3, (dailyPlan.ruleStep ?? 1) - 1))]
  );
  const [buildRecipient, setBuildRecipient] = useState("");
  const [hasEightyPercentItem, setHasEightyPercentItem] = useState(false);
  const [isMorningLaunchComplete, setIsMorningLaunchComplete] = useState(false);
  const [presenceIntention, setPresenceIntention] = useState("");
  const [wayOfBeing, setWayOfBeing] = useState("");
  const [rykasBacklog, setRykasBacklog] = useState(
    String(rykasDay.backlogAfter)
  );
  const [shutdownShipped, setShutdownShipped] = useState("");
  const [shutdownOpen, setShutdownOpen] = useState("");
  const [shutdownTomorrow, setShutdownTomorrow] = useState(
    dailyPlan.shutdownNote ?? ""
  );
  const [message, setMessage] = useState("");
  const [availableAreaFilter, setAvailableAreaFilter] = useState("all");
  const [availableProjectFilter, setAvailableProjectFilter] = useState("all");
  const [localScheduledTasks, setLocalScheduledTasks] =
    useState(scheduledTasks);
  const [localUnscheduledTasks, setLocalUnscheduledTasks] =
    useState(unscheduledTasks);
  const [isPending, startTransition] = useTransition();
  const dailyReading = getDailyReadingForDate(date);

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
  useEffect(() => {
    setNeedleMove(dailyPlan.needleMove ?? "");
    setDecisionRule(
      decisionRules[Math.max(0, Math.min(3, (dailyPlan.ruleStep ?? 1) - 1))]
    );
    setRykasBacklog(String(rykasDay.backlogAfter));
    setShutdownTomorrow(dailyPlan.shutdownNote ?? "");
  }, [dailyPlan.dateKey]);

  useEffect(() => {
    const storageKey = `ryanos-execution:${dailyPlan.dateKey}`;
    const raw = window.localStorage.getItem(storageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as {
          decisionRule?: string;
          needleMove?: string;
          rykasBacklog?: string;
          shutdownTomorrow?: string;
        };

        setNeedleMove(parsed.needleMove ?? "");
        setDecisionRule(
          typeof parsed.decisionRule === "string"
            ? parsed.decisionRule
            : decisionRules[0]
        );
        setRykasBacklog(parsed.rykasBacklog ?? String(rykasDay.backlogAfter));
        setShutdownTomorrow(parsed.shutdownTomorrow ?? "");
        window.localStorage.removeItem(storageKey);
        startTransition(async () => {
          await importRyanOsLocalStateAction(dailyPlan.dateKey, parsed);
          router.refresh();
        });
      } catch {
        setNeedleMove("");
      }
    }
  }, [dailyPlan.dateKey, router, rykasDay.backlogAfter]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const ruleStep = decisionRules.indexOf(decisionRule) + 1;
      startTransition(() => {
        void saveDailyPlanAction(dailyPlan.dateKey, {
          needleMove,
          ruleStep: ruleStep > 0 ? ruleStep : 1,
          shutdownNote: shutdownTomorrow
        });
      });
    }, 600);

    return () => window.clearTimeout(timeout);
  }, [dailyPlan.dateKey, decisionRule, needleMove, shutdownTomorrow]);

  useEffect(() => {
    const backlog = Number.parseInt(rykasBacklog, 10);
    if (Number.isNaN(backlog)) return;

    const timeout = window.setTimeout(() => {
      startTransition(() => {
        void saveRykasBacklogAction(dailyPlan.dateKey, Math.max(0, backlog));
      });
    }, 600);

    return () => window.clearTimeout(timeout);
  }, [dailyPlan.dateKey, rykasBacklog]);

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
  const availableAreaOptions = useMemo(
    () =>
      Array.from(
        new Set(localUnscheduledTasks.map((task) => task.domain.name))
      ).sort((left, right) => left.localeCompare(right)),
    [localUnscheduledTasks]
  );
  const availableProjectOptions = useMemo(
    () =>
      Array.from(
        new Set(
          localUnscheduledTasks
            .filter(
              (task) =>
                availableAreaFilter === "all" ||
                task.domain.name === availableAreaFilter
            )
            .map((task) => task.project?.name ?? "No project")
        )
      ).sort((left, right) => {
        if (left === "No project") return 1;
        if (right === "No project") return -1;
        return left.localeCompare(right);
      }),
    [availableAreaFilter, localUnscheduledTasks]
  );
  const visibleUnscheduledTasks = useMemo(
    () =>
      localUnscheduledTasks
        .filter(
          (task) =>
            availableAreaFilter === "all" ||
            task.domain.name === availableAreaFilter
        )
        .filter(
          (task) =>
            availableProjectFilter === "all" ||
            (task.project?.name ?? "No project") === availableProjectFilter
        )
        .sort((left, right) => {
          const leftDue = left.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
          const rightDue =
            right.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;

          if (leftDue !== rightDue) return leftDue - rightDue;
          return left.title.localeCompare(right.title);
        }),
    [availableAreaFilter, availableProjectFilter, localUnscheduledTasks]
  );
  useEffect(() => {
    if (
      availableProjectFilter !== "all" &&
      !availableProjectOptions.includes(availableProjectFilter)
    ) {
      setAvailableProjectFilter("all");
    }
  }, [availableProjectFilter, availableProjectOptions]);
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

  const findOpenSlotsForMinutes = (
    duration: number,
    limit = 4,
    excludeTaskId?: string
  ) => {
    const busy = [
      ...localScheduledTasks
        .filter(
          (item) =>
            item.id !== excludeTaskId &&
            item.scheduledStart &&
            item.scheduledEnd
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

  const findOpenSlots = (task: BoardTask, limit = 4) =>
    findOpenSlotsForMinutes(
      minutesForDurationBucket(task.estimatedDuration),
      limit,
      task.id
    );

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

  const scheduleRyanOsBlock = (templateId: string, start: Date) => {
    const template = ryanOsBlockTemplates.find(
      (item) => item.id === templateId
    );
    if (!template) {
      setMessage("RyanOS block not found.");
      return;
    }

    const scheduledEnd = addMinutes(start, template.minutes);
    const busy = localScheduledTasks
      .filter((item) => item.scheduledStart && item.scheduledEnd)
      .map((item) => ({
        start: item.scheduledStart as Date,
        end: item.scheduledEnd as Date
      }));

    if (
      busy.some((item) => overlaps(start, scheduledEnd, item.start, item.end))
    ) {
      setMessage("That window overlaps a placed task.");
      return;
    }

    setPendingTaskId(`template:${templateId}`);
    setMessage("");
    startTransition(async () => {
      const result = await scheduleRyanOsBlockAction(
        templateId,
        start.toISOString()
      );
      setPendingTaskId(null);
      if (result.ok) {
        setMessage(`${template.blockType} block saved.`);
        router.refresh();
      } else {
        setMessage(result.error);
      }
    });
  };

  const scheduleDroppedItem = (payload: string, slot: Date) => {
    if (payload.startsWith("template:")) {
      scheduleRyanOsBlock(payload.replace("template:", ""), slot);
      return;
    }

    scheduleTask(payload, slot);
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
            Email References
          </p>
          {selectedTask.references.length > 0 ? (
            <div className="mt-2 grid gap-2">
              {selectedTask.references.map((reference) => {
                const hasLink = isOpenableEmailReference(reference.url);
                return (
                  <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3" key={reference.id}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                          {emailProviderLabels[reference.provider] ?? "Email"}
                        </p>
                        <p className="mt-1 break-words text-sm font-medium text-slate-100">
                          {reference.title}
                        </p>
                      </div>
                      {hasLink && (
                        <a
                          className="rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-slate-100 hover:bg-white/10"
                          href={reference.url ?? ""}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Open
                        </a>
                      )}
                    </div>
                    {reference.note && (
                      <p className="mt-2 text-xs text-slate-400">{reference.note}</p>
                    )}
                    {reference.url && !hasLink && (
                      <p className="mt-2 break-words text-xs text-slate-400">{reference.url}</p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-1 text-sm font-medium">None</p>
          )}
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

  const availableWorkControls = (
    <div className="mt-3 rounded-2xl border border-border bg-muted/25 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Area
          <select
            className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm normal-case tracking-normal text-foreground outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            onChange={(event) => {
              setAvailableAreaFilter(event.target.value);
              setAvailableProjectFilter("all");
            }}
            value={availableAreaFilter}
          >
            <option value="all">All areas</option>
            {availableAreaOptions.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Project
          <select
            className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm normal-case tracking-normal text-foreground outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            onChange={(event) => setAvailableProjectFilter(event.target.value)}
            value={availableProjectFilter}
          >
            <option value="all">All projects</option>
            {availableProjectOptions.map((project) => (
              <option key={project} value={project}>
                {project}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>
          Showing {visibleUnscheduledTasks.length} of{" "}
          {localUnscheduledTasks.length}
        </span>
        <span className="rounded-full border border-border bg-background/70 px-2 py-0.5">
          Sorted by due date
        </span>
      </div>
    </div>
  );

  const oftenAnchorsPanel = (
    <div className="mt-3 rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.06] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200/80">
            Often Anchors
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Try to fit these often. Not daily debt.
          </p>
        </div>
        <span className="rounded-full border border-border/70 bg-background/70 px-2 py-0.5 text-[11px] text-muted-foreground">
          Optional
        </span>
      </div>
      <div className="mt-3 grid gap-2">
        {oftenAnchorTemplates.map((template) => {
          const pendingTemplateId = `template:${template.id}`;
          const openSlots = findOpenSlotsForMinutes(template.minutes, 2);
          return (
            <div
              className="cursor-grab rounded-xl border border-border/70 bg-background/70 p-3 outline-none transition hover:border-primary/40 focus:ring-2 focus:ring-primary/25 active:cursor-grabbing"
              draggable
              key={template.id}
              onDragStart={(event) => {
                setDraggedTaskId(pendingTemplateId);
                event.dataTransfer.setData("text/plain", pendingTemplateId);
              }}
              role="group"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{template.title}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {template.minutes} min · {template.helper[0]}
                  </p>
                </div>
                <span className="rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                  Anchor
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {openSlots.length === 0 && (
                  <span className="text-xs text-muted-foreground">
                    No clean opening today.
                  </span>
                )}
                {openSlots.map((slot, index) => (
                  <button
                    className={
                      index === 0
                        ? "rounded-full bg-emerald-300 px-3 py-1.5 text-xs font-semibold text-slate-950"
                        : "rounded-full border border-border bg-background/70 px-3 py-1.5 text-xs font-medium"
                    }
                    disabled={isPending || pendingTaskId === pendingTemplateId}
                    key={slot.toISOString()}
                    onClick={() => scheduleRyanOsBlock(template.id, slot)}
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
    </div>
  );

  const mobileTaskQueue = (
    <section className="rounded-[1.75rem] border border-emerald-300/20 bg-slate-950/95 p-4 text-white shadow-[0_18px_70px_rgba(2,6,23,0.36)] lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200/80">
            Available Work
          </p>
          <h3 className="mt-1 text-lg font-semibold">Choose only what fits</h3>
        </div>
        <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-xs text-slate-200">
          {visibleUnscheduledTasks.length} open
        </span>
      </div>
      {availableWorkControls}
      {oftenAnchorsPanel}
      <div className="mt-3 max-h-[58vh] space-y-2 overflow-y-auto pr-1">
        {visibleUnscheduledTasks.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-sm text-slate-300">
            <p>
              {localUnscheduledTasks.length === 0
                ? "No available work is waiting."
                : "No available work matches these filters."}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {localUnscheduledTasks.length === 0
                ? "Stay with the commitments already placed."
                : "Clear the filters or stay with the commitments already placed."}
            </p>
          </div>
        )}
        {visibleUnscheduledTasks.map((task) => {
          const openSlots = findOpenSlots(task, 3);
          return (
            <div
              aria-label={`Open task details for ${task.title}`}
              className={`rounded-[1.35rem] border p-3.5 outline-none transition focus:ring-2 focus:ring-emerald-300/30 ${priorityTone(task.priority)}`}
              key={task.id}
              onClick={() => setSelectedTaskId(task.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedTaskId(task.id);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm font-semibold text-white">
                    {task.title}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-300">
                    <span>{task.domain.name}</span>
                    {task.project && <span>{task.project.name}</span>}
                    <span>{formatExecutionLabel(task.priority)}</span>
                    {task.dueDate && (
                      <span>Due {formatShortDate(task.dueDate, timeZone)}</span>
                    )}
                    {task.estimatedDuration && (
                      <span className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-slate-100">
                        {formatExecutionDurationBucket(task.estimatedDuration)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {openSlots.length === 0 && (
                  <span className="text-xs text-slate-300">
                    No clean opening found today.
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

  const rykasBacklogCount = Number.parseInt(rykasBacklog, 10);
  const shouldWarnRykasBacklog =
    !Number.isNaN(rykasBacklogCount) && rykasBacklogCount >= 10;
  const buildNeedsRecipient =
    /\b(build|artifact|deck|doc|prototype|tool|page|prompt)\b/i.test(
      needleMove
    ) && !buildRecipient.trim();

  return (
    <div className="space-y-4">
      {taskDetailPanel}

      <CurrentSeasonCard season={currentSeason} />

      <MorningLaunchCard
        dailyReading={dailyReading}
        isComplete={isMorningLaunchComplete}
        onComplete={() => setIsMorningLaunchComplete(true)}
        onExpand={() => setIsMorningLaunchComplete(false)}
      />

      <TodayPrincipleCard principle={todaysPrinciple} />

      <div
        className={`space-y-4 transition duration-300 ease-out ${
          isMorningLaunchComplete
            ? "opacity-100"
            : "pointer-events-none opacity-55"
        }`}
      >
        <MorningCard
          blockTypes={blockTypes}
          buildNeedsRecipient={buildNeedsRecipient}
          buildRecipient={buildRecipient}
          decisionRule={decisionRule}
          decisionRules={decisionRules}
          hasEightyPercentItem={hasEightyPercentItem}
          needleMove={needleMove}
          presenceIntention={presenceIntention}
          rykasBacklog={rykasBacklog}
          setBuildRecipient={setBuildRecipient}
          setDecisionRule={setDecisionRule}
          setHasEightyPercentItem={setHasEightyPercentItem}
          setNeedleMove={setNeedleMove}
          setPresenceIntention={setPresenceIntention}
          setRykasBacklog={setRykasBacklog}
          setWayOfBeing={setWayOfBeing}
          shouldWarnRykasBacklog={shouldWarnRykasBacklog}
          wayOfBeing={wayOfBeing}
          wayOfBeingOptions={wayOfBeingOptions}
        />

        <HowRyanOSWorksCard />

        <section className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-slate-950 text-white shadow-[0_24px_80px_rgba(2,6,23,0.32)] lg:hidden">
          <div className="relative p-4">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(16,185,129,0.28),transparent_32%),radial-gradient(circle_at_90%_0%,rgba(245,158,11,0.20),transparent_28%)]" />
            <div className="relative">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200/80">
                Today Map
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
                    Open
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.08] p-3">
                  <p className="text-xl font-semibold">
                    {contextEvents.length}
                  </p>
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
                  No timed calendar items or placed work yet. Start with one
                  commitment or choose a task below.
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

          {mobileTaskQueue}
        </div>

        <div className="hidden items-start gap-4 lg:grid xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="flex min-h-0 flex-col rounded-2xl border bg-card p-3 shadow-sm sm:p-4 xl:max-h-[calc(100vh-9rem)]">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Calendar + placed work
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
                Drag work onto a 30-minute slot. Google events stay read-only.
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

            <TimeBlockGrid
              clearTask={clearTask}
              date={date}
              dayHeight={dayHeight}
              draggedTaskId={draggedTaskId}
              durationMinutes={durationMinutes}
              endHour={endHour}
              formatClock={formatClock}
              isPending={isPending}
              localScheduledTasks={localScheduledTasks}
              minutesFromStart={minutesFromStart}
              pendingTaskId={pendingTaskId}
              pixelsPerMinute={pixelsPerMinute}
              scheduleDroppedItem={scheduleDroppedItem}
              setDraggedTaskId={setDraggedTaskId}
              setSelectedTaskId={setSelectedTaskId}
              slotMinutes={slotMinutes}
              slotStart={slotStart}
              slots={slots}
              startHour={startHour}
              timedEvents={timedEvents}
              timeZone={timeZone}
            />
          </section>

          <aside className="space-y-3 xl:sticky xl:top-28 xl:max-h-[calc(100vh-8rem)]">
            <section
              className="flex max-h-[calc(100vh-8rem)] flex-col rounded-2xl border bg-card p-4 shadow-sm"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const taskId =
                  event.dataTransfer.getData("text/plain") || draggedTaskId;
                if (taskId && !taskId.startsWith("template:")) {
                  clearTask(taskId);
                }
              }}
            >
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Available Work
              </p>
              <h3 className="mt-1 text-lg font-semibold">
                Drag only what fits
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Drop a scheduled task here to move it back to the queue.
              </p>
              {availableWorkControls}
              {oftenAnchorsPanel}
              <div className="mt-4 min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
                {visibleUnscheduledTasks.length === 0 && (
                  <div className="rounded-2xl border border-dashed bg-muted/25 p-4 text-sm leading-6 text-muted-foreground">
                    {localUnscheduledTasks.length === 0
                      ? "No available work is waiting. Stay with the commitments already placed."
                      : "No available work matches these filters. Clear the filters or stay with the commitments already placed."}
                  </div>
                )}
                {visibleUnscheduledTasks.map((task) => (
                  <div
                    aria-label={`Open task details for ${task.title}`}
                    className="cursor-grab rounded-[1.25rem] border bg-background/65 p-3.5 shadow-sm outline-none transition hover:border-primary/40 hover:bg-background focus:ring-2 focus:ring-primary/25 active:cursor-grabbing"
                    draggable
                    key={task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                    onDragStart={(event) => {
                      setDraggedTaskId(task.id);
                      event.dataTransfer.setData("text/plain", task.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedTaskId(task.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <p className="text-sm font-semibold leading-snug">
                      {task.title}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span>{task.domain.name}</span>
                      {task.project && <span>{task.project.name}</span>}
                      <span>{formatExecutionLabel(task.priority)}</span>
                      {task.dueDate && (
                        <span>
                          Due {formatShortDate(task.dueDate, timeZone)}
                        </span>
                      )}
                      {task.estimatedDuration && (
                        <span className="rounded-full border bg-muted/40 px-2 py-0.5 text-foreground">
                          {formatExecutionDurationBucket(
                            task.estimatedDuration
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>

        <ShutdownPanel
          setShutdownOpen={setShutdownOpen}
          setShutdownShipped={setShutdownShipped}
          setShutdownTomorrow={setShutdownTomorrow}
          shutdownOpen={shutdownOpen}
          shutdownShipped={shutdownShipped}
          shutdownTomorrow={shutdownTomorrow}
        />
      </div>
    </div>
  );
}
