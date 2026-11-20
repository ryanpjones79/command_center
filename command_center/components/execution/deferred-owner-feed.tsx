"use client";

import { useEffect, useState } from "react";
import { OwnerFeedBlock } from "@/components/execution/owner-feed-block";
import { OWNER_ACTION_AREA_LABELS, type OwnerActionArea, type OwnerActionFeed } from "@/lib/owner-actions";

// Loads one slow feed after Today has rendered, so the page never waits on it.
export function DeferredOwnerFeed({ area, endpoint }: { area: OwnerActionArea; endpoint: string }) {
  const [feed, setFeed] = useState<OwnerActionFeed | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((data: OwnerActionFeed) => setFeed(data))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setFailed(true);
      });
    return () => controller.abort();
  }, [endpoint]);

  if (feed) return <OwnerFeedBlock feed={feed} />;
  return (
    <div aria-live="polite" className="min-w-0">
      <h4 className="text-sm font-semibold">{OWNER_ACTION_AREA_LABELS[area]}</h4>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {failed ? "Couldn't load this feed. The rest of Today still works." : "Checking…"}
      </p>
    </div>
  );
}
