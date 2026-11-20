"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { v2DoneAction, v2ExtendAction, v2InterruptAction, v2PostponeAction, v2ScheduleAction, type ActionMessage } from "@/app/now/v2-actions";
import { cn } from "@/lib/utils";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const secondary = cn("h-11 rounded-xl border bg-background px-4 text-sm font-medium hover:bg-muted disabled:opacity-60", focusRing);

export const MOVE_CHOICES: { value: string; label: string }[] = [
  { value: "TOMORROW", label: "Tomorrow" },
  { value: "THIS_WEEK", label: "This week" },
  { value: "REVIEW", label: "Review in a week" },
  { value: "PARK", label: "Park (30 days)" },
  { value: "DROP", label: "Drop it" }
];

function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<ActionMessage | null>(null);
  function run(action: () => Promise<ActionMessage>) {
    startTransition(async () => {
      const result = await action();
      setMessage(result);
      router.refresh();
    });
  }
  return { pending, message, setMessage, run };
}

function Message({ message }: { message: ActionMessage | null }) {
  return (
    <p aria-live="polite" className={cn("min-h-5 text-sm", message && !message.ok ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>
      {message?.message}
    </p>
  );
}

export function MoveMenu({ taskId, onDone }: { taskId: string; onDone?: (message: ActionMessage) => void }) {
  const { pending, message, run } = useRun();
  useEffect(() => {
    if (message && onDone) onDone(message);
  }, [message, onDone]);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {MOVE_CHOICES.map((choice) => (
        <button className={secondary} disabled={pending} key={choice.value} onClick={() => run(() => v2PostponeAction(taskId, choice.value))} type="button">
          {choice.label}
        </button>
      ))}
    </div>
  );
}

// Controls for the block in progress (or an ended block being closed out).
export function BlockControls({ taskId, protectedTime = false, ended = false }: { taskId: string; protectedTime?: boolean; ended?: boolean }) {
  const { pending, message, setMessage, run } = useRun();
  const [panel, setPanel] = useState<"none" | "interrupt" | "move">("none");
  const [minutesLeft, setMinutesLeft] = useState("");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          className={cn("h-12 min-w-36 rounded-xl bg-primary px-6 text-base font-semibold text-primary-foreground shadow-sm hover:opacity-95 disabled:opacity-60", focusRing)}
          disabled={pending}
          onClick={() => run(() => v2DoneAction(taskId))}
          type="button"
        >
          {protectedTime ? "Kept it" : "Done"}
        </button>
        {!ended && (
          <button className={secondary} disabled={pending} onClick={() => run(() => v2ExtendAction(taskId))} type="button">
            +15 min
          </button>
        )}
        <button aria-expanded={panel === "interrupt"} className={secondary} disabled={pending} onClick={() => setPanel(panel === "interrupt" ? "none" : "interrupt")} type="button">
          {ended ? "Not finished" : "Interrupted / blocked"}
        </button>
        <button aria-expanded={panel === "move"} className={secondary} disabled={pending} onClick={() => setPanel(panel === "move" ? "none" : "move")} type="button">
          Move…
        </button>
      </div>

      {panel === "interrupt" && (
        <form
          className="flex flex-wrap items-end gap-2 rounded-xl border bg-muted/40 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => v2InterruptAction(taskId, minutesLeft ? Number(minutesLeft) : null));
            setPanel("none");
          }}
        >
          <label className="text-sm">
            Minutes still needed <span className="text-muted-foreground">(optional)</span>
            <input className="mt-1 block h-11 w-32 rounded-lg border bg-background px-3 text-base" inputMode="numeric" min={5} onChange={(event) => setMinutesLeft(event.target.value)} type="number" value={minutesLeft} />
          </label>
          <button className={secondary} disabled={pending} type="submit">Keep the rest for later</button>
        </form>
      )}
      {panel === "move" && <MoveMenu onDone={(result) => { setMessage(result); setPanel("none"); }} taskId={taskId} />}
      <Message message={message} />
    </div>
  );
}

// "Do it now" / "Schedule": books the best feasible slot; shows the real
// trade-off when it doesn't fit and asks before displacing anything.
export function ScheduleButton({ taskId, label = "Schedule", startNow = false }: { taskId: string; label?: string; startNow?: boolean }) {
  const { pending, message, run } = useRun();
  const displaceIds = (message?.detail as { displaceIds?: string[] } | null)?.displaceIds;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button className={cn("h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60", focusRing)} disabled={pending} onClick={() => run(() => v2ScheduleAction(taskId, undefined, startNow))} type="button">
          {pending ? "Checking…" : label}
        </button>
        {displaceIds && displaceIds.length > 0 && (
          <button className={secondary} disabled={pending} onClick={() => run(() => v2ScheduleAction(taskId, displaceIds, startNow))} type="button">
            Move them and schedule
          </button>
        )}
      </div>
      <Message message={message} />
    </div>
  );
}
