"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { confirmGoalResultAction, createPersonalGoalAction } from "@/app/projects/progress/actions";
import { cn } from "@/lib/utils";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const field = "mt-1 h-11 w-full rounded-lg border bg-background px-3 text-base";

export function ConfirmResult({ goalId, unit }: { goalId: string; unit: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await confirmGoalResultAction(goalId, Number(value));
          setMessage(result.message);
          router.refresh();
        });
      }}
    >
      <label className="text-sm text-muted-foreground" htmlFor={`confirm-${goalId}`}>This period{unit ? ` (${unit})` : ""}</label>
      <input className="h-10 w-24 rounded-lg border bg-background px-3 text-base" id={`confirm-${goalId}`} inputMode="decimal" onChange={(event) => setValue(event.target.value)} type="number" value={value} />
      <button className={cn("h-10 rounded-lg border bg-background px-3 text-sm font-medium hover:bg-muted disabled:opacity-60", focusRing)} disabled={pending || value === ""} type="submit">Confirm</button>
      {message && <span aria-live="polite" className="text-xs text-muted-foreground">{message}</span>}
    </form>
  );
}

export function NewGoalForm({ projects }: { projects: { id: string; name: string }[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          const result = await createPersonalGoalAction(formData);
          setMessage(result.message);
          if (result.ok) formRef.current?.reset();
          router.refresh();
        })
      }
      className="grid gap-3 sm:grid-cols-2"
      ref={formRef}
    >
      <label className="text-sm font-medium sm:col-span-2">Goal<input className={field} name="title" placeholder="e.g. Train 3 times a week" required /></label>
      <label className="text-sm font-medium sm:col-span-2">Desired outcome<input className={field} name="desiredOutcome" placeholder="Why it matters, in one sentence" /></label>
      <label className="text-sm font-medium">Measure
        <select className={field} defaultValue="ACTION" name="measureKind">
          <option value="OUTCOME">Outcome (a result)</option>
          <option value="ACTION">Action (something I do)</option>
          <option value="CONSTRAINT">Constraint (a limit)</option>
        </select>
      </label>
      <label className="text-sm font-medium">Period
        <select className={field} defaultValue="WEEK" name="period">
          <option value="WEEK">Week</option>
          <option value="MONTH">Month</option>
          <option value="QUARTER">Quarter</option>
        </select>
      </label>
      <label className="text-sm font-medium">What is counted<input className={field} name="metricName" placeholder="e.g. Completed workouts" /></label>
      <label className="text-sm font-medium">Exactly how<input className={field} name="metricDefinition" placeholder="e.g. 30+ min sessions I actually finished" /></label>
      <label className="text-sm font-medium">Target <span className="font-normal text-muted-foreground">(only if real)</span><input className={field} inputMode="decimal" name="target" type="number" /></label>
      <label className="text-sm font-medium">Unit<input className={field} name="unit" placeholder="e.g. workouts" /></label>
      <label className="text-sm font-medium sm:col-span-2">Project <span className="font-normal text-muted-foreground">(optional)</span>
        <select className={field} defaultValue="" name="projectId">
          <option value="">None</option>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className={cn("h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60", focusRing)} disabled={pending} type="submit">Add goal</button>
        {message && <span aria-live="polite" className="text-sm text-muted-foreground">{message}</span>}
      </div>
    </form>
  );
}
