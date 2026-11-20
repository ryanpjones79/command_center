"use client";

import { useState, useTransition } from "react";
import { scheduleOwnerCardAction } from "@/app/now/actions";
import type { OwnerActionCard } from "@/lib/owner-actions";

// Turns a Needs-you card into a block on today's grid (next open slot).
export function ScheduleCardButton({ card }: { card: OwnerActionCard }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button
        className="rounded-full border bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        disabled={pending || Boolean(message)}
        onClick={() =>
          startTransition(async () => {
            const result = await scheduleOwnerCardAction({
              cardId: card.id,
              area: card.area,
              title: card.title,
              whyNow: card.whyNow,
              minutes: card.minutes,
              href: card.href,
              taskId: card.taskId
            });
            setMessage(result.message);
          })
        }
        type="button"
      >
        {pending ? "Scheduling…" : "Schedule it"}
      </button>
      {message && (
        <span aria-live="polite" className="text-xs text-muted-foreground">
          {message}
        </span>
      )}
    </div>
  );
}
