import Link from "next/link";
import { Button } from "@/components/ui/button";

export function PrintActionSheetButton() {
  return (
    <Button asChild className="app-no-print" variant="outline">
      <Link href="/print/action-sheet?mode=compact">Print Action Sheet</Link>
    </Button>
  );
}
