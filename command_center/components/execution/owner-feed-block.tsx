import Link from "next/link";
import { ScheduleCardButton } from "@/components/execution/schedule-card-button";
import {
  OWNER_ACTION_AREA_LABELS,
  type OwnerActionCard,
  type OwnerActionFeed,
  type OwnerActionKind,
  type OwnerFeedStatus
} from "@/lib/owner-actions";

// Shared by the server-rendered panel and the client-side deferred loader.
// No hooks, so it renders in either.

const KIND_LABEL: Record<OwnerActionKind, string> = {
  DECISION: "Decide",
  FIX: "Fix",
  BUY_REVIEW: "Review buy",
  FOLLOW_UP: "Follow up"
};

const STATUS_LABEL: Partial<Record<OwnerFeedStatus, string>> = {
  STALE: "Stale data",
  OFF: "Feed off",
  UNAVAILABLE: "Not connected"
};

function formatObserved(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function ActionRow({ card }: { card: OwnerActionCard }) {
  const linkProps = card.external ? { target: "_blank", rel: "noopener noreferrer" } : {};
  return (
    <li className="rounded-2xl border bg-background/70 p-3">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <span className="rounded-full border px-2 py-0.5">{KIND_LABEL[card.kind]}</span>
        {card.minutes !== null && <span>{card.minutes} min</span>}
      </div>
      <Link
        className="mt-1.5 block break-words text-sm font-semibold leading-5 text-foreground underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        href={card.href}
        {...linkProps}
      >
        {card.title}
        {card.external && <span className="sr-only"> (opens in a new tab)</span>}
      </Link>
      <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{card.whyNow}</p>
      <ScheduleCardButton card={card} />
    </li>
  );
}

export function OwnerFeedBlock({ feed }: { feed: OwnerActionFeed }) {
  const observed = formatObserved(feed.observedAt);
  const statusLabel = STATUS_LABEL[feed.status];
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold">{OWNER_ACTION_AREA_LABELS[feed.area]}</h4>
        {feed.cards.length > 0 && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            {feed.cards.length} waiting
          </span>
        )}
        {statusLabel && (
          <span
            className={
              feed.status === "STALE"
                ? "rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300"
                : "rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
            }
          >
            {statusLabel}
          </span>
        )}
        {observed && <span className="text-[11px] text-muted-foreground">Data as of {observed}</span>}
      </div>
      {feed.summary && (
        <details className="mt-1.5 rounded-xl border bg-background/60 px-3 py-2">
          <summary className="cursor-pointer break-words text-sm font-medium focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {feed.summary.headline}
          </summary>
          {feed.summary.detail.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-xs leading-5 text-muted-foreground">
              {feed.summary.detail.map((line) => (
                <li className="break-words" key={line}>
                  {line}
                </li>
              ))}
            </ul>
          )}
        </details>
      )}
      {feed.message && <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{feed.message}</p>}
      {feed.cards.length > 0 && (
        <ul className="mt-2 grid gap-2 md:grid-cols-3">
          {feed.cards.map((card) => (
            <ActionRow card={card} key={card.id} />
          ))}
        </ul>
      )}
    </div>
  );
}
