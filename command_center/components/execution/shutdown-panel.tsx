"use client";

import { useState } from "react";

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
  const [notebookPages, setNotebookPages] = useState("");

  return (
    <section className="rounded-[1.75rem] border bg-card/95 p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Shutdown
          </p>
          <h3 className="mt-1 text-xl font-semibold">Leave tomorrow clean</h3>
        </div>
        <p className="max-w-sm text-xs leading-5 text-muted-foreground">
          Capture the residue. Do not rebuild the day here.
        </p>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-4">
        <label className="grid gap-1.5 text-sm">
          What shipped?
          <textarea
            className="min-h-[104px] rounded-2xl border bg-background px-3 py-2 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-primary/25"
            onChange={(event) => setShutdownShipped(event.target.value)}
            placeholder="Finished, sent, decided, or moved."
            value={shutdownShipped}
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          What remains open?
          <textarea
            className="min-h-[104px] rounded-2xl border bg-background px-3 py-2 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-primary/25"
            onChange={(event) => setShutdownOpen(event.target.value)}
            placeholder="Only what needs a future decision."
            value={shutdownOpen}
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          What matters tomorrow?
          <textarea
            className="min-h-[104px] rounded-2xl border bg-background px-3 py-2 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-primary/25"
            onChange={(event) => setShutdownTomorrow(event.target.value)}
            placeholder="Completed result for tomorrow."
            value={shutdownTomorrow}
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          Notebook pages to index later
          <textarea
            className="min-h-[104px] rounded-2xl border bg-background px-3 py-2 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-primary/25"
            onChange={(event) => setNotebookPages(event.target.value)}
            placeholder="Optional page numbers or short cues."
            value={notebookPages}
          />
        </label>
      </div>
    </section>
  );
}
