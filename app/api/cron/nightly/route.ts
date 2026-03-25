import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { refreshWatchlist, refreshSymbol } from "@/server/market-data-service";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${secret}`) {
      return unauthorized();
    }
  }

  // Refresh VIX for proxy volatility context
  await refreshSymbol("VIX");

  const users = await prisma.user.findMany({ select: { id: true } });
  const results = [];

  for (const user of users) {
    results.push({ userId: user.id, tickers: await refreshWatchlist(user.id) });
  }

  return NextResponse.json({ ok: true, results });
}
