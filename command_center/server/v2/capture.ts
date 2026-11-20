import type { PrismaClient } from "@prisma/client";
import { detectPhi } from "@/lib/execution-validation";
import { addZonedDays, atLocalMinutes, localClock } from "@/lib/v2/zoned-time";
import { guessLane, splitCapturedText } from "@/server/inbox/inbox";
import { AREA_DOMAIN_SLUG } from "@/server/now/planning";
import { loadDaySettings } from "@/server/v2/schedule-service";

// Captures become persistent actions that need Ryan's judgment, each with a
// dated review time. Only content is required; area and dates are inferred.
// Photos are stored as-is and never sent anywhere for reading (paper can carry
// patient information); Ryan states the obligation when sorting.

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
export const UNDO_WINDOW_MS = 10 * 60_000;

export type CaptureInput = {
  text?: string | null;
  photo?: { mimeType: string; bytes: Uint8Array } | null;
  locationNote?: string | null;
  kind?: "TEXT" | "PHOTO" | "SHARE";
};

export type CaptureReceipt =
  | { ok: true; taskIds: string[]; reviewAt: string; reviewLabel: string; count: number }
  | { ok: false; error: string };

// Next review: this evening's shutdown if captured before mid-afternoon,
// otherwise tomorrow's morning launch.
export function nextReviewTime(now: Date, timeZone: string, workdayStartMin: number, workdayEndMin: number) {
  const todayShutdown = atLocalMinutes(now, workdayEndMin, timeZone);
  if (now.getTime() < todayShutdown.getTime() - 2 * 60 * 60_000) return todayShutdown;
  return atLocalMinutes(addZonedDays(now, 1, timeZone), workdayStartMin, timeZone);
}

export async function createCapture(userId: string, input: CaptureInput, db: PrismaClient, now = new Date()): Promise<CaptureReceipt> {
  const text = (input.text ?? "").trim();
  const lines = text ? splitCapturedText(text) : [];
  if (!input.photo && lines.length === 0) return { ok: false, error: "Nothing to capture yet." };
  if (lines.some((line) => detectPhi(line).length > 0)) {
    return { ok: false, error: "Not saved: this looks like patient information (NO PHI). Remove it and try again." };
  }
  if (input.photo) {
    if (!PHOTO_TYPES.has(input.photo.mimeType)) return { ok: false, error: "Use a JPEG, PNG, WebP or HEIC photo." };
    if (input.photo.bytes.byteLength > MAX_PHOTO_BYTES) return { ok: false, error: "That photo is over 8 MB. Try a smaller one." };
  }

  const settings = await loadDaySettings(userId, db);
  const reviewAt = nextReviewTime(now, settings.timeZone, settings.workdayStartMin, settings.workdayEndMin);
  const kind = input.photo ? "PHOTO" : input.kind ?? "TEXT";
  const items = lines.length ? lines : [`Photo capture ${localClock(now, settings.timeZone)}`];

  const taskIds = await db.$transaction(async (tx) => {
    const ids: string[] = [];
    for (const [index, line] of items.entries()) {
      const lane = guessLane(line);
      const domain =
        (await tx.executionDomain.findFirst({ where: { userId, slug: AREA_DOMAIN_SLUG[lane] }, select: { id: true } })) ??
        (await tx.executionDomain.findFirst({ where: { userId }, orderBy: { createdAt: "asc" }, select: { id: true } }));
      if (!domain) throw new Error("No task domains exist.");
      const task = await tx.executionTask.create({
        data: {
          userId,
          domainId: domain.id,
          title: line.slice(0, 200),
          note: line.length > 200 ? line : input.locationNote ? `Where it is: ${input.locationNote.slice(0, 200)}` : null,
          type: "ACTION",
          status: "NOT_STARTED",
          whenBucket: "LATER",
          followUpDate: reviewAt,
          needsJudgment: true,
          sourceSystem: "CAPTURE",
          captureKind: kind,
          source: "Capture"
        },
        select: { id: true }
      });
      if (input.photo && index === 0) {
        await tx.captureAttachment.create({
          data: {
            userId,
            taskId: task.id,
            mimeType: input.photo.mimeType,
            sizeBytes: input.photo.bytes.byteLength,
            data: Buffer.from(input.photo.bytes),
            locationNote: input.locationNote?.slice(0, 200) ?? null
          }
        });
      }
      await tx.executionTaskEvent.create({ data: { userId, taskId: task.id, type: "CAPTURED", detail: kind } });
      ids.push(task.id);
    }
    return ids;
  });

  const day = new Intl.DateTimeFormat("en-US", { timeZone: settings.timeZone, weekday: "short" }).format(reviewAt);
  return {
    ok: true,
    taskIds,
    count: taskIds.length,
    reviewAt: reviewAt.toISOString(),
    reviewLabel: `${day} ${localClock(reviewAt, settings.timeZone)}`
  };
}

// Undo within a short window, only while nothing else has happened to the item.
export async function undoCapture(userId: string, taskIds: string[], db: PrismaClient, now = new Date()) {
  const tasks = await db.executionTask.findMany({
    where: { userId, id: { in: taskIds.slice(0, 200) }, sourceSystem: "CAPTURE" },
    select: { id: true, createdAt: true, status: true, scheduledStart: true }
  });
  const removable = tasks.filter((task) => now.getTime() - task.createdAt.getTime() <= UNDO_WINDOW_MS && task.status === "NOT_STARTED" && !task.scheduledStart);
  if (removable.length === 0) return { ok: false as const, removed: 0 };
  await db.executionTask.deleteMany({ where: { userId, id: { in: removable.map((task) => task.id) } } });
  return { ok: true as const, removed: removable.length };
}
