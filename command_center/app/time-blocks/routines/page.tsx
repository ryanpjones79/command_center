import type { Metadata } from "next";
import Link from "next/link";
import { NewRoutineForm, RoutineToggle } from "@/components/today/routine-controls";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { parseWeekdays } from "@/server/v2/routines";

export const metadata: Metadata = { title: "Standard week" };
export const dynamic = "force-dynamic";

const DAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const AREA_LABEL: Record<string, string> = { family: "Kids", kids: "Kids", health: "Health", admin: "Personal" };

function time(minutes: number | null) {
  if (minutes === null) return "Any time";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${((hours + 11) % 12) + 1}:${String(mins).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

function days(value: string) {
  const list = parseWeekdays(value);
  if (list.join(",") === "1,2,3,4,5") return "Weekdays";
  if (list.join(",") === "0,6") return "Weekends";
  if (list.length === 7) return "Every day";
  return [...list.filter((day) => day !== 0), ...list.filter((day) => day === 0)].map((day) => DAY_LABEL[day]).join(", ");
}

export default async function RoutinesPage() {
  const user = await requireUser();
  const routines = await prisma.protectedRoutine.findMany({ where: { userId: user.id }, orderBy: [{ active: "desc" }, { startMin: "asc" }, { title: "asc" }] });

  return (
    <div className="space-y-5">
      <div>
        <Link className="inline-flex min-h-10 items-center text-sm text-muted-foreground underline-offset-4 hover:underline" href="/time-blocks">← Today</Link>
        <h1 className="text-2xl font-semibold tracking-tight">Standard week</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kids and health time that should happen every week. RyanOS places it each day before work, so you don&apos;t have to remember to schedule it.
        </p>
      </div>

      <section aria-label="Your routines" className="rounded-2xl border bg-card">
        {routines.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">Nothing yet. Start with the things that keep getting squeezed: pickup, workouts, bedtime.</p>
        ) : (
          <ul className="divide-y">
            {routines.map((routine) => (
              <li className={`flex flex-wrap items-center justify-between gap-3 px-5 py-4 ${routine.active ? "" : "opacity-60"}`} key={routine.id}>
                <div className="min-w-0">
                  <p className="break-words font-medium">{routine.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {[AREA_LABEL[routine.domainSlug] ?? routine.domainSlug, days(routine.weekdays), time(routine.startMin), `${routine.durationMin} min`, routine.active ? null : "paused"].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <RoutineToggle active={routine.active} routineId={routine.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="new-routine" className="rounded-2xl border bg-card p-5 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold" id="new-routine">Add a routine</h2>
        <NewRoutineForm />
      </section>
    </div>
  );
}
