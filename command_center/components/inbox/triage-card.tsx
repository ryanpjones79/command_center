"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { triageAction } from "@/app/inbox/triage-actions";
import { OWNER_ACTION_AREA_LABELS, type OwnerActionArea } from "@/lib/owner-actions";
import { cn } from "@/lib/utils";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const field = "mt-1 h-11 w-full rounded-lg border bg-background px-3 text-base";

const DECISIONS: { value: string; label: string; hint: string; primary?: boolean }[] = [
  { value: "TODAY", label: "Do today", hint: "Finds a feasible slot", primary: true },
  { value: "THIS_WEEK", label: "This week", hint: "Into the week's queue" },
  { value: "WAITING", label: "Waiting on someone", hint: "Follow-up date" },
  { value: "SOMEDAY", label: "Someday", hint: "Back in 30 days" },
  { value: "REFERENCE", label: "Keep as reference", hint: "Searchable note" },
  { value: "DROP", label: "Drop", hint: "Let it go" }
];

export function TriageCard({
  item,
  lanes,
  initialLane,
  position
}: {
  item: { id: string; title: string; note: string | null; captureKind: string | null; attachmentId: string | null; ageText: string; sourceLabel: string | null; dueDate: string | null };
  lanes: OwnerActionArea[];
  initialLane: OwnerActionArea;
  position: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(item.title.startsWith("Photo capture") ? "" : item.title);
  const [lane, setLane] = useState<OwnerActionArea>(initialLane);
  const [dueDate, setDueDate] = useState(item.dueDate ?? "");
  const [eventDate, setEventDate] = useState("");
  const [waitingOn, setWaitingOn] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isPhoto = item.captureKind === "PHOTO";

  function decide(decision: string) {
    if (isPhoto && !title.trim() && decision !== "DROP") {
      setMessage("Say what needs doing first (the photo isn't read automatically).");
      return;
    }
    startTransition(async () => {
      const result = await triageAction(item.id, { decision, title, area: lane, dueDate: dueDate || null, eventDate: eventDate || null, waitingOn: waitingOn || null, followUpDate: followUpDate || null });
      setMessage(result.message);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {position} · {item.sourceLabel ?? "captured"} {item.ageText}
      </p>
      {item.attachmentId && (
        <a className="block" href={`/api/captures/${item.attachmentId}`} rel="noopener noreferrer" target="_blank">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="Captured paper or screenshot" className="max-h-80 rounded-xl border object-contain" src={`/api/captures/${item.attachmentId}`} />
        </a>
      )}
      <label className="block text-sm font-medium">
        {isPhoto ? "What do you need to do?" : "The action"}
        <input className={cn(field, "text-lg font-semibold")} onChange={(event) => setTitle(event.target.value)} placeholder={isPhoto ? "e.g. Return the permission slip" : ""} value={title} />
      </label>
      {item.note && <p className="whitespace-pre-line break-words text-sm text-muted-foreground">{item.note}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Action due by <span className="font-normal text-muted-foreground">(if real)</span>
          <input className={field} onChange={(event) => setDueDate(event.target.value)} type="date" value={dueDate} />
        </label>
        <label className="text-sm font-medium">Related event date <span className="font-normal text-muted-foreground">(not the deadline)</span>
          <input className={field} onChange={(event) => setEventDate(event.target.value)} type="date" value={eventDate} />
        </label>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Area</legend>
        <div className="flex flex-wrap gap-1.5">
          {lanes.map((value) => (
            <button aria-pressed={lane === value} className={cn("h-9 rounded-full border px-3 text-sm", lane === value ? "border-primary bg-primary/10 font-medium text-primary" : "bg-background text-muted-foreground", focusRing)} key={value} onClick={() => setLane(value)} type="button">
              {OWNER_ACTION_AREA_LABELS[value]}
            </button>
          ))}
        </div>
      </fieldset>

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Waiting on someone?</summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label className="font-medium">Who<input className={field} onChange={(event) => setWaitingOn(event.target.value)} value={waitingOn} /></label>
          <label className="font-medium">Follow up on<input className={field} onChange={(event) => setFollowUpDate(event.target.value)} type="date" value={followUpDate} /></label>
        </div>
      </details>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {DECISIONS.map((decision) => (
          <button
            className={cn("rounded-xl px-3 py-2.5 text-left text-sm font-semibold disabled:opacity-60", decision.primary ? "bg-primary text-primary-foreground" : "border bg-background hover:bg-muted", focusRing)}
            disabled={pending}
            key={decision.value}
            onClick={() => decide(decision.value)}
            type="button"
          >
            {decision.label}
            <span className={cn("block text-xs font-normal", decision.primary ? "text-primary-foreground/80" : "text-muted-foreground")}>{decision.hint}</span>
          </button>
        ))}
      </div>
      <p aria-live="polite" className="min-h-5 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
