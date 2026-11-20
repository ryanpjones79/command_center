import type { PrismaClient } from "@prisma/client";
import type { OwnerActionFeed } from "@/lib/owner-actions";
import { buildInboxFeed, INBOX_STATUS, REVIEW_DAYS } from "@/server/inbox/inbox";

export async function loadInboxFeed(userId: string, db: PrismaClient, now = new Date()): Promise<OwnerActionFeed> {
  try {
    const [unsorted, dueForReview] = await Promise.all([
      db.parkedIdea.findMany({ where: { userId, status: INBOX_STATUS }, select: { parkedAt: true }, take: 500 }),
      db.parkedIdea.count({
        where: { userId, status: "parked", touchedAt: { lte: new Date(now.getTime() - REVIEW_DAYS * 86_400_000) } }
      })
    ]);
    return buildInboxFeed({ unsorted, dueForReview }, now);
  } catch (error) {
    console.error("Inbox Today feed failed", error instanceof Error ? error.message : "unknown error");
    return { area: "INBOX", status: "UNAVAILABLE", message: "Couldn't load the idea inbox. The rest of Today still works.", observedAt: null, cards: [] };
  }
}
