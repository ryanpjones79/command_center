"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptPlanAction, batchCapturesAction, closeDayAction } from "@/app/time-blocks/v2-actions";
import { cn } from "@/lib/utils";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; message: string } | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    startTransition(async () => {
      setMessage(await fn());
      router.refresh();
    });
  return { pending, message, run };
}

function Note({ message }: { message: { ok: boolean; message: string } | null }) {
  return <p aria-live="polite" className={cn("min-h-5 text-sm", message && !message.ok ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>{message?.message}</p>;
}

export function AcceptPlanButton({ items }: { items: { taskId: string; start: string; end: string }[] }) {
  const { pending, message, run } = useAction();
  return (
    <div className="space-y-2">
      <button className={cn("h-12 rounded-xl bg-primary px-6 text-base font-semibold text-primary-foreground disabled:opacity-60", focusRing)} disabled={pending || items.length === 0} onClick={() => run(() => acceptPlanAction(items))} type="button">
        {pending ? "Planning…" : `Accept plan (${items.length})`}
      </button>
      <Note message={message} />
    </div>
  );
}

export function BatchCaptures({ count, defaultDate }: { count: number; defaultDate: string }) {
  const { pending, message, run } = useAction();
  const [date, setDate] = useState(defaultDate);
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        run(() => batchCapturesAction(date));
      }}
    >
      <label className="text-sm">
        Review today&apos;s {count} capture{count === 1 ? "" : "s"} on
        <input className="mt-1 block h-11 rounded-lg border bg-background px-3 text-base" min={defaultDate} onChange={(event) => setDate(event.target.value)} type="date" value={date} />
      </label>
      <button className={cn("h-11 rounded-xl border bg-background px-4 text-sm font-medium hover:bg-muted disabled:opacity-60", focusRing)} disabled={pending} type="submit">Set review batch</button>
      <div className="basis-full"><Note message={message} /></div>
    </form>
  );
}

export function CloseDayButton({ canClose }: { canClose: boolean }) {
  const { pending, message, run } = useAction();
  return (
    <div className="space-y-2">
      <button className={cn("h-12 rounded-xl px-6 text-base font-semibold disabled:opacity-60", canClose ? "bg-primary text-primary-foreground" : "border bg-background", focusRing)} disabled={pending} onClick={() => run(closeDayAction)} type="button">
        Close the day
      </button>
      <Note message={message} />
    </div>
  );
}
