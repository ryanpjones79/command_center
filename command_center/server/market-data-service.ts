import { Timeframe } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { aggregateToMonthlyBars, aggregateToWeeklyBars } from "@/lib/aggregation";
import { logger } from "@/lib/logger";
import { getDailyBarsWithFailover } from "@/providers";
import type { MarketBar } from "@/providers/market-provider";

const DEFAULT_LOOKBACK_DAYS = 420;

function daysAgo(days: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

async function upsertBars(symbol: string, timeframe: Timeframe, provider: string, bars: MarketBar[]) {
  if (bars.length === 0) return;

  await prisma.$transaction(
    bars.map((bar) =>
      prisma.priceBar.upsert({
        where: {
          symbol_timeframe_date: {
            symbol,
            timeframe,
            date: bar.date
          }
        },
        update: {
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume,
          adjClose: bar.adjClose,
          provider,
          fetchedAt: new Date()
        },
        create: {
          symbol,
          timeframe,
          date: bar.date,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume,
          adjClose: bar.adjClose,
          provider,
          fetchedAt: new Date()
        }
      })
    )
  );
}

async function rewriteDerived(symbol: string, provider: string, dailyBars: MarketBar[]) {
  const weekly = aggregateToWeeklyBars(dailyBars);
  const monthly = aggregateToMonthlyBars(dailyBars);

  await prisma.$transaction([
    prisma.priceBar.deleteMany({
      where: {
        symbol,
        timeframe: { in: [Timeframe.WEEKLY, Timeframe.MONTHLY] }
      }
    }),
    prisma.priceBar.createMany({
      data: weekly.map((bar) => ({
        symbol,
        timeframe: Timeframe.WEEKLY,
        date: bar.date,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
        adjClose: bar.adjClose,
        provider,
        fetchedAt: new Date()
      }))
    }),
    prisma.priceBar.createMany({
      data: monthly.map((bar) => ({
        symbol,
        timeframe: Timeframe.MONTHLY,
        date: bar.date,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
        adjClose: bar.adjClose,
        provider,
        fetchedAt: new Date()
      }))
    })
  ]);
}

export async function refreshSymbol(symbol: string, start = daysAgo(DEFAULT_LOOKBACK_DAYS), end = new Date()) {
  const normalized = symbol.trim().toUpperCase();
  const coverage = await prisma.priceBar.aggregate({
    where: { symbol: normalized, timeframe: Timeframe.DAILY },
    _min: { date: true },
    _max: { date: true }
  });

  const ranges: Array<{ start: Date; end: Date }> = [];
  if (!coverage._min.date || !coverage._max.date) {
    ranges.push({ start, end });
  } else {
    const minDate = coverage._min.date;
    const maxDate = coverage._max.date;
    if (start < minDate) {
      const leftEnd = new Date(minDate);
      leftEnd.setUTCDate(leftEnd.getUTCDate() - 1);
      ranges.push({ start, end: leftEnd });
    }
    if (end > maxDate) {
      const rightStart = new Date(maxDate);
      rightStart.setUTCDate(rightStart.getUTCDate() + 1);
      ranges.push({ start: rightStart, end });
    }
  }

  let provider = "cache";
  let fetchedCount = 0;
  for (const range of ranges) {
    const result = await getDailyBarsWithFailover({
      symbol: normalized,
      start: range.start,
      end: range.end
    });
    provider = result.provider;
    fetchedCount += result.bars.length;
    await upsertBars(normalized, Timeframe.DAILY, provider, result.bars);
  }

  const allDaily = await prisma.priceBar.findMany({
    where: { symbol: normalized, timeframe: Timeframe.DAILY },
    orderBy: { date: "asc" }
  });

  await rewriteDerived(
    normalized,
    provider,
    allDaily.map((bar) => ({
      date: bar.date,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
      adjClose: bar.adjClose ?? undefined
    }))
  );

  await prisma.fetchState.upsert({
    where: {
      symbol_provider: {
        symbol: normalized,
        provider
      }
    },
    update: {
      lastFetchedAt: new Date(),
      rangeStart: start,
      rangeEnd: end
    },
    create: {
      symbol: normalized,
      provider,
      lastFetchedAt: new Date(),
      rangeStart: start,
      rangeEnd: end
    }
  });

  logger.info("Symbol refreshed", { symbol: normalized, provider, bars: fetchedCount });

  return { symbol: normalized, provider, bars: fetchedCount };
}

export async function getBars(symbol: string, timeframe: Timeframe, take = 250) {
  return prisma.priceBar.findMany({
    where: {
      symbol: symbol.toUpperCase(),
      timeframe
    },
    orderBy: { date: "asc" },
    take
  });
}

export async function refreshWatchlist(userId: string) {
  const tickers = await prisma.watchlistTicker.findMany({
    where: { userId },
    select: { symbol: true }
  });

  const results = [];
  for (const ticker of tickers) {
    try {
      const result = await refreshSymbol(ticker.symbol);
      results.push({ symbol: ticker.symbol, ok: true, result });
    } catch (error) {
      logger.error("Watchlist refresh failed", {
        symbol: ticker.symbol,
        error: error instanceof Error ? error.message : String(error)
      });
      results.push({ symbol: ticker.symbol, ok: false });
    }
  }

  return results;
}
