import { logger } from "@/lib/logger";
import { toISODate } from "@/lib/utils";
import type { DailyBarsInput, MarketBar, MarketDataProvider } from "@/providers/market-provider";

function toStooqSymbol(symbol: string): string {
  const normalized = symbol.trim().toLowerCase();
  if (normalized === "^vix" || normalized === "vix") return "vix";
  if (normalized.endsWith(".us")) return normalized;
  return `${normalized}.us`;
}

export class StooqProvider implements MarketDataProvider {
  name = "stooq" as const;
  requiresApiKey = false;

  isEnabled() {
    return true;
  }

  async getDailyBars(input: DailyBarsInput): Promise<MarketBar[]> {
    const stooqSymbol = toStooqSymbol(input.symbol);
    const url = `https://stooq.com/q/d/l/?s=${stooqSymbol}&i=d`;
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Stooq fetch failed (${response.status})`);
    }

    const text = await response.text();
    const lines = text.trim().split(/\r?\n/);
    if (lines.length <= 1) {
      throw new Error(`No Stooq data returned for ${input.symbol}`);
    }

    const rows = lines.slice(1);
    const startIso = input.start ? toISODate(input.start) : null;
    const endIso = input.end ? toISODate(input.end) : null;

    const bars = rows
      .map((row) => {
        const [date, open, high, low, close, volume] = row.split(",");
        if (!date || close === "N/D") {
          return null;
        }

        const iso = date.trim();
        if (startIso && iso < startIso) return null;
        if (endIso && iso > endIso) return null;

        const parsed = {
          date: new Date(`${iso}T00:00:00.000Z`),
          open: Number(open),
          high: Number(high),
          low: Number(low),
          close: Number(close),
          volume: Number(volume || 0)
        };

        if (Object.values(parsed).some((value) => Number.isNaN(value as number))) {
          return null;
        }

        return parsed;
      })
      .filter((bar): bar is MarketBar => !!bar)
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    logger.info("Stooq bars fetched", { symbol: input.symbol, count: bars.length });
    return bars;
  }
}
