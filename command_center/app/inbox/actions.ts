"use server";

import { revalidatePath } from "next/cache";
import { scheduleOwnerCardAction } from "@/app/now/actions";
import { detectPhi } from "@/lib/execution-validation";
import { OWNER_ACTION_AREAS, type OwnerActionArea } from "@/lib/owner-actions";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { ensureExecutionSetup } from "@/server/execution-service";
import { guessLane, INBOX_STATUS, splitCapturedText } from "@/server/inbox/inbox";
import { AREA_DOMAIN_SLUG } from "@/server/now/planning";

type ActionResult = { ok: boolean; message: string };

function revalidateInbox() {
  revalidatePath("/inbox");
  revalidatePath("/now");
  revalidatePath("/time-blocks");
}

// One idea, or a whole pasted Apple Notes list (one idea per line).
export async function captureIdeasAction(text: string): Promise<ActionResult> {
  const user = await requireUser();
  const items = splitCapturedText(String(text ?? ""));
  if (items.length === 0) return { ok: false, message: "Nothing to capture." };

  const blocked = items.filter((item) => detectPhi(item).length > 0);
  if (blocked.length > 0) {
    return { ok: false, message: `Not saved: ${blocked.length} line${blocked.length === 1 ? "" : "s"} look like patient info (NO PHI). Remove it and try again.` };
  }

  const now = new Date();
  await prisma.parkedIdea.createMany({
    data: items.map((idea) => ({ userId: user.id, idea, lane: guessLane(idea), status: INBOX_STATUS, parkedAt: now, touchedAt: now }))
  });
  revalidateInbox();
  return { ok: true, message: items.length === 1 ? "Captured." : `Captured ${items.length} ideas.` };
}

const SORT_CHOICES = ["NOW", "THIS_WEEK", "SOMEDAY", "NOTE", "DROP"] as const;

// Every idea leaves the inbox with a decision.
//   NOW       -> task on today's grid (next open slot)
//   THIS_WEEK -> task in this week's queue
//   SOMEDAY   -> parked; returns for review in 30 days
//   NOTE      -> kept as reference, never nags
//   DROP      -> let go
export async function sortIdeaAction(ideaId: string, choice: string, laneInput: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!(SORT_CHOICES as readonly string[]).includes(choice)) return { ok: false, message: "Pick a decision." };
  const idea = await prisma.parkedIdea.findFirst({ where: { id: ideaId, userId: user.id } });
  if (!idea) return { ok: false, message: "Idea not found." };
  const lane: OwnerActionArea = (OWNER_ACTION_AREAS as readonly string[]).includes(laneInput) ? (laneInput as OwnerActionArea) : guessLane(idea.idea);
  const now = new Date();

  if (choice === "NOW") {
    const result = await scheduleOwnerCardAction({
      cardId: `idea:${idea.id}`,
      area: lane,
      title: idea.idea.slice(0, 200),
      whyNow: "From your idea inbox.",
      minutes: 30,
      href: "/inbox"
    });
    if (!result.ok) return result;
    await prisma.parkedIdea.update({ where: { id: idea.id }, data: { status: "task", lane, touchedAt: now } });
    revalidateInbox();
    return result;
  }

  if (choice === "THIS_WEEK") {
    await ensureExecutionSetup(user.id);
    const domain = await prisma.executionDomain.findFirst({ where: { userId: user.id, slug: AREA_DOMAIN_SLUG[lane] }, select: { id: true } });
    if (!domain) return { ok: false, message: "That area's domain is missing in Tasks." };
    await prisma.executionTask.create({
      data: {
        userId: user.id,
        domainId: domain.id,
        title: idea.idea.slice(0, 200),
        type: "ACTION",
        status: "NOT_STARTED",
        priority: "MEDIUM",
        whenBucket: "THIS_WEEK",
        note: idea.idea.length > 200 ? idea.idea : null,
        source: `card:idea:${idea.id}`
      }
    });
    await prisma.parkedIdea.update({ where: { id: idea.id }, data: { status: "task", lane, touchedAt: now } });
    revalidateInbox();
    return { ok: true, message: "Added to this week." };
  }

  const status = choice === "SOMEDAY" ? "parked" : choice === "NOTE" ? "note" : "dropped";
  await prisma.parkedIdea.update({
    where: { id: idea.id },
    data: {
      status,
      lane,
      touchedAt: now,
      renewals: choice === "SOMEDAY" && idea.status === "parked" ? { increment: 1 } : undefined
    }
  });
  revalidateInbox();
  return { ok: true, message: choice === "SOMEDAY" ? "Parked. It comes back in 30 days." : choice === "NOTE" ? "Kept as a note." : "Dropped." };
}
