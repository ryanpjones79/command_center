"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addSuggestedRoutinesAction, saveRoutineAction, setRoutineActiveAction, type RoutineMessage } from "@/app/plan/routine-actions";
import { areaLook } from "@/lib/v2/area-look";
import { fmtLength } from "@/lib/v2/format-length";
import { cn } from "@/lib/utils";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const pill = (on: boolean) =>
  cn("inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors", on ? "border-transparent bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground", focusRing);

const LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const LENGTHS = [15, 30, 45, 60, 90, 120];
const WHEN = [
  { value: "", label: "Any time" },
  { value: "MORNING", label: "Mornings" },
  { value: "AFTERNOON", label: "Afternoons" },
  { value: "EVENING", label: "Evenings" },
  { value: "AT", label: "Set time" }
];

export type AreaOption = { slug: string; name: string };
export type RoutineValue = { id: string | null; title: string; area: string; weekdays: number[]; minutes: number; timesPerWeek: number | null; timeOfDay: string | null; startMin: number | null };

function toClock(minutes: number | null) {
  if (minutes === null) return "";
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

// Add or edit one routine: what, area, how long, which days, how often, and when in the day.
export function RoutineForm({ initial, areas, onDone }: { initial: RoutineValue; areas: AreaOption[]; onDone?: (message: RoutineMessage) => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(initial.title);
  const [area, setArea] = useState(initial.area || areas[0]?.slug || "");
  const [days, setDays] = useState<number[]>(initial.weekdays);
  const [minutes, setMinutes] = useState(initial.minutes);
  const [times, setTimes] = useState<number | null>(initial.timesPerWeek);
  const [when, setWhen] = useState(initial.startMin !== null ? "AT" : initial.timeOfDay ?? "");
  const [clock, setClock] = useState(toClock(initial.startMin) || "17:00");
  const [message, setMessage] = useState<RoutineMessage | null>(null);

  const save = () =>
    startTransition(async () => {
      const [h, m] = clock.split(":").map(Number);
      const result = await saveRoutineAction(initial.id, {
        title,
        area,
        weekdays: days,
        minutes,
        timesPerWeek: times,
        timeOfDay: when && when !== "AT" ? when : null,
        startMin: when === "AT" && Number.isFinite(h) ? h * 60 + (m || 0) : null
      });
      setMessage(result);
      if (result.ok) {
        if (!initial.id) { setTitle(""); }
        onDone?.(result);
        router.refresh();
      }
    });

  const label = "block text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground";
  return (
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); save(); }}>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="block">
          <span className={label}>Routine</span>
          <input className={cn("mt-1.5 h-11 w-full rounded-xl border bg-background px-3 text-base", focusRing)} maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. eBay listing, Walk, Rykas sourcing" value={title} />
        </label>
        <label className="block">
          <span className={label}>Area</span>
          <select className={cn("mt-1.5 h-11 w-full rounded-xl border bg-background px-3 text-sm sm:w-48", focusRing)} onChange={(event) => setArea(event.target.value)} value={area}>
            {areas.map((option) => <option key={option.slug} value={option.slug}>{option.name}</option>)}
          </select>
        </label>
      </div>

      <fieldset>
        <legend className={label}>How long each time</legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {LENGTHS.map((value) => <button aria-pressed={minutes === value} className={pill(minutes === value)} key={value} onClick={() => setMinutes(value)} type="button">{fmtLength(value)}</button>)}
        </div>
      </fieldset>

      <fieldset>
        <legend className={label}>Which days it can happen</legend>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {LETTERS.map((letter, index) => (
            <button
              aria-label={DAY_NAMES[index]}
              aria-pressed={days.includes(index)}
              className={cn("h-9 w-9 rounded-full border text-xs font-semibold transition-colors", days.includes(index) ? "border-transparent bg-foreground text-background" : "text-muted-foreground hover:bg-muted", focusRing)}
              key={index}
              onClick={() => setDays((current) => (current.includes(index) ? current.filter((day) => day !== index) : [...current, index].sort()))}
              type="button"
            >
              {letter}
            </button>
          ))}
          <button className="ml-1 text-xs text-muted-foreground underline underline-offset-2" onClick={() => setDays([1, 2, 3, 4, 5])} type="button">weekdays</button>
          <button className="text-xs text-muted-foreground underline underline-offset-2" onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])} type="button">every day</button>
        </div>
      </fieldset>

      <fieldset>
        <legend className={label}>How often</legend>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <button aria-pressed={times === null} className={pill(times === null)} onClick={() => setTimes(null)} type="button">Each of those days</button>
          {[1, 2, 3, 4, 5].filter((value) => value < days.length).map((value) => (
            <button aria-pressed={times === value} className={pill(times === value)} key={value} onClick={() => setTimes(value)} type="button">{value}× a week</button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className={label}>When in the day</legend>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {WHEN.map((option) => <button aria-pressed={when === option.value} className={pill(when === option.value)} key={option.value} onClick={() => setWhen(option.value)} type="button">{option.label}</button>)}
          {when === "AT" && (
            <label className="flex items-center gap-2 text-sm">
              <span className="sr-only">Time</span>
              <input className={cn("h-9 rounded-full border bg-background px-3 text-sm", focusRing)} onChange={(event) => setClock(event.target.value)} step={900} type="time" value={clock} />
            </label>
          )}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">{when === "AT" ? "Booked at this time on its days, ahead of other work." : "Plan my day fits it into a free gap after your to-dos."}</p>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button className={cn("h-10 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50", focusRing)} disabled={pending || !title.trim() || days.length === 0} type="submit">
          {pending ? "Saving…" : initial.id ? "Save changes" : "Add routine"}
        </button>
        {message && <p aria-live="polite" className={cn("text-sm", message.ok ? "text-muted-foreground" : "font-medium text-destructive")}>{message.message}</p>}
      </div>
    </form>
  );
}

export function RoutineRowControls({ routine, areas, active }: { routine: RoutineValue; areas: AreaOption[]; active: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <div className="flex shrink-0 items-center gap-1.5">
        <button aria-expanded={open} className={cn("h-9 rounded-lg border px-3 text-sm font-medium hover:bg-muted", open && "bg-muted", focusRing)} onClick={() => setOpen((value) => !value)} type="button">{open ? "Close" : "Edit"}</button>
        <button
          className={cn("h-9 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50", focusRing)}
          disabled={pending}
          onClick={() => startTransition(async () => { await setRoutineActiveAction(routine.id as string, !active); router.refresh(); })}
          type="button"
        >
          {active ? "Pause" : "Resume"}
        </button>
      </div>
      {open && (
        <div className="basis-full rounded-xl border bg-background/50 p-4">
          <RoutineForm areas={areas} initial={routine} onDone={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}

export type Suggestion = { key: string; title: string; area: string; note: string; have: boolean };

export function SuggestedRoutines({ suggestions }: { suggestions: Suggestion[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [picked, setPicked] = useState<string[]>(suggestions.filter((item) => !item.have).map((item) => item.key));
  const [message, setMessage] = useState<RoutineMessage | null>(null);
  return (
    <div className="space-y-3">
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {suggestions.map((item) => {
          const on = picked.includes(item.key);
          return (
            <li key={item.key}>
              <button
                aria-pressed={on}
                className={cn("flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors disabled:opacity-50", on ? "border-primary/60 bg-primary/10" : "hover:bg-muted", focusRing)}
                disabled={item.have}
                onClick={() => setPicked((current) => (current.includes(item.key) ? current.filter((key) => key !== item.key) : [...current, item.key]))}
                type="button"
              >
                <span aria-hidden className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px]", on ? "border-transparent bg-primary text-primary-foreground" : "")}>{on ? "✓" : ""}</span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2 font-medium"><span aria-hidden className={cn("h-2 w-2 rounded-full", areaLook(item.area).dot)} />{item.title}</span>
                  <span className="block text-xs text-muted-foreground">{item.have ? "Already added" : item.note}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <button
          className={cn("h-10 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50", focusRing)}
          disabled={pending || picked.length === 0}
          onClick={() => startTransition(async () => { const result = await addSuggestedRoutinesAction(picked); setMessage(result); router.refresh(); })}
          type="button"
        >
          {pending ? "Adding…" : `Add ${picked.length || ""} routine${picked.length === 1 ? "" : "s"}`}
        </button>
        <p className="text-xs text-muted-foreground">You can change any of them after.</p>
        {message && <p aria-live="polite" className={cn("text-sm", message.ok ? "text-muted-foreground" : "font-medium text-destructive")}>{message.message}</p>}
      </div>
    </div>
  );
}
