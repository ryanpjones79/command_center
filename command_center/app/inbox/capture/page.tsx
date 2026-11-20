import type { Metadata } from "next";
import Link from "next/link";
import { PhotoCapture } from "@/components/inbox/photo-capture";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Photo capture" };

export default async function PhotoCapturePage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <Link className="text-sm text-muted-foreground underline-offset-4 hover:underline" href="/inbox">← Inbox</Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Capture paper</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          RyanOS keeps the original image and brings it back so you can confirm the date and what you need to do.
        </p>
      </div>
      <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
        Never photograph CCHCS, patient or clinical paperwork. Those stay in approved work systems.
      </p>
      <PhotoCapture />
    </div>
  );
}
