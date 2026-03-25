import { prisma } from "@/lib/prisma";
import { toSymbol } from "@/lib/utils";
import { addTickerSchema } from "@/lib/validation";

export async function addTicker(userId: string, formData: FormData) {
  const parsed = addTickerSchema.safeParse({
    symbol: formData.get("symbol"),
    sector: formData.get("sector") || undefined,
    manualIvrBucket: formData.get("manualIvrBucket") || undefined,
    nextEarningsDate: formData.get("nextEarningsDate") || undefined
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid ticker input");
  }

  const symbol = toSymbol(parsed.data.symbol);

  await prisma.watchlistTicker.upsert({
    where: {
      userId_symbol: {
        userId,
        symbol
      }
    },
    update: {
      sector: parsed.data.sector,
      manualIvrBucket: parsed.data.manualIvrBucket,
      nextEarningsDate: parsed.data.nextEarningsDate ? new Date(parsed.data.nextEarningsDate) : null
    },
    create: {
      userId,
      symbol,
      sector: parsed.data.sector,
      manualIvrBucket: parsed.data.manualIvrBucket,
      nextEarningsDate: parsed.data.nextEarningsDate ? new Date(parsed.data.nextEarningsDate) : null
    }
  });
}

export async function getWatchlist(userId: string) {
  return prisma.watchlistTicker.findMany({
    where: { userId },
    orderBy: { symbol: "asc" }
  });
}
