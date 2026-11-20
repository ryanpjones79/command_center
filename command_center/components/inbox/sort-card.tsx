"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { sortIdeaAction } from "@/app/inbox/actions";
import { OWNER_ACTION_AREA_LABELS, type OwnerActionArea } from "@/lib/owner-actions";

const CHOICES: { value: string; label: string; hint: string; primary?: boolean }[] = [
  { value: "NOW", label: "Do today", hint: "Next open slot", primary: true },
  { value: "THIS_WEEK", label: "This week", hint: "Into the queue" },
  { value: "SOMEDAY", label: "Someday", hint: "Back in 30 days" },
  { value: "NOTE", label: "Keep as note", hint: "Reference only" },
  { value: "DROP", label: "Drop", hint: "Let it go" }
];

// One idea at a time; it leaves the inbox only with a decision.
export function SortCard({
  idea,
  initialLane,
  lanes,
  position
}: {
  idea: { id: string; idea: string; ageText: string };
  initialLane: OwnerActionArea;
  lanes: OwnerActionArea[];
  position: string;
}) {
  const router = useRouter();
  const [lane, setLane] = useState<OwnerActionArea>(initialLane);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {position} · captured {idea.ageText}
        </p>
        <p className="mt-2 whitespace-pre-line break-words text-xl font-semibold leading-7 sm:text-2xl">{idea.idea}</p>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-muted-foreground">Area</legend>
        <div className="flex flex-wrap gap-1.5">
          {lanes.map((value) => (
            <button
              aria-pressed={lane === value}
              className={`rounded-full border px-3 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${lane === value ? "border-primary bg-primary/10 text-primary" : "bg-background text-muted-foreground"}`}
              key={value}
              onClick={() => setLane(value)}
              type="button"
            >
              {OWNER_ACTION_AREA_LABELS[value]}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {CHOICES.map((choice) => (
          <button
            className={`rounded-2xl px-3 py-2.5 text-left text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${choice.primary ? "bg-primary text-primary-foreground" : "border bg-background"}`}
            disabled={pending}
            key={choice.value}
            onClick={() =>
              startTransition(async () => {
                const result = await sortIdeaAction(idea.id, choice.value, lane);
                setMessage(result.message);
                if (result.ok) router.refresh();
              })
            }
            type="button"
          >
            {choice.label}
            <span className={`block text-[11px] font-normal ${choice.primary ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{choice.hint}</span>
          </button>
        ))}
      </div>
      {message && (
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {message}
        </p>
      )}
    </div>
  );
}
