export type StratLabel = "1" | "2u" | "2d" | "3";

export interface CandleLike {
  high: number;
  low: number;
}

export function classifyStratBar(current: CandleLike, previous: CandleLike): StratLabel {
  const breaksHigh = current.high > previous.high;
  const breaksLow = current.low < previous.low;

  if (breaksHigh && breaksLow) return "3";
  if (!breaksHigh && !breaksLow) return "1";
  if (breaksHigh && current.low >= previous.low) return "2u";
  return "2d";
}

export function classifySeries<T extends CandleLike>(bars: T[]): Array<T & { stratLabel: StratLabel | null }> {
  return bars.map((bar, index) => ({
    ...bar,
    stratLabel: index === 0 ? null : classifyStratBar(bar, bars[index - 1])
  }));
}
