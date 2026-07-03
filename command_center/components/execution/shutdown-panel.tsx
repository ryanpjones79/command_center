"use client";

type ShutdownPanelProps = {
  setShutdownOpen: (value: string) => void;
  setShutdownShipped: (value: string) => void;
  setShutdownTomorrow: (value: string) => void;
  shutdownOpen: string;
  shutdownShipped: string;
  shutdownTomorrow: string;
};

export function ShutdownPanel({
  setShutdownOpen,
  setShutdownShipped,
  setShutdownTomorrow,
  shutdownOpen,
  shutdownShipped,
  shutdownTomorrow
}: ShutdownPanelProps) {
  return (
    <section className="rounded-[1.5rem] border bg-card/95 p-4 shadow-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            End-of-Day Shutdown
          </p>
          <h3 className="mt-1 text-lg font-semibold">Close the loop</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Capture only what matters for tomorrow.
        </p>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="grid gap-1.5 text-sm">
          Shipped
          <textarea
            className="min-h-[92px] rounded-xl border bg-background px-3 py-2 text-sm"
            onChange={(event) => setShutdownShipped(event.target.value)}
            placeholder="What actually shipped?"
            value={shutdownShipped}
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          Still open
          <textarea
            className="min-h-[92px] rounded-xl border bg-background px-3 py-2 text-sm"
            onChange={(event) => setShutdownOpen(event.target.value)}
            placeholder="What remains open?"
            value={shutdownOpen}
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          Likely Needle Move tomorrow
          <textarea
            className="min-h-[92px] rounded-xl border bg-background px-3 py-2 text-sm"
            onChange={(event) => setShutdownTomorrow(event.target.value)}
            placeholder="Completed result for tomorrow."
            value={shutdownTomorrow}
          />
        </label>
      </div>
    </section>
  );
}
