"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Sparkles, X } from "lucide-react";
import { fillDayAction, moveBlockAction, planDoneAction, type PlanMessage } from "@/app/plan/actions";
import { v2ExtendAction } from "@/app/now/v2-actions";
import type { CoachMessage } from "@/server/v2/coach";
import { fmtLength } from "@/lib/v2/format-length";
import { cn } from "@/lib/utils";

const SNOOZE_KEY = "ryanos.coach.snooze";
const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const primary = cn("h-9 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground disabled:opacity-60", focusRing);
const secondary = cn("h-9 rounded-lg border bg-background/60 px-3 text-sm font-medium hover:bg-muted disabled:opacity-60", focusRing);

function readSnooze(): { key: string; until: number } | null {
  try {
    const raw = window.localStorage.getItem(SNOOZE_KEY);
    return raw ? (JSON.parse(raw) as { key: string; until: number }) : null;
  } catch {
    return null;
  }
}

// The Coach card on Plan: one message for right now with tap replies. "Not now" hides it on this device
// for 45 minutes (or until the message changes).
export function CoachCard({ coach, onMessage }: { coach: CoachMessage | null; onMessage: (result: PlanMessage) => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [index, setIndex] = useState(0);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    setIndex(0);
    const snooze = readSnooze();
    setHidden(Boolean(coach && snooze && snooze.key === coach.key && snooze.until > Date.now()));
  }, [coach]);
  if (!coach || hidden) return null;

  const run = (action: () => Promise<PlanMessage>) =>
    startTransition(async () => {
      onMessage(await action());
      router.refresh();
    });
  const notNow = () => {
    try { window.localStorage.setItem(SNOOZE_KEY, JSON.stringify({ key: coach.key, until: Date.now() + 45 * 60_000 })); } catch { /* private window */ }
    setHidden(true);
  };
  const startNow = (taskId: string, minutes: number) => {
    // Start at the next 5-minute mark, and never run past the end of the free gap.
    const start = new Date(Math.ceil(Date.now() / (5 * 60_000)) * 5 * 60_000);
    const limit = coach.kind === "GAP" ? Date.parse(coach.untilIso) : Infinity;
    const end = new Date(Math.min(start.getTime() + minutes * 60_000, limit));
    if (end.getTime() - start.getTime() < 10 * 60_000) { onMessage({ ok: false, message: "Not enough time left in this gap." }); return; }
    run(() => moveBlockAction(taskId, start.toISOString(), end.toISOString()));
  };

  const option = coach.kind === "GAP" ? coach.options[index % coach.options.length] : null;
  const text = coach.kind === "GAP" && option ? `You're free until ${coach.until}. ${option.title} for ${fmtLength(option.minutes)}?` : coach.text;

  return (
    <section aria-label="Coach" aria-live="polite" className="relative overflow-hidden rounded-2xl border border-primary/35 bg-gradient-to-r from-primary/15 via-primary/5 to-transparent p-4">
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary"><Sparkles className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-snug">{text}</p>
          {option && <p className="mt-0.5 text-xs text-muted-foreground">{option.why}{coach.kind === "GAP" && coach.options.length > 1 ? ` · ${index % coach.options.length + 1} of ${coach.options.length} ideas` : ""}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {coach.kind === "GAP" && option && (
              <>
                <button className={primary} disabled={pending} onClick={() => startNow(option.taskId, option.minutes)} type="button">▶ Start now</button>
                {coach.options.length > 1 && <button className={secondary} disabled={pending} onClick={() => setIndex((value) => value + 1)} type="button">Something else</button>}
              </>
            )}
            {(coach.kind === "ENDED" || coach.kind === "NOW") && (
              <button className={primary} disabled={pending} onClick={() => run(() => planDoneAction(coach.taskId))} type="button">✓ Done</button>
            )}
            {coach.kind === "ENDED" && (
              <>
                <button className={secondary} disabled={pending} onClick={() => run(() => v2ExtendAction(coach.taskId))} type="button">15 more</button>
                <button className={secondary} disabled={pending} onClick={() => run(() => moveBlockAction(coach.taskId, null, null))} type="button">Back to the list</button>
              </>
            )}
            {coach.kind === "MORNING" && <button className={primary} disabled={pending} onClick={() => run(() => fillDayAction())} type="button">✦ Plan my day</button>}
            {coach.kind === "EVENING" && <Link className={cn(primary, "inline-flex items-center")} href="/plan/wrap-up">Wrap up</Link>}
            {coach.kind !== "NOW" && <button className={secondary} disabled={pending} onClick={notNow} type="button">Not now</button>}
          </div>
        </div>
        <button aria-label="Hide the coach for now" className={cn("rounded-lg p-1.5 text-muted-foreground hover:bg-muted", focusRing)} onClick={notNow} type="button"><X className="h-4 w-4" /></button>
      </div>
    </section>
  );
}
