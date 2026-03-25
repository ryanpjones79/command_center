import { logger } from "@/lib/logger";
import { toISODate } from "@/lib/utils";
import type { DailyBarsInput, MarketBar, MarketDataProvider } from "@/providers/market-provider";

type AlphaResponse = {
  [key: string]: unknown;
  "Time Series (Daily)"?: Record<
    string,
    {
      "1. open": string;
      "2. high": string;
      "3. low": string;
      "4. close": string;
      "5. adjusted close": string;
      "6. volume": string;
    }
  >;
};

export class AlphaVantageProvider implements MarketDataProvider {
  name = "alpha-vantage" as const;
  requiresApiKey = true;

  isEnabled() {
    return Boolean(process.env.ALPHA_VANTAGE_API_KEY);
  }

  async getDailyBars(input: DailyBarsInput): Promise<MarketBar[]> {
    const key = process.env.ALPHA_VANTAGE_API_KEY;
    if (!key) {
      throw new Error("ALPHA_VANTAGE_API_KEY not set");
    }

    const url = new URL("https://www.alphavantage.co/query");
    url.searchParams.set("function", "TIME_SERIES_DAILY_ADJUSTED");
    url.searchParams.set("symbol", input.symbol);
    url.searchParams.set("outputsize", "full");
    url.searchParams.set("apikey", key);

    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Alpha Vantage fetch failed (${response.status})`);
    }

    const json = (await response.json()) as AlphaResponse;
    const series = json["Time Series (Daily)"];

    if (!series) {
      throw new Error(`Alpha Vantage returned no daily series for ${input.symbol}`);
    }

    const startIso = input.start ? toISODate(input.start) : null;
    const endIso = input.end ? toISODate(input.end) : null;

    const bars = Object.entries(series)
      .filter(([date]) => (!startIso || date >= startIso) && (!endIso || date <= endIso))
      .map(([date, row]) => ({
        date: new Date(`${date}T00:00:00.000Z`),
        open: Number(row["1. open"]),
        high: Number(row["2. high"]),
        low: Number(row["3. low"]),
        close: Number(row["4. close"]),
        adjClose: Number(row["5. adjusted close"]),
        volume: Number(row["6. volume"])
      }))
      .filter((bar) => Number.isFinite(bar.close))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    logger.info("Alpha Vantage bars fetched", { symbol: input.symbol, count: bars.length });
    return bars;
  }
}
