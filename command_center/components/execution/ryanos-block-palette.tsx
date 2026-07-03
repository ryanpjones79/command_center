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
    <section className="rounded-[1.5rem] border bg-card/95 p-4 shadow-sm">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Required Daily Blocks
        </p>
        <h3 className="mt-1 text-lg font-semibold">Drag or add to the board</h3>
      </div>
      <div className="mt-3 space-y-2">
        {templates.map((template) => {
          const openSlots = findOpenSlotsForMinutes(template.minutes, 3);
          return (
            <div
              className="rounded-2xl border bg-background/80 p-3 shadow-sm"
              draggable
              key={template.id}
              onDragStart={(event) => {
                const payload = `template:${template.id}`;
                setDraggedTaskId(payload);
                event.dataTransfer.setData("text/plain", payload);
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{template.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {template.blockType} / {minutesLabel(template.minutes)}
                  </p>
                </div>
                <span className="rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {template.blockType}
                </span>
              </div>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                {template.helper.map((item) => (
                  <p key={`${template.id}-${item}`}>- {item}</p>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {openSlots.map((slot, index) => (
                  <button
                    className={
                      index === 0
                        ? "rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                        : "rounded-full border px-3 py-1.5 text-xs font-medium text-muted-foreground"
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
