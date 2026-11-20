"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { localClock } from "@/lib/v2/zoned-time";
import { googleCalendarLoader, loadDay } from "@/server/v2/day";
import { acceptPlan } from "@/server/v2/plan";
import { loadDaySettings } from "@/server/v2/schedule-service";
import { batchCapturesForReview, buildShutdown, closeDay } from "@/server/v2/shutdown";

function refresh() {
  for (const path of ["/now", "/time-blocks", "/projects", "/inbox"]) revalidatePath(path);
}

export async function acceptPlanAction(items: { taskId: string; start: string; end: string }[]) {
  const user = await requireUser();
  const result = await acceptPlan(user.id, prisma, Array.isArray(items) ? items : []);
  refresh();
  return {
    ok: result.skipped.length === 0,
    message: result.skipped.length
      ? `Planned ${result.booked.length}. ${result.skipped.length} changed since the proposal; they're still in today's queue.`
      : `Planned ${result.booked.length} block${result.booked.length === 1 ? "" : "s"}. Open Now when you're ready.`
  };
}

export async function batchCapturesAction(reviewDate: string | null) {
  const user = await requireUser();
  const settings = await loadDaySettings(user.id, prisma);
  const result = await batchCapturesForReview(user.id, prisma, reviewDate);
  refresh();
  if (!result.ok || !result.reviewAt) return { ok: false, message: result.error ?? "Couldn't set the review date." };
  const day = result.reviewAt.toLocaleDateString("en-US", { timeZone: settings.timeZone, weekday: "short", month: "short", day: "numeric" });
  return { ok: true, message: `${result.count} capture${result.count === 1 ? "" : "s"} will come back ${day} at ${localClock(result.reviewAt, settings.timeZone)}.` };
}

export async function closeDayAction() {
  const user = await requireUser();
  const model = buildShutdown(await loadDay(user.id, prisma, googleCalendarLoader()));
  const result = await closeDay(user.id, prisma, model);
  refresh();
  return result.ok ? { ok: true, message: "Day closed. Go be with your people." } : { ok: false, message: result.error ?? "Not yet." };
}
