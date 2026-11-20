import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { loadApTraderFeed } from "@/server/today-feed/ap-trader-feed";

// Signed-in only. Serves the cached AP Trader feed for Today's background
// loader; the feed itself polls each bot at most every few minutes.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const feed = await loadApTraderFeed();
  return NextResponse.json(feed, { headers: { "Cache-Control": "private, no-store" } });
}
