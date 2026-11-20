import type { Metadata } from "next";
import Link from "next/link";
import { DeferredOwnerFeed } from "@/components/execution/deferred-owner-feed";
import { OwnerActionsPanel } from "@/components/execution/owner-actions-panel";
import { OwnerFeedBlock } from "@/components/execution/owner-feed-block";
import { CaptureBox } from "@/components/inbox/capture-box";
import { NowAutoRefresh, NowControls } from "@/components/now/now-controls";
import { OWNER_ACTION_AREA_LABELS } from "@/lib/owner-actions";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { getTimeBlockPlannerData } from "@/server/execution-service";
import { getCalendarDayRange } from "@/server/google-calendar-service";
import { loadInboxFeed } from "@/server/inbox/inbox-feed";
import { deriveNowState, skipCount, type NowTask } from "@/server/now/planning";
import { loadLifeFeeds, toLifeTasks } from "@/server/today-feed/life-feeds";
import { loadRykasFeed } from "@/server/today-feed/rykas-feed";

export const metadata: Metadata = { title: "Now" };
export const dynamic = "force-dynamic";

function clock(value: Date, timeZone: string) {
  return value.toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
}

function minutesText(value: number) {
  if (value < 60) return `${value} min`;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

// The Now screen: one thing at a time. RyanOS decides what matters, the grid
// decides when, and this screen says what to do this minute.
export default async function NowPage() {
  const user = await requireUser();
  const now = new Date();
  const [planner, rykasFeed, inboxFeed] = await Promise.all([
    getTimeBlockPlannerData(user.id, now),
    loadRykasFeed(user.id, prisma),
    loadInboxFeed(user.id, prisma, now)
  ]);
  const lifeFeeds = await loadLifeFeeds(user.id, prisma, {
    domains: planner.domains,
    openTasks: toLifeTasks([...planner.scheduledTasks, ...planner.unscheduledTasks]),
    day: getCalendarDayRange(now)
  });
  const timeZone = planner.timeZone;

  const todaysBlocks: NowTask[] = planner.scheduledTasks
    .filter((task) => task.scheduledStart && task.scheduledEnd)
    .map((task) => ({
      id: task.id,
      title: task.title,
      domainSlug: task.domain.slug,
      domainName: task.domain.name,
      note: task.note,
      scheduledStart: task.scheduledStart as Date,
      scheduledEnd: task.scheduledEnd as Date
    }));
  const state = deriveNowState(todaysBlocks, now);
  const meeting = planner.calendarEvents.find((event) => !event.isAllDay && event.start <= now && event.end > now) ?? null;
  const feeds = [...lifeFeeds, rykasFeed, inboxFeed];
  const topCard = feeds.flatMap((feed) => feed.cards)[0] ?? null;
  const current = state.current;
  const skips = current ? skipCount(current.note) : 0;

  return (
    <main className="mx-auto max-w-3xl space-y-4 sm:space-y-5">
      <NowAutoRefresh />

      <section aria-label="Quick capture" className="rounded-[1.25rem] border bg-card/80 p-3">
        <CaptureBox compact />
      </section>

      {state.overdueBlock && state.overdueBlock.id !== current?.id && (
        <section className="rounded-[1.5rem] border border-amber-500/50 bg-amber-500/10 p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-300">Close this out</p>
          <h2 className="mt-1 break-words text-lg font-semibold">{state.overdueBlock.title}</h2>
          <p className="mb-3 mt-1 text-xs text-muted-foreground">
            Ended at {clock(state.overdueBlock.scheduledEnd, timeZone)}. Mark it done or decide where it goes.
          </p>
          <NowControls allowExtend={false} taskId={state.overdueBlock.id} />
        </section>
      )}

      <section className="rounded-[1.75rem] border bg-card/95 p-5 shadow-sm sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Now · {clock(now, timeZone)}
        </p>
        {current ? (
          <>
            <h1 className="mt-2 break-words text-3xl font-semibold tracking-tight sm:text-4xl">{current.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {current.domainName} · until {clock(current.scheduledEnd, timeZone)} ·{" "}
              <span className="font-semibold text-foreground">{minutesText(state.minutesLeft ?? 0)} left</span>
            </p>
            {current.note && (
              <p className="mt-3 line-clamp-3 whitespace-pre-line break-words text-sm leading-6 text-muted-foreground">{current.note}</p>
            )}
            {skips >= 3 && (
              <p className="mt-3 rounded-xl border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                Skipped {skips} times. Does this still matter? Park or drop it if not.
              </p>
            )}
            <div className="mt-5">
              <NowControls taskId={current.id} />
            </div>
          </>
        ) : meeting ? (
          <>
            <h1 className="mt-2 break-words text-3xl font-semibold tracking-tight">{meeting.summary}</h1>
            <p className="mt-2 text-sm text-muted-foreground">Calendar · until {clock(meeting.end, timeZone)}</p>
          </>
        ) : (
          <>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">You&apos;re free{state.next ? ` for ${minutesText(state.minutesUntilNext ?? 0)}` : ""}.</h1>
            {topCard ? (
              <div className="mt-4 rounded-2xl border bg-background/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Best use of it · {OWNER_ACTION_AREA_LABELS[topCard.area]}
                </p>
                <OwnerFeedBlock feed={{ area: topCard.area, status: "READY", message: null, observedAt: null, cards: [topCard] }} />
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Nothing is waiting on you. Pick from the queue on Today, or take the break.</p>
            )}
          </>
        )}
      </section>

      <section className="rounded-[1.5rem] border bg-card/80 p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Up next</p>
        {state.next ? (
          <p className="mt-1 break-words text-base font-medium">
            {clock(state.next.scheduledStart, timeZone)} · {state.next.title}
            <span className="text-sm text-muted-foreground"> · in {minutesText(state.minutesUntilNext ?? 0)}</span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">Nothing else on the grid today.</p>
        )}
        <Link className="mt-2 inline-block text-xs font-medium underline-offset-4 hover:underline" href="/time-blocks">
          Open the full day
        </Link>
      </section>

      <OwnerActionsPanel
        deferred={<DeferredOwnerFeed area="AP_TRADER" endpoint="/api/today/ap-trader" />}
        feeds={feeds}
      />
    </main>
  );
}
