import type { Metadata } from "next";
import Link from "next/link";
import { RoutineForm, RoutineRowControls, SuggestedRoutines } from "@/components/plan/routine-form";
import { fmtLength } from "@/lib/v2/format-length";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { areaLook } from "@/lib/v2/area-look";
import { SUGGESTED_ROUTINES } from "@/server/v2/habits";
import { isTimeOfDay, loadRoutineProgress, parseWeekdays, TIME_OF_DAY_LABEL, weeklyTarget } from "@/server/v2/routines";

export const metadata: Metadata = { title: "Routines" };
export const dynamic = "force-dynamic";

const DAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function clock(minutes: number) {
  const hours = Math.floor(minutes / 60);
  return `${((hours + 11) % 12) + 1}:${String(minutes % 60).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

function daysText(value: string) {
  const list = parseWeekdays(value);
  if (list.join(",") === "1,2,3,4,5") return "weekdays";
  if (list.join(",") === "0,6") return "weekends";
  if (list.length === 7) return "any day";
  return [...list.filter((day) => day !== 0), ...list.filter((day) => day === 0)].map((day) => DAY_LABEL[day]).join(", ");
}

export default async function RoutinesPage() {
  const user = await requireUser();
  const [routines, domains, progress] = await Promise.all([
    prisma.protectedRoutine.findMany({ where: { userId: user.id }, orderBy: [{ active: "desc" }, { createdAt: "asc" }] }),
    prisma.executionDomain.findMany({ where: { userId: user.id }, select: { slug: true, name: true }, orderBy: { name: "asc" } }),
    loadRoutineProgress(user.id, prisma)
  ]);
  const areaName = new Map(domains.map((domain) => [domain.slug, domain.name]));
  const titles = new Set(routines.filter((routine) => routine.active).map((routine) => routine.title.toLowerCase()));
  const suggestions = SUGGESTED_ROUTINES.map((item) => ({ key: item.key, title: item.title, area: item.area, note: item.note, have: titles.has(item.title.toLowerCase()) }));
  const showStarters = suggestions.some((item) => !item.have);
  const active = routines.filter((routine) => routine.active);
  const weekDone = active.reduce((sum, routine) => sum + (progress.get(routine.id)?.doneMinutes ?? 0), 0);
  const weekTarget = active.reduce((sum, routine) => sum + (progress.get(routine.id)?.targetMinutes ?? 0), 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link className="text-sm text-muted-foreground underline-offset-4 hover:underline" href="/plan">← Plan</Link>
          <h1 className="font-display mt-1 text-3xl font-medium tracking-tight sm:text-4xl">Routines</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Regular work you fit in when there&apos;s time. Plan my day books your to-dos first, then fills the free gaps with these, the ones furthest behind for the week first.
          </p>
        </div>
        {weekTarget > 0 && (
          <div className="rounded-2xl border bg-card px-4 py-3 text-right">
            <p className="text-xs text-muted-foreground">This week</p>
            <p className="text-2xl font-bold tabular-nums tracking-tight">{fmtLength(weekDone)} <span className="text-sm font-medium text-muted-foreground">of {fmtLength(weekTarget)}</span></p>
          </div>
        )}
      </header>

      {showStarters && (
        <section aria-labelledby="starters" className="rounded-2xl border bg-card p-4 sm:p-5">
          <h2 className="text-base font-semibold" id="starters">Start with these</h2>
          <p className="mb-3 mt-0.5 text-sm text-muted-foreground">Tap to choose, then add. Nothing is added until you do.</p>
          <SuggestedRoutines suggestions={suggestions} />
        </section>
      )}

      <section aria-label="Your routines" className="overflow-hidden rounded-2xl border bg-card">
        {routines.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">No routines yet.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {routines.map((routine) => {
              const week = progress.get(routine.id);
              const target = weeklyTarget(routine);
              const when = routine.startMin !== null ? `at ${clock(routine.startMin)}` : isTimeOfDay(routine.timeOfDay) ? TIME_OF_DAY_LABEL[routine.timeOfDay].toLowerCase() : "any time";
              const often = routine.timesPerWeek ? `${routine.timesPerWeek}× a week, ${daysText(routine.weekdays)}` : daysText(routine.weekdays) === "any day" ? "every day" : daysText(routine.weekdays);
              const pct = week && week.target ? Math.min(100, Math.round((week.done / week.target) * 100)) : 0;
              return (
                <li className={`flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 sm:px-5 ${routine.active ? "" : "opacity-55"}`} key={routine.id}>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-semibold">
                      <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${areaLook(routine.domainSlug).dot}`} />
                      <span className="truncate">{routine.title}</span>
                      <span className="shrink-0 text-xs font-normal text-muted-foreground">{areaName.get(routine.domainSlug) ?? routine.domainSlug}</span>
                      {!routine.active && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">paused</span>}
                    </p>
                    <p className="mt-0.5 pl-4 text-sm text-muted-foreground">{fmtLength(routine.durationMin)} · {often} · {when}</p>
                  </div>
                  {routine.active && (
                    <div className="w-full sm:w-40">
                      <p className="text-xs tabular-nums text-muted-foreground sm:text-right">{week?.done ?? 0} of {target} this week</p>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${areaLook(routine.domainSlug).dot}`} style={{ width: `${pct}%` }} /></div>
                    </div>
                  )}
                  <RoutineRowControls
                    active={routine.active}
                    areas={domains}
                    routine={{ id: routine.id, title: routine.title, area: routine.domainSlug, weekdays: parseWeekdays(routine.weekdays), minutes: routine.durationMin, timesPerWeek: routine.timesPerWeek, timeOfDay: routine.timeOfDay, startMin: routine.startMin }}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="new-routine" className="rounded-2xl border bg-card p-4 sm:p-5">
        <h2 className="mb-4 text-base font-semibold" id="new-routine">Add a routine</h2>
        <RoutineForm areas={domains} initial={{ id: null, title: "", area: "", weekdays: [1, 2, 3, 4, 5], minutes: 60, timesPerWeek: null, timeOfDay: null, startMin: null }} />
      </section>
    </div>
  );
}
