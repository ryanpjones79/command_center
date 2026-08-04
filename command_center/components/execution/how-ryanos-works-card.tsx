"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const storageKey = "ryanos-how-it-works-collapsed";

export function HowRyanOSWorksCard() {
  const [isCollapsed, setIsCollapsed] = useState(true);

  useEffect(() => {
    const storedValue = window.localStorage.getItem(storageKey);
    setIsCollapsed(storedValue === null ? true : storedValue === "true");
  }, []);

  const toggleCollapsed = () => {
    setIsCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(storageKey, String(next));
      return next;
    });
  };

  return (
    <section className="rounded-[1.5rem] border bg-card/80 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            How RyanOS Works
          </p>
          {isCollapsed && (
            <p className="mt-1 text-sm text-muted-foreground">
              Paper is where you think. RyanOS is where you commit.
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            className="min-h-10 rounded-full border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary/25"
            href="/library/method"
          >
            Learn More
          </Link>
          <button
            aria-expanded={!isCollapsed}
            className="min-h-10 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary/25"
            onClick={toggleCollapsed}
            type="button"
          >
            {isCollapsed ? "Expand" : "Collapse"}
          </button>
        </div>
      </div>
      <div
        className={`grid transition-all duration-300 ease-out ${
          isCollapsed
            ? "grid-rows-[0fr] opacity-0"
            : "mt-4 grid-rows-[1fr] opacity-100"
        }`}
      >
        <div className="overflow-hidden">
          <div className="grid gap-3 text-sm leading-6 text-muted-foreground sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="rounded-xl border bg-background/60 p-3">
              <p className="font-medium text-foreground">
                Paper is where you think.
              </p>
              <p className="mt-1">RyanOS is where you commit.</p>
            </div>
            <div className="rounded-xl border bg-background/60 p-3">
              <p>Reflect on paper.</p>
              <p>Choose one completed result.</p>
              <p>Schedule the work realistically.</p>
              <p>Put the phone down.</p>
              <p>Return only to adjust or close the day.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
