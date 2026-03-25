"use client";

import { Button } from "@/components/ui/button";

export function PrintBrowserButton() {
  return (
    <Button onClick={() => window.print()} type="button">
      Print Now
    </Button>
  );
}
