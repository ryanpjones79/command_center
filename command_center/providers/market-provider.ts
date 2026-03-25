export type ProviderName = "stooq" | "alpha-vantage";

export interface MarketBar {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjClose?: number;
}

export interface DailyBarsInput {
  symbol: string;
  start?: Date;
  end?: Date;
}

export interface MarketDataProvider {
  name: ProviderName;
  requiresApiKey: boolean;
  isEnabled(): boolean;
  getDailyBars(input: DailyBarsInput): Promise<MarketBar[]>;
}
