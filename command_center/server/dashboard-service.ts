import { Timeframe } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildWatchlistMetrics } from "@/server/signal-service";
import { classifySeries } from "@/strat/classifier";

export async function getWatchlistRows(userId: string) {
  const tickers = await prisma.watchlistTicker.findMany({ where: { userId }, orderBy: { symbol: "asc" } });

  const rows = [] as Array<{
    symbol: string;
    latestClose: number | null;
    lastBarDate: Date | null;
    provider: string | null;
    sma20: number | null;
    sma50: number | null;
    sma200: number | null;
    rv20: number | null;
    daily: string | null;
    weekly: string | null;
    monthly: string | null;
    alignment: "Bullish" | "Bearish" | "Neutral";
  }>;

  for (const ticker of tickers) {
    const [daily, weekly, monthly] = await Promise.all([
      prisma.priceBar.findMany({
        where: { symbol: ticker.symbol, timeframe: Timeframe.DAILY },
        orderBy: { date: "asc" },
        take: 260
      }),
      prisma.priceBar.findMany({
        where: { symbol: ticker.symbol, timeframe: Timeframe.WEEKLY },
        orderBy: { date: "asc" },
        take: 80
      }),
      prisma.priceBar.findMany({
        where: { symbol: ticker.symbol, timeframe: Timeframe.MONTHLY },
        orderBy: { date: "asc" },
        take: 60
      })
    ]);

    const latestDaily = daily.at(-1);
    const latestClose = latestDaily?.close ?? null;
    const metrics = buildWatchlistMetrics(daily);

    const d = classifySeries(daily).at(-1)?.stratLabel ?? null;
    const w = classifySeries(weekly).at(-1)?.stratLabel ?? null;
    const m = classifySeries(monthly).at(-1)?.stratLabel ?? null;

    const alignment =
      m === "2u" && w === "2u" && (d === "2u" || d === "3")
        ? "Bullish"
        : m === "2d" && w === "2d" && (d === "2d" || d === "3")
          ? "Bearish"
          : "Neutral";

    rows.push({
      symbol: ticker.symbol,
      latestClose,
      lastBarDate: latestDaily?.date ?? null,
      provider: latestDaily?.provider ?? null,
      sma20: metrics.sma20,
      sma50: metrics.sma50,
      sma200: metrics.sma200,
      rv20: metrics.rv20,
      daily: d,
      weekly: w,
      monthly: m,
      alignment
    });
  }

  return rows;
}
