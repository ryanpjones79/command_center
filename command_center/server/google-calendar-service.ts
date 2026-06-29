import { getGoogleCalendarClient, getGoogleConfigSnapshot } from "@/server/google-client";

export type CalendarEvent = {
  id: string;
  summary: string;
  start: Date;
  end: Date;
  isAllDay: boolean;
  location: string | null;
};

export type WorkBlock = {
  start: Date;
  end: Date;
  minutes: number;
  label: string;
};

type TimeWindow = {
  start: Date;
  end: Date;
};

const DEFAULT_TIME_ZONE = "America/Los_Angeles";

function getBriefTimeZone() {
  return process.env.DAILY_BRIEF_TIMEZONE || DEFAULT_TIME_ZONE;
}

function getZonedDateParts(value: Date, timeZone = getBriefTimeZone()) {
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
  timeZone = getBriefTimeZone()
) {
  const desired = {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0
  };
  let candidate = new Date(Date.UTC(desired.year, desired.month - 1, desired.day, desired.hour, desired.minute, desired.second));

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const actual = getZonedDateParts(candidate, timeZone);
    const desiredWallTime = Date.UTC(desired.year, desired.month - 1, desired.day, desired.hour, desired.minute, desired.second);
    const actualWallTime = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    candidate = new Date(candidate.getTime() + desiredWallTime - actualWallTime);
  }

  return candidate;
}

function addCalendarDays(parts: { year: number; month: number; day: number }, days: number) {
  const value = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate()
  };
}

function startOfDay(value: Date, timeZone = getBriefTimeZone()) {
  const parts = getZonedDateParts(value, timeZone);
  return zonedDateTimeToUtc({ year: parts.year, month: parts.month, day: parts.day }, timeZone);
}

function endOfDay(value: Date, timeZone = getBriefTimeZone()) {
  const parts = getZonedDateParts(value, timeZone);
  return zonedDateTimeToUtc({ ...addCalendarDays(parts, 1) }, timeZone);
}

function formatClock(value: Date, timeZone = getBriefTimeZone()) {
  return value.toLocaleTimeString("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit"
  });
}

function parseGoogleDate(
  value:
    | {
        date?: string | null;
        dateTime?: string | null;
      }
    | null
    | undefined
) {
  if (!value) {
    return null;
  }

  if (value.dateTime) {
    return {
      date: new Date(value.dateTime),
      isAllDay: false
    };
  }

  if (value.date) {
    return {
      date: new Date(`${value.date}T00:00:00`),
      isAllDay: true
    };
  }

  return null;
}

function normalizeSummary(summary: string | null | undefined) {
  return summary?.trim() ?? "";
}

function isCancelledSummary(summary: string) {
  const lowered = summary.toLowerCase();
  return lowered.startsWith("canceled:") || lowered.startsWith("cancelled:");
}

function mergeIntervals(intervals: TimeWindow[]) {
  if (intervals.length === 0) {
    return [];
  }

  const sorted = [...intervals].sort((left, right) => left.start.getTime() - right.start.getTime());
  const merged: TimeWindow[] = [{ ...sorted[0] }];

  for (const interval of sorted.slice(1)) {
    const current = merged[merged.length - 1];
    if (interval.start.getTime() <= current.end.getTime()) {
      current.end = new Date(Math.max(current.end.getTime(), interval.end.getTime()));
      continue;
    }

    merged.push({ ...interval });
  }

  return merged;
}

function parseClockOnDate(referenceDate: Date, input: string) {
  const trimmed = input.trim().toLowerCase();
  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) {
    return null;
  }

  const [, rawHours, rawMinutes, meridiem] = match;
  let hours = Number.parseInt(rawHours, 10);
  const minutes = Number.parseInt(rawMinutes ?? "0", 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  if (meridiem) {
    if (meridiem === "pm" && hours < 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;
  }

  if (hours > 23 || minutes > 59) {
    return null;
  }

  const dateParts = getZonedDateParts(referenceDate);
  return zonedDateTimeToUtc({
    year: dateParts.year,
    month: dateParts.month,
    day: dateParts.day,
    hour: hours,
    minute: minutes
  });
}

export function parseWorkdayWindow(referenceDate: Date, input?: string | null) {
  if (!input?.trim()) {
    return null;
  }

  const parts = input.split(/\s*[-–—]\s*/).map((part) => part.trim()).filter(Boolean);
  if (parts.length !== 2) {
    return null;
  }

  const start = parseClockOnDate(referenceDate, parts[0]);
  const end = parseClockOnDate(referenceDate, parts[1]);
  if (!start || !end || end.getTime() <= start.getTime()) {
    return null;
  }

  return { start, end };
}

export async function getCalendarEventsForDate(referenceDate = new Date()) {
  const calendar = getGoogleCalendarClient();
  const { calendarId } = getGoogleConfigSnapshot();
  const timeZone = getBriefTimeZone();

  const response = await calendar.events.list({
    calendarId,
    timeMin: startOfDay(referenceDate, timeZone).toISOString(),
    timeMax: endOfDay(referenceDate, timeZone).toISOString(),
    timeZone,
    singleEvents: true,
    orderBy: "startTime"
  });

  return (response.data.items ?? [])
    .map((event) => {
      const start = parseGoogleDate(event.start);
      const end = parseGoogleDate(event.end);
      const summary = normalizeSummary(event.summary);

      if (!start || !end || !summary) {
        return null;
      }

      return {
        id: event.id ?? `${summary}-${start.date.toISOString()}`,
        summary,
        start: start.date,
        end: end.date,
        isAllDay: start.isAllDay,
        location: event.location ?? null,
        status: event.status ?? "confirmed"
      };
    })
    .filter((event): event is CalendarEvent & { status: string } => Boolean(event))
    .filter((event) => event.status !== "cancelled" && !isCancelledSummary(event.summary))
    .sort((left, right) => left.start.getTime() - right.start.getTime())
    .map(({ status: _status, ...event }) => event);
}

export async function getTodaysCalendarEvents(referenceDate = new Date()) {
  return getCalendarEventsForDate(referenceDate);
}

export function deriveWorkBlocksFromEvents(events: CalendarEvent[], referenceDate = new Date(), workdayWindow?: string | null) {
  const explicitWindow = parseWorkdayWindow(referenceDate, workdayWindow);
  const busy = mergeIntervals(
    events.map((event) => ({
      start: event.start,
      end: event.end
    }))
  );

  if (busy.length === 0) {
    if (!explicitWindow) {
      return [];
    }

    const minutes = Math.max(0, Math.round((explicitWindow.end.getTime() - explicitWindow.start.getTime()) / 60000));
    return minutes >= 30
      ? [
          {
            start: explicitWindow.start,
            end: explicitWindow.end,
            minutes,
            label: `${formatClock(explicitWindow.start)}-${formatClock(explicitWindow.end)}`
          }
        ]
      : [];
  }

  const gaps: WorkBlock[] = [];
  const intervals: TimeWindow[] = [...busy];

  if (explicitWindow && explicitWindow.start.getTime() < intervals[0].start.getTime()) {
    const minutes = Math.round((intervals[0].start.getTime() - explicitWindow.start.getTime()) / 60000);
    if (minutes >= 30) {
      gaps.push({
        start: explicitWindow.start,
        end: intervals[0].start,
        minutes,
        label: `${formatClock(explicitWindow.start)}-${formatClock(intervals[0].start)}`
      });
    }
  }

  for (let index = 0; index < intervals.length - 1; index += 1) {
    const current = intervals[index];
    const next = intervals[index + 1];
    const minutes = Math.round((next.start.getTime() - current.end.getTime()) / 60000);
    if (minutes < 30) {
      continue;
    }

    gaps.push({
      start: current.end,
      end: next.start,
      minutes,
      label: `${formatClock(current.end)}-${formatClock(next.start)}`
    });
  }

  const lastInterval = intervals[intervals.length - 1];
  if (explicitWindow && lastInterval.end.getTime() < explicitWindow.end.getTime()) {
    const minutes = Math.round((explicitWindow.end.getTime() - lastInterval.end.getTime()) / 60000);
    if (minutes >= 30) {
      gaps.push({
        start: lastInterval.end,
        end: explicitWindow.end,
        minutes,
        label: `${formatClock(lastInterval.end)}-${formatClock(explicitWindow.end)}`
      });
    }
  }

  return gaps;
}

export function formatCalendarEventLine(event: CalendarEvent) {
  if (event.isAllDay) {
    return `All day ${event.summary}`;
  }

  return `${formatClock(event.start)}-${formatClock(event.end)} ${event.summary}`;
}
