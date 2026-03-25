"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/kibo-ui/spinner";

export function RefreshAllButton() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      variant="secondary"
      onClick={() =>
        startTransition(async () => {
          await fetch("/api/refresh-all", { method: "POST" });
          router.refresh();
        })
      }
      disabled={pending}
    >
      {pending ? (
        <span className="inline-flex items-center gap-2">
          <Spinner className="size-4" />
          Refreshing...
        </span>
      ) : (
        "Refresh Watchlist"
      )}
    </Button>
  );
}
