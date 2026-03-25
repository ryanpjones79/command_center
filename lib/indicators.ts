export function sma(values: number[], period: number): Array<number | null> {
  let rolling = 0;

  return values.map((value, index) => {
    rolling += value;
    if (index >= period) {
      rolling -= values[index - period];
    }

    if (index < period - 1) {
      return null;
    }

    return rolling / period;
  });
}

export function realizedVolatility(values: number[], period = 20): number | null {
  if (values.length <= period) return null;

  const returns: number[] = [];
  for (let i = values.length - period; i < values.length; i += 1) {
    const prev = values[i - 1];
    const curr = values[i];
    if (!prev || !curr) continue;
    returns.push(Math.log(curr / prev));
  }

  if (returns.length < period - 1) return null;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(returns.length - 1, 1);

  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}
