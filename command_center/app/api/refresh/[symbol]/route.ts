import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { refreshSymbol } from "@/server/market-data-service";

const MANUAL_REFRESH_COOLDOWN_MS = 15 * 60 * 1000;

export async function POST(_: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { symbol } = await params;
  const normalized = symbol.toUpperCase();

  const ticker = await prisma.watchlistTicker.findUnique({
    where: { userId_symbol: { userId, symbol: normalized } }
  });

  if (!ticker) {
    return NextResponse.json({ error: "Ticker not found in watchlist" }, { status: 404 });
  }

  if (ticker.lastManualRefreshAt) {
    const elapsed = Date.now() - ticker.lastManualRefreshAt.getTime();
    if (elapsed < MANUAL_REFRESH_COOLDOWN_MS) {
      const waitMs = MANUAL_REFRESH_COOLDOWN_MS - elapsed;
      return NextResponse.json(
        { error: `Rate limited. Try again in ${Math.ceil(waitMs / 60000)}m.` },
        { status: 429 }
      );
    }
  }

  const result = await refreshSymbol(normalized);

  await prisma.watchlistTicker.update({
    where: { userId_symbol: { userId, symbol: normalized } },
    data: { lastManualRefreshAt: new Date() }
  });

  return NextResponse.json({ ok: true, result });
}
