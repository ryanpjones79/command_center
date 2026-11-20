import type { ReactNode } from "react";
import { OwnerFeedBlock } from "@/components/execution/owner-feed-block";
import type { OwnerActionFeed } from "@/lib/owner-actions";

export function OwnerActionsPanel({ feeds, deferred }: { feeds: OwnerActionFeed[]; deferred?: ReactNode }) {
  if (feeds.length === 0 && !deferred) return null;
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
            What&apos;s waiting on you today
          </h3>
        </div>
        <p className="text-xs text-muted-foreground">Up to 3 per area. Read-only: open each one to act.</p>
      </div>
      <div className="mt-3 space-y-4">
        {feeds.map((feed) => (
          <OwnerFeedBlock feed={feed} key={feed.area} />
        ))}
        {deferred}
      </div>
    </section>
  );
}
