"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { createRoutineAction, setRoutineActiveAction } from "@/app/time-blocks/routine-actions";
import { cn } from "@/lib/utils";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const field = "mt-1 h-11 w-full rounded-lg border bg-background px-3 text-base";
const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" }
];

export function NewRoutineForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          const result = await createRoutineAction(formData);
          setMessage(result.message);
          if (result.ok) formRef.current?.reset();
          router.refresh();
        })
      }
      className="grid gap-3 sm:grid-cols-2"
      ref={formRef}
    >
      <label className="text-sm font-medium sm:col-span-2">What<input className={field} name="title" placeholder="e.g. School pickup, Workout, Bedtime with the kids" required /></label>
      <label className="text-sm font-medium">Area
        <select className={field} defaultValue="KIDS" name="area">
          <option value="KIDS">Kids (protected)</option>
          <option value="HEALTH">Health (protected)</option>
          <option value="PERSONAL">Personal</option>
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm font-medium">Time <span className="font-normal text-muted-foreground">(blank = any time)</span><input className={field} name="time" type="time" /></label>
        <label className="text-sm font-medium">Minutes<input className={field} defaultValue={30} inputMode="numeric" min={5} name="duration" type="number" /></label>
      </div>
      <fieldset className="sm:col-span-2">
        <legend className="mb-1.5 text-sm font-medium">Days</legend>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((day) => (
            <label className="relative" key={day.value}>
              <input className="peer sr-only" defaultChecked={day.value >= 1 && day.value <= 5} name="days" type="checkbox" value={day.value} />
              <span className={cn("inline-flex h-10 min-w-12 cursor-pointer items-center justify-center rounded-full border px-3 text-sm text-muted-foreground peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:font-medium peer-checked:text-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring")}>{day.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className={cn("h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60", focusRing)} disabled={pending} type="submit">Add to standard week</button>
        {message && <span aria-live="polite" className="text-sm text-muted-foreground">{message}</span>}
      </div>
    </form>
  );
}

export function RoutineToggle({ routineId, active }: { routineId: string; active: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      className={cn("h-10 rounded-lg border bg-background px-3 text-sm hover:bg-muted disabled:opacity-60", focusRing)}
      disabled={pending}
      onClick={() => startTransition(async () => { await setRoutineActiveAction(routineId, !active); router.refresh(); })}
      type="button"
    >
      {active ? "Pause" : "Resume"}
    </button>
  );
}
