import Link from "next/link";
import {
  OWNER_ACTION_AREA_LABELS,
  type OwnerActionCard,
  type OwnerActionFeed,
  type OwnerActionKind,
  type OwnerFeedStatus
} from "@/lib/owner-actions";

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
    timeZone: process.env.DAILY_BRIEF_TIMEZONE || "America/Los_Angeles",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function ActionRow({ card }: { card: OwnerActionCard }) {
  const linkProps = card.external
    ? { target: "_blank", rel: "noopener noreferrer" }
    : {};
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
    </li>
  );
}

function FeedBlock({ feed }: { feed: OwnerActionFeed }) {
  const observed = formatObserved(feed.observedAt);
  const statusLabel = STATUS_LABEL[feed.status];
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold">{OWNER_ACTION_AREA_LABELS[feed.area]}</h4>
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
      {feed.message && <p className="mt-1 text-xs leading-5 text-muted-foreground">{feed.message}</p>}
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

export function OwnerActionsPanel({ feeds }: { feeds: OwnerActionFeed[] }) {
  if (feeds.length === 0) return null;
  const total = feeds.reduce((sum, feed) => sum + feed.cards.length, 0);
  return (
    <section
      aria-labelledby="owner-actions-heading"
      className="rounded-[1.5rem] border bg-card/90 p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Needs you
          </p>
          <h3 className="mt-1 text-lg font-semibold tracking-tight" id="owner-actions-heading">
            {total === 0 ? "Nothing waiting on you" : `${total} action${total === 1 ? "" : "s"} waiting on you`}
          </h3>
        </div>
        <p className="text-xs text-muted-foreground">Up to 3 per area. Read-only: open each one to act.</p>
      </div>
      <div className="mt-3 space-y-4">
        {feeds.map((feed) => (
          <FeedBlock feed={feed} key={feed.area} />
        ))}
      </div>
    </section>
  );
}
