"use client";

type RyanOsBlockTemplate = {
  blockType: "CCHCS" | "Pipeline" | "Rykas";
  helper: string[];
  id: string;
  minutes: number;
  title: string;
};

type RyanOsBlockPaletteProps = {
  findOpenSlotsForMinutes: (duration: number, limit?: number) => Date[];
  formatClock: (value: Date, timeZone: string) => string;
  isPending: boolean;
  minutesLabel: (minutes: number) => string;
  pendingTaskId: string | null;
  scheduleRyanOsBlock: (templateId: string, start: Date) => void;
  setDraggedTaskId: (taskId: string | null) => void;
  templates: RyanOsBlockTemplate[];
  timeZone: string;
};

export function RyanOsBlockPalette({
  findOpenSlotsForMinutes,
  formatClock,
  isPending,
  minutesLabel,
  pendingTaskId,
  scheduleRyanOsBlock,
  setDraggedTaskId,
  templates,
  timeZone
}: RyanOsBlockPaletteProps) {
  return (
    <section className="rounded-[1.75rem] border bg-card/95 p-4 shadow-sm">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Today's commitments
        </p>
        <h3 className="mt-1 text-lg font-semibold">
          Place what keeps the day honest
        </h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Drag a commitment onto the calendar or use the next clean opening.
        </p>
      </div>
      <div className="mt-4 space-y-3">
        {templates.map((template) => {
          const openSlots = findOpenSlotsForMinutes(template.minutes, 3);
          return (
            <div
              className="group rounded-[1.35rem] border bg-background/75 p-3.5 shadow-sm transition hover:border-primary/40 hover:bg-background"
              draggable
              key={template.id}
              onDragStart={(event) => {
                const payload = `template:${template.id}`;
                setDraggedTaskId(payload);
                event.dataTransfer.setData("text/plain", payload);
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 h-5 w-5 shrink-0 rounded-md border border-muted-foreground/45"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {template.blockType}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {template.helper[0]}
                    </p>
                  </div>
                </div>
                <span className="rounded-full border bg-muted/40 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {minutesLabel(template.minutes)}
                </span>
              </div>
              <div className="mt-3 grid gap-1.5 border-t pt-3 text-xs text-muted-foreground">
                {template.helper.slice(1).map((item) => (
                  <p key={`${template.id}-${item}`}>- {item}</p>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {openSlots.map((slot, index) => (
                  <button
                    aria-label={`Place ${template.blockType} at ${formatClock(slot, timeZone)}`}
                    className={
                      index === 0
                        ? "min-h-9 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                        : "min-h-9 rounded-full border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-secondary"
                    }
                    disabled={
                      isPending || pendingTaskId === `template:${template.id}`
                    }
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
    </section>
  );
}
