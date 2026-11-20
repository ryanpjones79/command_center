import type { Metadata } from "next";
import { CaptureBox } from "@/components/inbox/capture-box";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Share to RyanOS" };

// Android share-sheet landing: pre-fills the capture box; nothing is saved
// until Save is pressed (shared content is treated as content, not commands).
export default async function SharePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const params = await searchParams;
  const pick = (key: string) => (typeof params[key] === "string" ? (params[key] as string).slice(0, 2000) : "");
  const title = pick("title");
  const text = pick("text");
  const url = pick("url");
  const initial = [title && title !== text ? title : null, text, url && !text.includes(url) ? url : null].filter(Boolean).join(" — ");

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Save to RyanOS</h1>
      <p className="text-sm text-muted-foreground">Check it, then Save. It comes back for a decision at your next review.</p>
      <div className="rounded-2xl border bg-card p-4 sm:p-5">
        <CaptureBox autoFocus initialText={initial} />
      </div>
    </div>
  );
}
