"use client";

import { motion, useReducedMotion } from "framer-motion";

const reactiveItems = ["Price drift", "Too many sellers", "Weak listings", "Internal overload"] as const;
const controlItems = ["Clear plan", "Stronger content", "Better control", "Cleaner growth path"] as const;

export function ChannelTransformationVisual() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="premium-surface ambient-grid grain-overlay relative overflow-hidden rounded-[2.5rem] border border-border/70 p-6 shadow-[0_28px_90px_rgba(15,23,42,0.14)] sm:p-8">
      <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
      <div className="absolute -right-10 top-8 h-40 w-40 rounded-full bg-primary/18 blur-3xl" />
      <div className="absolute -left-6 bottom-10 h-28 w-28 rounded-full bg-accent/16 blur-3xl" />

      <div className="relative">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">Amazon Channel View</p>
            <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">From marketplace noise to channel control.</p>
          </div>
          <div className="hidden rounded-full border border-white/10 bg-background/80 px-4 py-2 text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground sm:inline-flex">
            Chaos to control
          </div>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
          <div className="rounded-[1.9rem] border border-white/8 bg-background/80 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Reactive</p>
            <div className="mt-5 grid gap-3">
              {reactiveItems.map((item, index) => (
                <motion.div
                  animate={
                    prefersReducedMotion
                      ? undefined
                      : {
                          y: [0, index % 2 === 0 ? -4 : 4, 0],
                          rotate: [0, index % 2 === 0 ? -1 : 1, 0]
                        }
                  }
                  className="rounded-[1.2rem] border border-white/8 bg-card/80 px-4 py-3 text-sm text-foreground shadow-[0_14px_30px_rgba(15,23,42,0.08)]"
                  key={item}
                  transition={{ duration: 4 + index * 0.4, ease: "easeInOut", repeat: Infinity }}
                >
                  {item}
                </motion.div>
              ))}
            </div>
          </div>

          <div className="flex justify-center">
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
              <motion.div
                animate={prefersReducedMotion ? undefined : { scale: [0.92, 1.06, 0.92], opacity: [0.35, 0.7, 0.35] }}
                className="absolute inset-2 rounded-full border border-primary/30"
                transition={{ duration: 3.2, ease: "easeInOut", repeat: Infinity }}
              />
              <motion.div
                animate={prefersReducedMotion ? undefined : { x: [-10, 10, -10] }}
                className="h-px w-10 bg-gradient-to-r from-primary/20 via-primary to-primary/20"
                transition={{ duration: 2.8, ease: "easeInOut", repeat: Infinity }}
              />
            </div>
          </div>

          <div className="rounded-[1.9rem] border border-primary/20 bg-[linear-gradient(160deg,rgba(16,185,129,0.1),rgba(15,23,42,0.03))] p-5 shadow-[0_22px_48px_rgba(16,185,129,0.12)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Structured</p>
            <div className="mt-5 grid gap-3">
              {controlItems.map((item, index) => (
                <motion.div
                  animate={prefersReducedMotion ? undefined : { y: [0, -3, 0] }}
                  className="rounded-[1.2rem] border border-primary/20 bg-background/85 px-4 py-3 text-sm font-medium text-foreground shadow-[0_16px_36px_rgba(15,23,42,0.08)]"
                  key={item}
                  transition={{ duration: 3.4 + index * 0.25, ease: "easeInOut", repeat: Infinity, delay: index * 0.08 }}
                >
                  {item}
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 hidden flex-wrap gap-2 sm:flex">
          {["Launch", "Cleanup", "Listings", "Management"].map((item) => (
            <span className="rounded-full border border-white/10 bg-background/75 px-3 py-1 text-xs font-medium text-foreground" key={item}>
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
