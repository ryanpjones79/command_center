"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import type { LifecycleStage } from "@/content/site-content";
import { cn } from "@/lib/utils";

type LifecycleDiagramProps = {
  stages: readonly LifecycleStage[];
  className?: string;
  title?: string;
};

export function LifecycleDiagram({ stages, className, title = "Interactive lifecycle model" }: LifecycleDiagramProps) {
  const [activeId, setActiveId] = useState(stages[1]?.id ?? stages[0]?.id);

  const activeStage = useMemo(
    () => stages.find((stage) => stage.id === activeId) ?? stages[0],
    [activeId, stages]
  );

  return (
    <div className={cn("grid gap-8 lg:grid-cols-[1.5fr_0.9fr]", className)}>
      <div className="rounded-[2rem] border border-border/70 bg-card/70 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-primary">{title}</p>
            <p className="mt-2 text-sm text-muted-foreground">Select a stage to see where brands usually need stronger Amazon structure and support.</p>
          </div>
          <span className="hidden rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-primary sm:inline-flex">
            Click a stage
          </span>
        </div>

        <div className="relative mt-8">
          <div className="absolute left-6 right-6 top-8 hidden h-px bg-gradient-to-r from-primary/20 via-border to-accent/20 lg:block" />
          <div className="grid gap-4 lg:grid-cols-5">
            {stages.map((stage, index) => {
              const isActive = stage.id === activeStage.id;

              return (
                <button
                  className={cn(
                    "relative rounded-[1.5rem] border border-border/70 bg-background/70 p-4 text-left transition-all duration-300 hover:-translate-y-1 hover:border-primary/35 hover:shadow-[0_18px_40px_rgba(15,23,42,0.12)]",
                    isActive && "border-primary/45 bg-primary/8 shadow-[0_18px_60px_rgba(16,185,129,0.14)]"
                  )}
                  key={stage.id}
                  onClick={() => setActiveId(stage.id)}
                  type="button"
                >
                  <span
                    className={cn(
                      "mb-4 flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold",
                      isActive ? "border-primary/50 bg-primary text-primary-foreground" : "border-border/80 bg-card/75 text-muted-foreground"
                    )}
                  >
                    {index + 1}
                  </span>
                  <p className="text-sm font-semibold text-foreground">{stage.title}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.22em] text-muted-foreground">{stage.kicker}</p>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{stage.summary}</p>
                  {isActive ? (
                    <motion.span
                      className="absolute inset-x-5 bottom-0 h-0.5 rounded-full bg-gradient-to-r from-primary via-emerald-300 to-accent"
                      layoutId="lifecycle-indicator"
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <motion.aside
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[2rem] border border-border/70 bg-card/85 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]"
        initial={{ opacity: 0, y: 12 }}
        key={activeStage.id}
        transition={{ duration: 0.3, ease: [0.21, 1, 0.31, 1] }}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">{activeStage.kicker}</p>
        <h3 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{activeStage.title}</h3>
        <p className="mt-4 text-sm leading-7 text-muted-foreground">{activeStage.summary}</p>

        <div className="mt-6 rounded-[1.5rem] border border-white/8 bg-background/75 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-foreground">Typical signals</p>
          <ul className="mt-4 grid gap-3 text-sm leading-6 text-muted-foreground">
            {activeStage.signals.map((signal) => (
              <li className="flex gap-3" key={signal}>
                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-primary" />
                <span>{signal}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5 grid gap-4">
          <div className="rounded-[1.4rem] border border-primary/20 bg-primary/10 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">How we step in</p>
            <p className="mt-3 text-sm leading-6 text-foreground">{activeStage.opportunity}</p>
          </div>
          <div className="rounded-[1.4rem] border border-accent/20 bg-accent/10 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-foreground">Desired outcome</p>
            <p className="mt-3 text-sm leading-6 text-foreground">{activeStage.outcome}</p>
          </div>
        </div>
      </motion.aside>
    </div>
  );
}
