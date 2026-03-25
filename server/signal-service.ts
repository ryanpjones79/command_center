import { prisma } from "@/lib/prisma";
import { realizedVolatility, sma } from "@/lib/indicators";
import { classifySeries } from "@/strat/classifier";
import { Timeframe } from "@prisma/client";

export type SetupTier = "Bullish" | "Bearish" | "Neutral";
export type SignalTimeframe = "D" | "W" | "M";

function timeframeToDb(tf: SignalTimeframe): Timeframe {
  if (tf === "W") return Timeframe.WEEKLY;
  if (tf === "M") return Timeframe.MONTHLY;
  return Timeframe.DAILY;
}

function alignmentFromStates(monthly: string | null, weekly: string | null, daily: string | null) {
  const isBull = monthly === "2u" && weekly === "2u" && (daily === "2u" || daily === "3");
  const isBear = monthly === "2d" && weekly === "2d" && (daily === "2d" || daily === "3");
  if (isBull) return "Bullish" as const;
  if (isBear) return "Bearish" as const;
  return "Neutral" as const;
}

function calculatePmgScore(
  bars: Array<{ high: number; low: number }>,
  direction: "up" | "down"
): number {
  let score = 0;
  for (let i = bars.length - 1; i > 0; i -= 1) {
    const curr = bars[i];
    const prev = bars[i - 1];
    const trendContinues = direction === "up" ? curr.low >= prev.low : curr.high <= prev.high;
    if (!trendContinues) break;
    score += 1;
  }
  return score;
}

async function fetchVixProxy() {
  const latest = await prisma.priceBar.findFirst({
    where: {
      symbol: "VIX",
      timeframe: Timeframe.DAILY
    },
    orderBy: { date: "desc" }
  });

  return latest?.close ?? null;
}

async function getOptionalTrueIv(symbol: string) {
  const token = process.env.TRADIER_API_KEY;
  if (!token) return null;

  const base = process.env.TRADIER_BASE_URL || "https://sandbox.tradier.com";
  const expirationsUrl = `${base}/v1/markets/options/expirations?symbol=${symbol}&includeAllRoots=true&strikes=false`;

  try {
    const expirationsRes = await fetch(expirationsUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      },
      cache: "no-store"
    });

    if (!expirationsRes.ok) return null;
    const expirationsJson = await expirationsRes.json();
    const expiry = expirationsJson?.expirations?.date?.[0];
    if (!expiry) return null;

    const chainUrl = `${base}/v1/markets/options/chains?symbol=${symbol}&expiration=${expiry}&greeks=true`;
    const chainRes = await fetch(chainUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      },
      cache: "no-store"
    });

    if (!chainRes.ok) return null;
    const chainJson = await chainRes.json();
    const options = chainJson?.options?.option;
    if (!Array.isArray(options) || options.length === 0) return null;

    const ivValues = options
      .map((opt: any) => Number(opt?.greeks?.mid_iv ?? opt?.greeks?.iv))
      .filter((iv: number) => Number.isFinite(iv) && iv > 0);

    if (ivValues.length === 0) return null;
    return ivValues.reduce((sum: number, v: number) => sum + v, 0) / ivValues.length;
  } catch {
    return null;
  }
}

export async function buildSignalRows(
  userId: string,
  options?: {
    timeframe?: SignalTimeframe;
    setup?: SetupTier | "All";
    pmgOnly?: boolean;
    symbolContains?: string;
    allowedSymbols?: string[];
    limit?: number;
  }
) {
  const activeTf = options?.timeframe ?? "D";
  const setupFilter = options?.setup ?? "All";
  const symbolQuery = options?.symbolContains?.trim().toUpperCase() ?? "";
  const allowedSet = options?.allowedSymbols?.length
    ? new Set(options.allowedSymbols.map((symbol) => symbol.toUpperCase()))
    : null;
  const pmgOnly = options?.pmgOnly ?? false;
  const limit = Math.max(10, Math.min(options?.limit ?? 250, 500));

  const [watchlist, settings, vixProxy] = await Promise.all([
    prisma.watchlistTicker.findMany({ where: { userId }, orderBy: { symbol: "asc" } }),
    prisma.userSettings.findUnique({ where: { userId } }),
    fetchVixProxy()
  ]);

  const sectorCounts = watchlist.reduce<Record<string, number>>((acc, ticker) => {
    const key = ticker.sector || "Unspecified";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const rows = [] as Array<{
    symbol: string;
    setupTier: SetupTier;
    tf: SignalTimeframe;
    tfc: { d: string | null; w: string | null; m: string | null };
    c1: string | null;
    c2: string | null;
    pmg: number;
    strat: { daily: string | null; weekly: string | null; monthly: string | null };
    checklist: {
      earnings: string;
      liquidity: string;
      concentration: string;
      vol: string;
    };
    strategyHint: string;
    avgVolume: number;
    rv20: number | null;
    lastClose: number;
    lastDate: Date;
  }>;

  for (const ticker of watchlist) {
    const [daily, weekly, monthly] = await Promise.all([
      prisma.priceBar.findMany({
        where: { symbol: ticker.symbol, timeframe: Timeframe.DAILY },
        orderBy: { date: "asc" },
        take: 220
      }),
      prisma.priceBar.findMany({
        where: { symbol: ticker.symbol, timeframe: Timeframe.WEEKLY },
        orderBy: { date: "asc" },
        take: 70
      }),
      prisma.priceBar.findMany({
        where: { symbol: ticker.symbol, timeframe: Timeframe.MONTHLY },
        orderBy: { date: "asc" },
        take: 36
      })
    ]);

    if (daily.length < 30 || weekly.length < 3 || monthly.length < 3) {
      continue;
    }

    const dState = classifySeries(daily).at(-1)?.stratLabel ?? null;
    const wState = classifySeries(weekly).at(-1)?.stratLabel ?? null;
    const mState = classifySeries(monthly).at(-1)?.stratLabel ?? null;
    const setupTier = alignmentFromStates(mState, wState, dState);
    const tfBars = activeTf === "D" ? daily : activeTf === "W" ? weekly : monthly;
    const tfClassified = classifySeries(tfBars);
    const c1 = tfClassified.at(-1)?.stratLabel ?? null;
    const c2 = tfClassified.at(-2)?.stratLabel ?? null;

    const closes = daily.map((bar) => bar.close);
    const rv = realizedVolatility(closes, 20);
    const avgVolume = daily.slice(-30).reduce((sum, bar) => sum + bar.volume, 0) / 30;
    const lastDaily = daily.at(-1);
    if (!lastDaily) {
      continue;
    }

    const earningsBuffer = settings?.earningsBufferDays ?? 7;
    const now = new Date();
    const earningsDistance = ticker.nextEarningsDate
      ? Math.ceil((ticker.nextEarningsDate.getTime() - now.getTime()) / 86400000)
      : null;

    const earnings =
      earningsDistance === null
        ? "Unknown"
        : earningsDistance <= earningsBuffer
          ? `Avoid (${earningsDistance}d)`
          : `Clear (${earningsDistance}d)`;

    const liquidity = avgVolume > 1_000_000 ? "Pass" : avgVolume > 400_000 ? "Watch" : "Low";

    const maxPerSector = settings?.concentrationLimit ?? 4;
    const sectorCount = sectorCounts[ticker.sector || "Unspecified"] ?? 0;
    const concentration = sectorCount > maxPerSector ? `Warn (${sectorCount})` : "Pass";

    const trueIv = await getOptionalTrueIv(ticker.symbol);
    const vol =
      trueIv !== null
        ? `True IV ${trueIv.toFixed(2)} (Tradier)`
        : `Proxy RV ${rv?.toFixed(1) ?? "n/a"}% / VIX ${vixProxy?.toFixed(1) ?? "n/a"} / IVR ${
            ticker.manualIvrBucket ?? "manual"
          }`;

    const strategyHint =
      setupTier === "Bullish"
        ? settings?.definedRiskOnly
          ? "Put spread"
          : "Short put"
        : setupTier === "Bearish"
          ? settings?.definedRiskOnly
            ? "Call spread"
            : "Short call"
          : "Iron condor / wait";

    const pmgDirection = setupTier === "Bearish" ? "down" : "up";
    const pmg = calculatePmgScore(tfBars, pmgDirection);

    if (symbolQuery && !ticker.symbol.includes(symbolQuery)) {
      continue;
    }
    if (allowedSet && !allowedSet.has(ticker.symbol)) {
      continue;
    }
    if (setupFilter !== "All" && setupTier !== setupFilter) {
      continue;
    }
    if (pmgOnly && pmg < 5) {
      continue;
    }

    rows.push({
      symbol: ticker.symbol,
      setupTier,
      tf: activeTf,
      tfc: { d: dState, w: wState, m: mState },
      c1,
      c2,
      pmg,
      strat: { daily: dState, weekly: wState, monthly: mState },
      checklist: { earnings, liquidity, concentration, vol },
      strategyHint,
      avgVolume,
      rv20: rv,
      lastClose: lastDaily.close,
      lastDate: lastDaily.date
    });
  }

  return rows
    .sort((a, b) => b.pmg - a.pmg || a.symbol.localeCompare(b.symbol))
    .slice(0, limit);
}

export function buildWatchlistMetrics(bars: Array<{ close: number; volume: number }>) {
  const closes = bars.map((bar) => bar.close);
  const sma20 = sma(closes, 20).at(-1) ?? null;
  const sma50 = sma(closes, 50).at(-1) ?? null;
  const sma200 = sma(closes, 200).at(-1) ?? null;
  const rv20 = realizedVolatility(closes, 20);

  return { sma20, sma50, sma200, rv20 };
}
