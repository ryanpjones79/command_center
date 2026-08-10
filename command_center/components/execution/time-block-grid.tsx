"use client";

type GridCalendarEvent = {
  id: string;
  summary: string;
  start: Date;
  end: Date;
};

type GridTask = {
  id: string;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  title: string;
};

type PositionedCalendarEvent = GridCalendarEvent & {
  column: number;
  columnCount: number;
};

type TimeBlockGridProps = {
  clearTask: (taskId: string) => void;
  date: Date;
  dayHeight: number;
  draggedTaskId: string | null;
  durationMinutes: (start: Date, end: Date) => number;
  endHour: number;
  formatClock: (value: Date, timeZone: string) => string;
  isPending: boolean;
  localScheduledTasks: GridTask[];
  minutesFromStart: (value: Date, timeZone: string) => number;
  pendingTaskId: string | null;
  pixelsPerMinute: number;
  scheduleDroppedItem: (payload: string, slot: Date) => void;
  setDraggedTaskId: (taskId: string | null) => void;
  setSelectedTaskId: (taskId: string | null) => void;
  slotMinutes: number;
  slotStart: (date: Date, index: number, timeZone: string) => Date;
  slots: Date[];
  startHour: number;
  timedEvents: GridCalendarEvent[];
  timeZone: string;
};

function layoutCalendarEvents(events: GridCalendarEvent[]): PositionedCalendarEvent[] {
  const sorted = [...events].sort((left, right) => {
    const startDelta = left.start.getTime() - right.start.getTime();
    if (startDelta !== 0) return startDelta;
    return right.end.getTime() - left.end.getTime();
  });
  const positioned: PositionedCalendarEvent[] = [];
  let group: GridCalendarEvent[] = [];
  let groupEnd: Date | null = null;

  const flushGroup = () => {
    if (group.length === 0) return;

    const columns: Date[] = [];
    const groupPositions = group.map((event) => {
      const column = columns.findIndex((columnEnd) => columnEnd <= event.start);
      const resolvedColumn = column === -1 ? columns.length : column;
      columns[resolvedColumn] = event.end;
      return { event, column: resolvedColumn };
    });

    positioned.push(
      ...groupPositions.map(({ event, column }) => ({
        ...event,
        column,
        columnCount: columns.length
      }))
    );
    group = [];
    groupEnd = null;
  };

  for (const event of sorted) {
    if (!groupEnd || event.start >= groupEnd) {
      flushGroup();
      group = [event];
      groupEnd = event.end;
      continue;
    }

    group.push(event);
    if (event.end > groupEnd) {
      groupEnd = event.end;
    }
  }

  flushGroup();
  return positioned.sort((left, right) => {
    const startDelta = left.start.getTime() - right.start.getTime();
    if (startDelta !== 0) return startDelta;
    return left.column - right.column;
  });
}

export function TimeBlockGrid({
  clearTask,
  date,
  dayHeight,
  draggedTaskId,
  durationMinutes,
  endHour,
  formatClock,
  isPending,
  localScheduledTasks,
  minutesFromStart,
  pendingTaskId,
  pixelsPerMinute,
  scheduleDroppedItem,
  setDraggedTaskId,
  setSelectedTaskId,
  slotMinutes,
  slotStart,
  slots,
  startHour,
  timedEvents,
  timeZone
}: TimeBlockGridProps) {
  const positionedEvents = layoutCalendarEvents(timedEvents);

  return (
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
                  event.dataTransfer.getData("text/plain") || draggedTaskId;
                if (taskId) {
                  scheduleDroppedItem(taskId, slot);
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

          {positionedEvents.map((event) => {
            const top = Math.max(
              0,
              minutesFromStart(event.start, timeZone) * pixelsPerMinute
            );
            const height =
              durationMinutes(event.start, event.end) * pixelsPerMinute;
            const laneWidth = 48 / event.columnCount;
            const left = `calc(0.75rem + ${event.column * laneWidth}%)`;
            const width = `calc(${laneWidth}% - 0.25rem)`;
            return (
              <div
                className="absolute z-10 overflow-hidden rounded-lg border border-amber-400/70 bg-amber-300/90 p-2 text-amber-950 shadow-sm"
                key={event.id}
                style={{ top, height, left, width }}
                title={`${event.summary} ${formatClock(event.start, timeZone)}-${formatClock(event.end, timeZone)}`}
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
              minutesFromStart(task.scheduledStart, timeZone) * pixelsPerMinute
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
  );
}
