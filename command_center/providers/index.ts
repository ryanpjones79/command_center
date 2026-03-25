import type { MarketBar, MarketDataProvider } from "@/providers/market-provider";
import { StooqProvider } from "@/providers/stooq-provider";
import { AlphaVantageProvider } from "@/providers/alpha-vantage-provider";
import { logger } from "@/lib/logger";

const providers: MarketDataProvider[] = [new StooqProvider(), new AlphaVantageProvider()];

export async function getDailyBarsWithFailover(args: {
  symbol: string;
  start?: Date;
  end?: Date;
}): Promise<{ bars: MarketBar[]; provider: string }> {
  let lastError: unknown = null;

  for (const provider of providers) {
    if (!provider.isEnabled()) {
      continue;
    }

    try {
      const bars = await provider.getDailyBars(args);
      if (bars.length === 0) {
        throw new Error("Provider returned no bars");
      }
      return { bars, provider: provider.name };
    } catch (error) {
      lastError = error;
      logger.warn("Provider failed, trying next", {
        symbol: args.symbol,
        provider: provider.name,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  throw new Error(
    `All market data providers failed for ${args.symbol}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}
