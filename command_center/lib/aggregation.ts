import type { MarketBar } from "@/providers/market-provider";

function weekKey(date: Date): string {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum);
  return target.toISOString().slice(0, 10);
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function aggregate(bars: MarketBar[], keyFn: (date: Date) => string): MarketBar[] {
  const grouped = new Map<string, MarketBar[]>();

  for (const bar of bars) {
    const key = keyFn(bar.date);
    const existing = grouped.get(key) ?? [];
    existing.push(bar);
    grouped.set(key, existing);
  }

  return Array.from(grouped.values())
    .map((group) => {
      const sorted = [...group].sort((a, b) => a.date.getTime() - b.date.getTime());
      return {
        date: sorted[0].date,
        open: sorted[0].open,
        high: Math.max(...sorted.map((bar) => bar.high)),
        low: Math.min(...sorted.map((bar) => bar.low)),
        close: sorted[sorted.length - 1].close,
        adjClose: sorted[sorted.length - 1].adjClose,
        volume: sorted.reduce((sum, bar) => sum + bar.volume, 0)
      };
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function aggregateToWeeklyBars(bars: MarketBar[]): MarketBar[] {
  return aggregate(bars, weekKey);
}

export function aggregateToMonthlyBars(bars: MarketBar[]): MarketBar[] {
  return aggregate(bars, monthKey);
}
