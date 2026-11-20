import type { Metadata } from "next";
import Link from "next/link";
import { CaptureBox } from "@/components/inbox/capture-box";
import { SortCard } from "@/components/inbox/sort-card";
import { OWNER_ACTION_AREA_LABELS, OWNER_ACTION_AREAS, type OwnerActionArea } from "@/lib/owner-actions";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { guessLane, IDEA_LANES, INBOX_STATUS, isDueForReview } from "@/server/inbox/inbox";

export const metadata: Metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

function ageText(from: Date, now: Date) {
  const days = Math.floor((now.getTime() - from.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

function laneFor(lane: string, idea: string): OwnerActionArea {
  return (OWNER_ACTION_AREAS as readonly string[]).includes(lane) ? (lane as OwnerActionArea) : guessLane(idea);
}

export default async function InboxPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const params = await searchParams;
  const reviewMode = params.mode === "review";
  const now = new Date();

  const [unsorted, parked, notes] = await Promise.all([
    prisma.parkedIdea.findMany({ where: { userId: user.id, status: INBOX_STATUS }, orderBy: { parkedAt: "asc" }, take: 500 }),
    prisma.parkedIdea.findMany({ where: { userId: user.id, status: "parked" }, orderBy: { touchedAt: "asc" }, take: 500 }),
    prisma.parkedIdea.findMany({ where: { userId: user.id, status: "note" }, orderBy: { touchedAt: "desc" }, take: 50 })
  ]);
  const dueForReview = parked.filter((idea) => isDueForReview(idea, now));
  const queue = reviewMode ? dueForReview : unsorted;
  const current = queue[0] ?? null;

  return (
    <main className="mx-auto max-w-3xl space-y-4 sm:space-y-5">
      <section className="rounded-[1.5rem] border bg-card/95 p-4 shadow-sm sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Capture</p>
        <div className="mt-2">
          <CaptureBox autoFocus={!current} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Moving off Apple Notes: open a note, select all, copy, and paste it here. Each line becomes one idea to sort.
        </p>
      </section>

      <section className="rounded-[1.75rem] border bg-card/95 p-5 shadow-sm sm:p-7">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          <Link
            aria-current={!reviewMode ? "page" : undefined}
            className={`rounded-full border px-3 py-1 font-medium ${!reviewMode ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}
            href="/inbox"
          >
            To sort ({unsorted.length})
          </Link>
          <Link
            aria-current={reviewMode ? "page" : undefined}
            className={`rounded-full border px-3 py-1 font-medium ${reviewMode ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}
            href="/inbox?mode=review"
          >
            Parked, due for review ({dueForReview.length})
          </Link>
          <span className="text-muted-foreground">· {parked.length} parked · {notes.length} notes</span>
        </div>
        {current ? (
          <SortCard
            idea={{ id: current.id, idea: current.idea, ageText: ageText(current.parkedAt, now) }}
            initialLane={laneFor(current.lane, current.idea)}
            key={current.id}
            lanes={IDEA_LANES}
            position={`${reviewMode ? "Review" : "Idea"} 1 of ${queue.length}`}
          />
        ) : (
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{reviewMode ? "No parked ideas are due." : "Inbox zero."}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {reviewMode ? "Parked ideas come back here 30 days after you last touched them." : "Every idea has a decision. Capture the next one above."}
            </p>
            <Link className="mt-3 inline-block text-sm font-medium underline-offset-4 hover:underline" href="/now">
              Back to Now
            </Link>
          </div>
        )}
      </section>

      {notes.length > 0 && (
        <details className="rounded-[1.5rem] border bg-card/80 p-4 sm:p-5">
          <summary className="cursor-pointer text-sm font-semibold">Notes you kept ({notes.length})</summary>
          <ul className="mt-3 space-y-2">
            {notes.map((note) => (
              <li className="break-words rounded-xl border bg-background/60 px-3 py-2 text-sm" key={note.id}>
                <span className="mr-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {OWNER_ACTION_AREA_LABELS[laneFor(note.lane, note.idea)]}
                </span>
                {note.idea}
              </li>
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}
