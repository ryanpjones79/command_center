import type { Metadata } from "next";
import Link from "next/link";
import { DeferredOwnerFeed } from "@/components/execution/deferred-owner-feed";
import { OwnerActionsPanel } from "@/components/execution/owner-actions-panel";
import { BlockControls, MoveMenu, ScheduleButton } from "@/components/now/v2-controls";
import { AcceptPlanButton, BatchCaptures, CloseDayButton } from "@/components/today/today-actions";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { addZonedDays, localClock, localDateKey } from "@/lib/v2/zoned-time";
import { googleCalendarLoader, loadDay, workHref, type DayTask } from "@/server/v2/day";
import { proposeDay } from "@/server/v2/plan";
import { buildShutdown } from "@/server/v2/shutdown";
import { loadRykasFeed } from "@/server/today-feed/rykas-feed";

export const metadata: Metadata = { title: "Today" };
export const dynamic = "force-dynamic";

function Section({ id, title, hint, children }: { id?: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id ? `${id}-title` : undefined} className="scroll-mt-20 rounded-2xl border bg-card p-5 sm:p-6" id={id}>
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight" id={id ? `${id}-title` : undefined}>{title}</h2>
        {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function TaskLine({ task, timeZone, extra }: { task: DayTask; timeZone: string; extra?: string }) {
  return (
    <div className="min-w-0">
      <p className="break-words font-medium">{task.title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {[task.projectName, task.domainName, task.dueDate ? `due ${task.dueDate.toLocaleDateString("en-US", { timeZone, month: "short", day: "numeric" })}` : null, task.expiresAt ? `expires ${localClock(task.expiresAt, timeZone)} ${task.expiresAt.toLocaleDateString("en-US", { timeZone, month: "short", day: "numeric" })}` : null, extra]
          .filter(Boolean)
          .join(" · ")}
        {" · "}
        <a className="-my-2 inline-flex min-h-10 items-center px-1 underline underline-offset-2" href={workHref(task)} {...(task.sourceUrl ? { target: "_blank", rel: "noopener noreferrer" } : {})}>open</a>
      </p>
    </div>
  );
}

export default async function TodayPage() {
  const user = await requireUser();
  const calendar = googleCalendarLoader();
  const model = await loadDay(user.id, prisma, calendar);
  const [proposal, rykasFeed] = await Promise.all([proposeDay(user.id, prisma, calendar, model.now), loadRykasFeed(user.id, prisma)]);
  const shutdown = buildShutdown(model);
  const tz = model.settings.timeZone;
  const now = model.now;
  const afternoon = now.getTime() >= model.day.start.getTime() + (model.settings.workdayEndMin - 90) * 60_000;
  const timeline = [
    ...model.meetings.map((meeting) => ({ key: `m-${meeting.start.toISOString()}-${meeting.title}`, start: meeting.start, end: meeting.end, title: meeting.title, kind: "Meeting" as const, task: null as DayTask | null })),
    ...model.blocks.map((task) => ({ key: task.id, start: task.scheduledStart as Date, end: task.scheduledEnd as Date, title: task.title, kind: task.isProtected ? ("Protected" as const) : ("Work" as const), task }))
  ].sort((a, b) => a.start.getTime() - b.start.getTime());
  const decisions = model.endedOpen.length + model.expired.length + model.stillWorthIt.length + model.dueForReview.length;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Today</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{now.toLocaleDateString("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" })}</h1>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link className="rounded-xl border px-3 py-2 hover:bg-muted" href="/time-blocks/routines">Standard week</Link>
          <Link className="rounded-xl border px-3 py-2 hover:bg-muted" href="/time-blocks/grid">Detailed grid</Link>
          <a className={afternoon ? "rounded-xl bg-primary px-3 py-2 font-semibold text-primary-foreground" : "rounded-xl border px-3 py-2 hover:bg-muted"} href="#close">Close day</a>
        </div>
      </header>

      {proposal.items.length > 0 && (
        <Section hint="Built from protected time, promises, deadlines and the projects you chose this week, with room left for interruptions." id="plan" title="Proposed plan">
          <ol className="divide-y rounded-xl border">
            {proposal.items.map((item) => (
              <li className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3" key={item.task.id}>
                <span className="w-32 shrink-0 text-sm font-semibold tabular-nums">{localClock(item.slot.start, tz)}–{localClock(item.slot.end, tz)}</span>
                <span className="min-w-0 flex-1 break-words">{item.task.title}</span>
                <span className="text-xs text-muted-foreground">{item.reason}</span>
              </li>
            ))}
          </ol>
          {proposal.unplaced.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
              <p className="text-sm font-semibold">Didn&apos;t fit ({proposal.unplaced.length})</p>
              <ul className="mt-2 space-y-3">
                {proposal.unplaced.slice(0, 5).map((entry) => (
                  <li className="space-y-2" key={entry.task.id}>
                    <TaskLine extra={entry.reason} task={entry.task} timeZone={tz} />
                    <MoveMenu taskId={entry.task.id} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-4">
            <AcceptPlanButton items={proposal.items.map((item) => ({ taskId: item.task.id, start: item.slot.start.toISOString(), end: item.slot.end.toISOString() }))} />
          </div>
        </Section>
      )}

      <Section title="Day">
        {timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing scheduled{model.calendarKnown ? "" : " (calendar not reachable)"}.</p>
        ) : (
          <ol className="space-y-1.5">
            {timeline.map((entry) => {
              const isNow = entry.start <= now && entry.end > now;
              return (
                <li className={`flex items-baseline gap-4 rounded-xl px-3 py-2 ${isNow ? "bg-primary/10 ring-1 ring-primary/30" : ""}`} key={entry.key}>
                  <span className="w-32 shrink-0 text-sm tabular-nums text-muted-foreground">{localClock(entry.start, tz)}–{localClock(entry.end, tz)}</span>
                  <span className="min-w-0 flex-1 break-words">{entry.title}</span>
                  <span className={`text-xs ${entry.kind === "Protected" ? "font-semibold text-primary" : "text-muted-foreground"}`}>{entry.kind}</span>
                </li>
              );
            })}
          </ol>
        )}
      </Section>

      {decisions > 0 && (
        <Section hint="Each needs an outcome or a new plan. Nothing rolls over on its own." id="decisions" title={`Decisions (${decisions})`}>
          <ul className="space-y-5">
            {model.endedOpen.map((task) => (
              <li className="space-y-2" key={`ended-${task.id}`}>
                <TaskLine extra={`ended ${localClock(task.scheduledEnd as Date, tz)}`} task={task} timeZone={tz} />
                <BlockControls ended protectedTime={task.isProtected} taskId={task.id} />
              </li>
            ))}
            {model.expired.map((task) => (
              <li className="space-y-2" key={`expired-${task.id}`}>
                <TaskLine extra="expired: it can't be done later" task={task} timeZone={tz} />
                <MoveMenu taskId={task.id} />
              </li>
            ))}
            {model.stillWorthIt.filter((task) => !model.expired.includes(task)).map((task) => (
              <li className="space-y-2" key={`worth-${task.id}`}>
                <TaskLine extra={`put off ${task.postponeCount} times: still worth doing?`} task={task} timeZone={tz} />
                <div className="flex flex-wrap gap-3"><ScheduleButton taskId={task.id} /></div>
                <MoveMenu taskId={task.id} />
              </li>
            ))}
            {model.dueForReview.filter((task) => !model.stillWorthIt.includes(task) && !model.expired.includes(task)).map((task) => (
              <li className="space-y-2" key={`review-${task.id}`}>
                <TaskLine extra="back for review" task={task} timeZone={tz} />
                <ScheduleButton taskId={task.id} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {model.queue.filter((task) => !proposal.items.some((item) => item.task.id === task.id)).length > 0 && (
        <Section hint="Accepted for today but not given a time yet." title="Queue">
          <ul className="space-y-4">
            {model.queue.filter((task) => !proposal.items.some((item) => item.task.id === task.id)).slice(0, 12).map((task) => (
              <li className="space-y-2" key={`q-${task.id}`}>
                <TaskLine extra={`~${task.minutes} min`} task={task} timeZone={tz} />
                <ScheduleButton taskId={task.id} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section hint="About two minutes: settle today's commitments, then stop." id="close" title="Close the day">
        <div className="space-y-5">
          {shutdown.unfinished.length > 0 ? (
            <div>
              <p className="mb-2 text-sm font-semibold">Unfinished today ({shutdown.unfinished.length})</p>
              <ul className="space-y-4">
                {shutdown.unfinished.map((task) => (
                  <li className="space-y-2" key={`u-${task.id}`}>
                    <TaskLine task={task} timeZone={tz} />
                    <BlockControls ended protectedTime={task.isProtected} taskId={task.id} />
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Every commitment from today has an outcome or a date.</p>
          )}
          {shutdown.cantWait.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold">Can&apos;t wait past tomorrow</p>
              <ul className="space-y-3">
                {shutdown.cantWait.map((task) => (
                  <li className="space-y-2" key={`c-${task.id}`}>
                    <TaskLine task={task} timeZone={tz} />
                    <ScheduleButton taskId={task.id} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {shutdown.unreliable.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800 dark:text-amber-200">
              {shutdown.unreliable.map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
          )}
          {shutdown.newCaptures.length > 0 && (
            <BatchCaptures count={shutdown.newCaptures.length} defaultDate={localDateKey(addZonedDays(now, 1, tz), tz)} />
          )}
          <CloseDayButton canClose={shutdown.canClose} />
        </div>
      </Section>

      <details className="rounded-2xl border bg-card/60 p-4">
        <summary className="cursor-pointer text-sm font-semibold">From your apps (live readings)</summary>
        <div className="mt-3">
          <OwnerActionsPanel deferred={<DeferredOwnerFeed area="AP_TRADER" endpoint="/api/today/ap-trader" />} feeds={[rykasFeed]} />
        </div>
      </details>
    </div>
  );
}
