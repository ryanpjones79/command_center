import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { NowAutoRefresh } from "@/components/now/now-controls";
import { BlockControls, ScheduleButton } from "@/components/now/v2-controls";
import { QuickAddBox } from "@/components/plan/plan-board";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { localClock, localDateKey } from "@/lib/v2/zoned-time";
import { googleCalendarLoader, loadDay, recommendNow, workHref, type DayTask } from "@/server/v2/day";
import { loadQuickTargets } from "@/server/v2/board";

export const metadata: Metadata = { title: "Now" };
export const dynamic = "force-dynamic";

function minutesText(value: number) {
  if (value < 60) return `${value} min`;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function whyHere(task: DayTask, timeZone: string) {
  if (task.isProtected) return "Protected time. It was placed before work.";
  if (task.expiresAt) return `The opportunity expires ${localClock(task.expiresAt, timeZone)} ${localDateKey(task.expiresAt, timeZone) === localDateKey(new Date(), timeZone) ? "today" : task.expiresAt.toLocaleDateString("en-US", { timeZone, month: "short", day: "numeric" })}.`;
  if (task.dueDate) return `Due ${task.dueDate.toLocaleDateString("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" })}.`;
  if (task.projectName) return `Next step for ${task.projectName}.`;
  return null;
}

function WorkLink({ task }: { task: DayTask }) {
  const external = Boolean(task.sourceUrl);
  return (
    <a
      className="inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      href={workHref(task)}
      {...(external ? { rel: "noopener noreferrer", target: "_blank" } : {})}
    >
      {external ? `Open in ${task.sourceSystem?.replace("_", " ").toLowerCase() ?? "source"}` : "Open task"}
      <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
      {external && <span className="sr-only">(opens in a new tab)</span>}
    </a>
  );
}

function Context({ task, timeZone }: { task: DayTask; timeZone: string }) {
  const why = whyHere(task, timeZone);
  const sourceUnknown = task.sourceSystem && task.sourceSystem !== "CAPTURE" && (task.sourceState === "GONE" || task.sourceState === "UNKNOWN");
  return (
    <div className="mt-4 space-y-2 text-[15px] leading-6">
      {task.doneWhen && (
        <p>
          <span className="font-semibold">Done when: </span>
          {task.doneWhen}
        </p>
      )}
      {why && <p className="text-muted-foreground">{why}</p>}
      {sourceUnknown && (
        <p className="text-amber-700 dark:text-amber-300">The source no longer shows this or couldn't be reached. Your commitment is kept; check the source before closing it.</p>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <WorkLink task={task} />
        {task.projectName && <span className="text-sm text-muted-foreground">Project: {task.projectName}</span>}
      </div>
    </div>
  );
}

export default async function NowPage() {
  const user = await requireUser();
  const [model, targets] = await Promise.all([loadDay(user.id, prisma, googleCalendarLoader()), loadQuickTargets(user.id, prisma)]);
  const { settings, now } = model;
  const tz = settings.timeZone;
  const current = model.current;
  const closeOut = !current ? model.endedOpen[0] ?? null : null;
  const recommendation = !current && !closeOut && !model.currentMeeting ? recommendNow(model) : null;
  const freeUntil = model.next?.start ?? null;

  const exceptions = [
    model.endedOpen.length > (closeOut ? 1 : 0) ? `${model.endedOpen.length - (closeOut ? 1 : 0)} ended block${model.endedOpen.length - (closeOut ? 1 : 0) === 1 ? "" : "s"} to close` : null,
    model.expired.length ? `${model.expired.length} expired offer${model.expired.length === 1 ? "" : "s"}` : null,
    model.judgmentDue.length ? `${model.judgmentDue.length} to sort` : null,
    model.stillWorthIt.length ? `${model.stillWorthIt.length} put off 3+ times` : null,
    model.sourceProblems.length ? `${model.sourceProblems.map((problem) => problem.sourceSystem.replace("_", " ").toLowerCase()).join(", ")} not reachable` : null,
    !model.calendarKnown ? "calendar not reachable" : null
  ].filter(Boolean);
  const urgentIncident = model.openIncidents[0] ?? null;

  return (
    <div className="space-y-5">
      <NowAutoRefresh />

      {urgentIncident && urgentIncident.id !== current?.id && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm" role="status">
          <span className="font-semibold">Incident: </span>
          {urgentIncident.title} · <a className="font-medium underline underline-offset-4" href={workHref(urgentIncident)}>Inspect</a>
        </div>
      )}

      <section aria-label="Current action" className="rounded-[1.75rem] border bg-card p-6 shadow-[0_1px_0_rgba(0,0,0,0.02),0_12px_40px_-24px_rgba(0,0,0,0.35)] sm:p-9">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Now · {localClock(now, tz)}
          {current?.isProtected && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-primary">Protected</span>}
        </p>

        {current ? (
          <>
            <h1 className="font-display mt-3 break-words text-4xl font-medium leading-[1.1] tracking-tight sm:text-5xl">{current.title}</h1>
            <p className="mt-3 text-base">
              <span className="font-semibold">{minutesText(Math.max(0, Math.ceil(((current.scheduledEnd as Date).getTime() - now.getTime()) / 60_000)))} left</span>
              <span className="text-muted-foreground"> · until {localClock(current.scheduledEnd as Date, tz)}</span>
            </p>
            <Context task={current} timeZone={tz} />
            {current.postponeCount >= 3 && (
              <p className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">Put off {current.postponeCount} times. Is it still worth doing? If not, Move → Drop or Park.</p>
            )}
            <div className="mt-6"><BlockControls protectedTime={current.isProtected} taskId={current.id} /></div>
          </>
        ) : closeOut ? (
          <>
            <p className="mt-3 text-sm font-semibold text-amber-700 dark:text-amber-300">Ended at {localClock(closeOut.scheduledEnd as Date, tz)} without an outcome</p>
            <h1 className="font-display mt-2 break-words text-4xl font-medium leading-[1.1] tracking-tight sm:text-5xl">{closeOut.title}</h1>
            <Context task={closeOut} timeZone={tz} />
            <div className="mt-6"><BlockControls ended protectedTime={closeOut.isProtected} taskId={closeOut.id} /></div>
          </>
        ) : model.currentMeeting ? (
          <>
            <h1 className="font-display mt-3 break-words text-4xl font-medium leading-[1.1] tracking-tight">{model.currentMeeting.title}</h1>
            <p className="mt-3 text-muted-foreground">Calendar · until {localClock(model.currentMeeting.end, tz)}</p>
          </>
        ) : recommendation ? (
          <>
            <p className="mt-3 text-base text-muted-foreground">
              You&apos;re free{freeUntil ? ` until ${localClock(freeUntil, tz)}` : ""}. One thing that fits:
            </p>
            <h1 className="font-display mt-2 break-words text-4xl font-medium leading-[1.1] tracking-tight sm:text-5xl">{recommendation.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">About {minutesText(recommendation.minutes)}</p>
            <Context task={recommendation} timeZone={tz} />
            <div className="mt-6"><ScheduleButton label="Do it now" startNow taskId={recommendation.id} /></div>
            <p className="mt-2 text-xs text-muted-foreground">Or keep the time free; buffer is part of the plan.</p>
          </>
        ) : (
          <>
            <h1 className="font-display mt-3 text-4xl font-medium leading-[1.1] tracking-tight">
              Nothing needs you{freeUntil ? ` until ${localClock(freeUntil, tz)}` : " right now"}.
            </h1>
            <p className="mt-3 text-muted-foreground">Keep the buffer, or look at <Link className="font-medium text-foreground underline underline-offset-4" href="/plan">your plan</Link>.</p>
          </>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-1 text-sm">
        <p>
          <span className="text-muted-foreground">Next: </span>
          {model.next ? (
            <span className="font-medium">{localClock(model.next.start, tz)} · {model.next.title}</span>
          ) : (
            <span className="text-muted-foreground">nothing else scheduled today</span>
          )}
        </p>
        {exceptions.length > 0 && (
          <Link className="rounded-full border px-3 py-1 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="/time-blocks#decisions">
            {exceptions.join(" · ")} →
          </Link>
        )}
      </div>

      <section aria-label="Add a task" className="rounded-2xl border bg-card/70 p-3 sm:p-4">
        <QuickAddBox targets={targets} timeZone={tz} />
        <p className="mt-1 text-xs text-muted-foreground">
          Loose idea or photo? <Link className="underline underline-offset-2" href="/inbox/capture">Capture it</Link> instead. <Link className="ml-2 font-medium underline underline-offset-2" href="/plan">Open Plan →</Link>
        </p>
      </section>
    </div>
  );
}
