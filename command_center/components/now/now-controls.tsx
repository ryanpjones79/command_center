"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { nowDoneAction, nowExtendAction, nowSkipAction } from "@/app/now/actions";

const SKIP_OPTIONS: { value: string; label: string }[] = [
  { value: "TOMORROW", label: "Tomorrow" },
  { value: "THIS_WEEK", label: "This week" },
  { value: "PARK", label: "Park it" },
  { value: "DROP", label: "Drop it" }
];

const buttonBase =
  "rounded-2xl px-4 py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

// Done / +15 / Skip for one block. Skip always asks where the task goes.
export function NowControls({ taskId, allowExtend = true }: { taskId: string; allowExtend?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [skipping, setSkipping] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const result = await action();
      setMessage(result.message);
      setSkipping(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <button className={`${buttonBase} bg-primary text-primary-foreground`} disabled={pending} onClick={() => run(() => nowDoneAction(taskId))} type="button">
          Done
        </button>
        {allowExtend ? (
          <button className={`${buttonBase} border bg-background`} disabled={pending} onClick={() => run(() => nowExtendAction(taskId))} type="button">
            +15 min
          </button>
        ) : (
          <span />
        )}
        <button
          aria-expanded={skipping}
          className={`${buttonBase} border bg-background`}
          disabled={pending}
          onClick={() => setSkipping((value) => !value)}
          type="button"
        >
          Skip…
        </button>
      </div>
      {skipping && (
        <div className="rounded-2xl border bg-background/70 p-2">
          <p className="px-1 pb-2 text-xs text-muted-foreground">Where does it go? Nothing rolls over on its own.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SKIP_OPTIONS.map((option) => (
              <button
                className={`${buttonBase} border bg-card py-2 text-xs`}
                disabled={pending}
                key={option.value}
                onClick={() => run(() => nowSkipAction(taskId, option.value))}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {message && (
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {message}
        </p>
      )}
    </div>
  );
}

// Keeps the Now screen current without a manual reload.
export function NowAutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => window.clearInterval(timer);
  }, [router, seconds]);
  return null;
}
