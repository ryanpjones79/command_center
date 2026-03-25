"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function SetupToolbarActions({ queryString }: { queryString: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    const url = `${window.location.origin}/signals${queryString ? `?${queryString}` : ""}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="flex items-center gap-2">
      <Button onClick={onCopy} type="button" variant="outline">
        {copied ? "Copied" : "Copy"}
      </Button>
      <Button asChild>
        <a href={`/api/signals/export?${queryString}`}>Export</a>
      </Button>
    </div>
  );
}
