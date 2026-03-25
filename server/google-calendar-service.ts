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

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function endOfDay(value: Date) {
  const copy = startOfDay(value);
  copy.setDate(copy.getDate() + 1);
  return copy;
}

function formatClock(value: Date) {
  return value.toLocaleTimeString("en-US", {
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

  return new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate(), hours, minutes, 0, 0);
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

export async function getTodaysCalendarEvents(referenceDate = new Date()) {
  const calendar = getGoogleCalendarClient();
  const { calendarId } = getGoogleConfigSnapshot();

  const response = await calendar.events.list({
    calendarId,
    timeMin: startOfDay(referenceDate).toISOString(),
    timeMax: endOfDay(referenceDate).toISOString(),
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
