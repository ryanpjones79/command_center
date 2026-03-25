import { prisma } from "@/lib/prisma";

export const PREDEFINED_GROUPS: Record<string, string[]> = {
  "All Symbols": [],
  "Mega Cap Tech": ["AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL"],
  "Index ETFs": ["SPY", "QQQ", "IWM", "DIA", "XLF", "XLK", "XLE", "XLI", "XLV"],
  "Payment Names": ["PYPL", "SQ", "AXP", "V", "MA"]
};

export function getGroupSymbols(groupName?: string) {
  if (!groupName) return [];
  return PREDEFINED_GROUPS[groupName] ?? [];
}

export async function getSavedSignalFilters(userId: string) {
  return prisma.savedSignalFilter.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" }
  });
}

export async function saveSignalFilter(userId: string, name: string, query: string) {
  const cleanName = name.trim();
  if (!cleanName) {
    throw new Error("Filter name is required");
  }

  return prisma.savedSignalFilter.upsert({
    where: {
      userId_name: {
        userId,
        name: cleanName
      }
    },
    update: { query },
    create: {
      userId,
      name: cleanName,
      query
    }
  });
}

export async function deleteSignalFilter(userId: string, id: string) {
  const existing = await prisma.savedSignalFilter.findFirst({
    where: { id, userId },
    select: { id: true }
  });
  if (!existing) {
    return;
  }

  await prisma.savedSignalFilter.delete({ where: { id } });
}
