import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { NowAutoRefresh } from "@/components/now/now-controls";
import { BlockControls, RescheduleRow, ScheduleButton } from "@/components/now/v2-controls";
import { shortTitle } from "@/lib/v2/short-title";
import { QuickAddBox } from "@/components/plan/plan-board";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { localClock, localDateKey } from "@/lib/v2/zoned-time";
import { googleCalendarLoader, loadDay, recommendNow, workHref, type DayTask } from "@/server/v2/day";
import { loadQuickTargets } from "@/server/v2/board";
import { safeLink } from "@/lib/v2/readiness";

type TaskLink = { title: string; url: string; provider: string };

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

function Context({ task, timeZone, links = [] }: { task: DayTask; timeZone: string; links?: TaskLink[] }) {
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
        {(task.sourceUrl || task.note || task.title.length > 72) && <a className="text-sm font-medium underline underline-offset-4" href={`/tasks?taskId=${encodeURIComponent(task.id)}`}>Details{task.note ? " (full note)" : ""}</a>}
      </div>
      {links.length > 0 && (
        <ul aria-label="Drafts and sources" className="flex flex-wrap gap-2 text-sm">
          {links.map((link) => (
            <li key={link.url}>
              <a className="rounded-lg border px-2.5 py-1 font-medium hover:bg-muted" href={link.url} {...(/^https:/i.test(link.url) ? { rel: "noopener noreferrer", target: "_blank" } : {})}>
                {link.provider === "draft" ? "Draft" : link.provider === "source" ? "Source" : "Link"}: {link.title}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// One missed block: short title, when it was, length, details, and the reschedule controls.
function MissedItem({ task, timeZone }: { task: DayTask; timeZone: string }) {
  return (
    <li className="rounded-xl border bg-card p-3">
      <p className="break-words text-sm font-medium" title={task.title}>{shortTitle(task.title)}</p>
      <p className="text-xs text-muted-foreground">
        Was {(task.scheduledStart as Date).toLocaleDateString("en-US", { timeZone, weekday: "short" })} {localClock(task.scheduledStart as Date, timeZone)} · {minutesText(task.minutes)} ·{" "}
        <a className="underline underline-offset-2" href={`/tasks?taskId=${encodeURIComponent(task.id)}`}>Details</a>
      </p>
      <RescheduleRow taskId={task.id} />
    </li>
  );
}

export default async function NowPage() {
  const user = await requireUser();
  const [model, targets] = await Promise.all([loadDay(user.id, prisma, googleCalendarLoader()), loadQuickTargets(user.id, prisma)]);
  const { settings, now } = model;
  const tz = settings.timeZone;
  const current = model.current;
  // A missed block never takes over Now: it goes to "Needs rescheduling" below.
  const recommendation = !current && !model.currentMeeting ? recommendNow(model) : null;
  const upNext = !current && !model.currentMeeting && !recommendation ? model.blocks.find((task) => (task.scheduledStart as Date) > now) ?? null : null;
  const missed = model.endedOpen;
  const freeUntil = model.next?.start ?? null;

  const exceptions = [
    model.expired.length ? `${model.expired.length} expired offer${model.expired.length === 1 ? "" : "s"}` : null,
    model.judgmentDue.length ? `${model.judgmentDue.length} to sort` : null,
    model.stillWorthIt.length ? `${model.stillWorthIt.length} put off 3+ times` : null,
    model.sourceProblems.length ? `${model.sourceProblems.map((problem) => problem.sourceSystem.replace("_", " ").toLowerCase()).join(", ")} not reachable` : null,
    !model.calendarKnown ? "calendar not reachable" : null
  ].filter(Boolean);
  const urgentIncident = model.openIncidents[0] ?? null;
  // Drafts and sources attached to the task in focus (the same task row Plan booked).
  const focus = current ?? recommendation ?? upNext;
  const links: TaskLink[] = focus
    ? (await prisma.executionTaskReference.findMany({ where: { userId: user.id, taskId: focus.id }, select: { title: true, url: true, provider: true }, orderBy: { createdAt: "asc" }, take: 4 }))
        .map((row) => ({ title: row.title, url: safeLink(row.url) ?? "", provider: row.provider }))
        .filter((row) => row.url)
    : [];

  return (
    <div className="space-y-5">
      <NowAutoRefresh />

      {urgentIncident && urgentIncident.id !== current?.id && (
        <div className="rounded-2xl border border-rose-500/40 bg-gradient-to-r from-rose-500/15 to-transparent px-4 py-3 text-sm" role="status">
          <span className="font-semibold">Incident: </span>
          {urgentIncident.title} · <a className="font-medium underline underline-offset-4" href={workHref(urgentIncident)}>Inspect</a>
        </div>
      )}

      <section aria-label="Current action" className="hero-card rounded-[1.75rem] p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.6)] sm:p-9">
        <p className="eyebrow flex items-center gap-2">
          <span aria-hidden className="now-dot inline-block h-2 w-2 rounded-full bg-destructive" />
          Now · {localClock(now, tz)}
          {current?.isProtected && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-primary">Protected</span>}
        </p>

        {current ? (
          <>
            <h1 className="font-display mt-3 break-words text-4xl font-medium leading-[1.1] tracking-tight sm:text-5xl" title={current.title}>{shortTitle(current.title)}</h1>
            <p className="mt-3 text-base">
              <span className="font-semibold">{minutesText(Math.max(0, Math.ceil(((current.scheduledEnd as Date).getTime() - now.getTime()) / 60_000)))} left</span>
              <span className="text-muted-foreground"> · until {localClock(current.scheduledEnd as Date, tz)}</span>
            </p>
            <Context links={links} task={current} timeZone={tz} />
            {current.postponeCount >= 3 && (
              <p className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">Put off {current.postponeCount} times. Is it still worth doing? If not, Move → Drop or Park.</p>
            )}
            <div className="mt-6"><BlockControls protectedTime={current.isProtected} taskId={current.id} /></div>
          </>
        ) : model.currentMeeting ? (
          <>
            <h1 className="font-display mt-3 break-words text-4xl font-medium leading-[1.1] tracking-tight">{shortTitle(model.currentMeeting.title)}</h1>
            <p className="mt-3 text-muted-foreground">Calendar · until {localClock(model.currentMeeting.end, tz)}</p>
          </>
        ) : recommendation ? (
          <>
            <p className="mt-3 text-base text-muted-foreground">
              {model.workUntil ? `Work hours until ${localClock(model.workUntil, tz)}. One work task that fits:` : `You're free${freeUntil ? ` until ${localClock(freeUntil, tz)}` : ""}. One thing that fits:`}
            </p>
            <h1 className="font-display mt-2 break-words text-4xl font-medium leading-[1.1] tracking-tight sm:text-5xl" title={recommendation.title}>{shortTitle(recommendation.title)}</h1>
            <p className="mt-2 text-sm text-muted-foreground">About {minutesText(recommendation.minutes)}</p>
            <Context links={links} task={recommendation} timeZone={tz} />
            <div className="mt-6"><ScheduleButton label="Do it now" startNow taskId={recommendation.id} /></div>
            <p className="mt-2 text-xs text-muted-foreground">Or keep the time free; buffer is part of the plan.</p>
          </>
        ) : upNext ? (
          <>
            <p className="mt-3 text-base text-muted-foreground">{model.workUntil ? `Work hours until ${localClock(model.workUntil, tz)}. ` : ""}Next on your calendar at {localClock(upNext.scheduledStart as Date, tz)}:</p>
            <h1 className="font-display mt-2 break-words text-4xl font-medium leading-[1.1] tracking-tight sm:text-5xl" title={upNext.title}>{shortTitle(upNext.title)}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{minutesText(Math.round(((upNext.scheduledEnd as Date).getTime() - (upNext.scheduledStart as Date).getTime()) / 60_000))} · {localClock(upNext.scheduledStart as Date, tz)}–{localClock(upNext.scheduledEnd as Date, tz)}</p>
            <Context links={links} task={upNext} timeZone={tz} />
          </>
        ) : (
          <>
            <h1 className="font-display mt-3 text-4xl font-medium leading-[1.1] tracking-tight">
              {model.workUntil ? `Work hours until ${localClock(model.workUntil, tz)}.` : `Nothing needs you${freeUntil ? ` until ${localClock(freeUntil, tz)}` : " right now"}.`}
            </h1>
            <p className="mt-3 text-muted-foreground">{model.workUntil ? "Protected for CCHCS. " : "Keep the buffer, or "}<Link className="font-medium text-foreground underline underline-offset-4" href="/plan">{model.workUntil ? "Plan the evening" : "look at your plan"}</Link>.</p>
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
          <Link className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-sm font-medium hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="/time-blocks#decisions">
            {exceptions.join(" · ")} →
          </Link>
        )}
      </div>

      {missed.length > 0 && (
        <section aria-label="Needs rescheduling" className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
          <h2 className="text-sm font-semibold">Needs rescheduling <span className="font-normal text-muted-foreground">· {missed.length} missed block{missed.length === 1 ? "" : "s"}</span></h2>
          <ul className="mt-2 space-y-3">
            {missed.slice(0, 5).map((task) => <MissedItem key={task.id} task={task} timeZone={tz} />)}
          </ul>
          {missed.length > 5 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">Show {missed.length - 5} more</summary>
              <ul className="mt-2 space-y-3">
                {missed.slice(5, 25).map((task) => <MissedItem key={task.id} task={task} timeZone={tz} />)}
              </ul>
            </details>
          )}
        </section>
      )}

      <section aria-label="Add a task" className="rounded-2xl border bg-card p-3 sm:p-4">
        <QuickAddBox targets={targets} timeZone={tz} />
        <p className="mt-1 text-xs text-muted-foreground">
          Loose idea or photo? <Link className="underline underline-offset-2" href="/inbox/capture">Capture it</Link> instead. <Link className="ml-2 font-medium underline underline-offset-2" href="/plan">Open Plan →</Link>
        </p>
      </section>
    </div>
  );
}
