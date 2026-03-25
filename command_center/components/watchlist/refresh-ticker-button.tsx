"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/kibo-ui/spinner";

export function RefreshTickerButton({ symbol }: { symbol: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const onRefresh = () => {
    startTransition(async () => {
      await fetch(`/api/refresh/${symbol}`, { method: "POST" });
      router.refresh();
    });
  };

  return (
    <Button size="sm" variant="outline" onClick={onRefresh} disabled={pending}>
      {pending ? (
        <span className="inline-flex items-center gap-2">
          <Spinner className="size-4" />
          Refreshing...
        </span>
      ) : (
        "Refresh"
      )}
    </Button>
  );
}
