import type { Metadata } from "next";
import Link from "next/link";
import { Camera } from "lucide-react";
import { CaptureBox } from "@/components/inbox/capture-box";
import { SortCard } from "@/components/inbox/sort-card";
import { TriageCard } from "@/components/inbox/triage-card";
import { OWNER_ACTION_AREAS, type OwnerActionArea } from "@/lib/owner-actions";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { localDateKey } from "@/lib/v2/zoned-time";
import { guessLane, IDEA_LANES, INBOX_STATUS, isDueForReview } from "@/server/inbox/inbox";
import { dayTaskSelect, toDayTask } from "@/server/v2/day";
import { loadDaySettings } from "@/server/v2/schedule-service";

export const metadata: Metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

const SLUG_LANE: Record<string, OwnerActionArea> = { family: "KIDS", kids: "KIDS", health: "HEALTH", work: "CCHCS", rykas: "RYKAS", "casino-ap": "CASINO_AP", "betting-models": "AP_TRADER" };

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
  const settings = await loadDaySettings(user.id, prisma);

  const [judgmentRows, legacyUnsorted, parked, notesCount] = await Promise.all([
    prisma.executionTask.findMany({ where: { userId: user.id, needsJudgment: true, status: { notIn: ["DONE", "DROPPED"] } }, select: dayTaskSelect, orderBy: { createdAt: "asc" }, take: 300 }),
    prisma.parkedIdea.findMany({ where: { userId: user.id, status: INBOX_STATUS }, orderBy: { parkedAt: "asc" }, take: 500 }),
    prisma.parkedIdea.findMany({ where: { userId: user.id, status: "parked" }, orderBy: { touchedAt: "asc" }, take: 500 }),
    prisma.parkedIdea.count({ where: { userId: user.id, status: "note" } })
  ]);
  const judgment = judgmentRows.map(toDayTask);
  // Items whose review time hasn't come yet stay out of the way (but counted).
  const dueNow = judgment.filter((task) => !task.followUpDate || task.followUpDate <= now);
  const later = judgment.length - dueNow.length;
  const current = dueNow[0] ?? null;
  const legacyQueue = reviewMode ? parked.filter((idea) => isDueForReview(idea, now)) : legacyUnsorted;
  const legacyCurrent = legacyQueue[0] ?? null;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border bg-card p-4 sm:p-5">
        <CaptureBox />
        <Link className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" href="/inbox/capture">
          <Camera aria-hidden="true" className="h-4 w-4" /> Photo of paper or a screenshot
        </Link>
      </section>

      <section aria-labelledby="judgment-title" className="rounded-[1.5rem] border bg-card p-5 shadow-sm sm:p-7">
        <h1 className="sr-only" id="judgment-title">Needs your judgment</h1>
        {current ? (
          <TriageCard
            initialLane={current.captureKind ? guessLane(current.title) : SLUG_LANE[current.domainSlug] ?? guessLane(current.title)}
            item={{
              id: current.id,
              title: current.title,
              note: current.note,
              captureKind: current.captureKind,
              attachmentId: current.attachmentId,
              ageText: ageText(current.createdAt, now),
              sourceLabel: current.sourceSystem && current.sourceSystem !== "CAPTURE" ? `from ${current.sourceSystem.replace("_", " ").toLowerCase()}` : null,
              dueDate: current.dueDate ? localDateKey(current.dueDate, settings.timeZone) : null
            }}
            key={current.id}
            lanes={IDEA_LANES}
            position={`1 of ${dueNow.length}`}
          />
        ) : (
          <div>
            <p className="text-2xl font-semibold tracking-tight">Nothing needs your judgment right now.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {later > 0 ? `${later} capture${later === 1 ? " is" : "s are"} scheduled to come back at review time.` : "Everything captured has a decision."}
            </p>
          </div>
        )}
      </section>

      {(legacyUnsorted.length > 0 || parked.some((idea) => isDueForReview(idea, now))) && (
        <section className="rounded-2xl border bg-card p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">Earlier ideas</span>
            <Link aria-current={!reviewMode ? "page" : undefined} className={`rounded-full border px-3 py-1 ${!reviewMode ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`} href="/inbox">To sort ({legacyUnsorted.length})</Link>
            <Link aria-current={reviewMode ? "page" : undefined} className={`rounded-full border px-3 py-1 ${reviewMode ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`} href="/inbox?mode=review">Parked, due for review ({parked.filter((idea) => isDueForReview(idea, now)).length})</Link>
          </div>
          {legacyCurrent ? (
            <SortCard
              idea={{ id: legacyCurrent.id, idea: legacyCurrent.idea, ageText: ageText(legacyCurrent.parkedAt, now) }}
              initialLane={laneFor(legacyCurrent.lane, legacyCurrent.idea)}
              key={legacyCurrent.id}
              lanes={IDEA_LANES}
              position={`${reviewMode ? "Review" : "Idea"} 1 of ${legacyQueue.length}`}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Nothing here.</p>
          )}
        </section>
      )}

      <p className="px-1 text-sm text-muted-foreground">
        {notesCount} reference note{notesCount === 1 ? "" : "s"} kept · <Link className="underline underline-offset-4" href="/search">search them</Link>
      </p>
    </div>
  );
}
