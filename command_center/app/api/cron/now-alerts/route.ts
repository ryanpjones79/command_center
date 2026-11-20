import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runNowAlerts } from "@/server/now/run-alerts";

// GET /api/cron/now-alerts  (Authorization: Bearer $CRON_SECRET), ~every 5 min.
// 1) pulls source readings into persistent items (throttled per source),
// 2) sends block start/end pings once each (AlertDelivery dedupe), catching
//    up after a missed run. Add ?dryRun=1 to see what would be sent without
//    sending or recording anything.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  const result = await runNowAlerts(prisma, { dryRun });
  if ("failed" in result && result.failed) console.error("[now-alerts] some deliveries failed", result.failed);
  return NextResponse.json(result);
}
