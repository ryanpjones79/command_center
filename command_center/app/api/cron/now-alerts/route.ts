import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { alertsForWindow, alertWindowMinutes, sendPushover } from "@/server/now/alerts";

// Call every NOW_ALERTS_WINDOW_MIN minutes (default 5) with
// `Authorization: Bearer $CRON_SECRET`. Requires CRON_SECRET (unlike other
// cron routes, an unset secret disables this one so it can't be spammed),
// FEATURE_NOW_ALERTS=true, PUSHOVER_APP_TOKEN and PUSHOVER_USER_KEY.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (process.env.FEATURE_NOW_ALERTS !== "true") {
    return NextResponse.json({ ok: true, disabled: true });
  }

  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - alertWindowMinutes() * 60_000);
  const tasks = await prisma.executionTask.findMany({
    where: {
      status: { notIn: ["DONE", "DROPPED"] },
      OR: [
        { scheduledStart: { gt: windowStart, lte: windowEnd } },
        { scheduledEnd: { gt: windowStart, lte: windowEnd } }
      ]
    },
    select: { title: true, scheduledStart: true, scheduledEnd: true, domain: { select: { slug: true } } }
  });
  const alerts = alertsForWindow(
    tasks.flatMap((task) =>
      task.scheduledStart && task.scheduledEnd
        ? [{ title: task.title, domainSlug: task.domain.slug, scheduledStart: task.scheduledStart, scheduledEnd: task.scheduledEnd }]
        : []
    ),
    windowStart,
    windowEnd
  );

  const base = (process.env.APP_BASE_URL || process.env.NEXTAUTH_URL || process.env.AUTH_URL || "").replace(/\/+$/, "");
  const url = /^https:\/\//.test(base) ? `${base}/now` : null;
  const results = [];
  for (const alert of alerts) results.push(await sendPushover(alert, url));
  const failed = results.filter((result) => !result.ok);
  if (failed.length) console.error("[now-alerts] delivery failed", failed.map((result) => result.error));
  return NextResponse.json({ ok: failed.length === 0, sent: results.length - failed.length, failed: failed.length });
}
