import { prisma } from "@/lib/prisma";
import {
  parseWisdomTags,
  wisdomCategories,
  wisdomEntrySchema,
  wisdomInboxSchema,
  wisdomReflectionSchema,
  wisdomSourceTypes,
  wisdomStatuses
} from "@/lib/wisdom-options";
import { ensureExecutionSetup } from "@/server/execution-service";

export type WisdomFilters = {
  q?: string;
  section?: string;
  category?: string;
  sourceType?: string;
};

function startOfToday() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

function cleanFilter(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function titleFromIdea(value: string) {
  const firstLine = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  const source = firstLine || value.trim();
  return source.length > 80 ? `${source.slice(0, 77)}...` : source;
}

function normalizeWisdomFilters(filters?: WisdomFilters) {
  const sourceType = wisdomSourceTypes.some(
    (type) => type.value === filters?.sourceType
  )
    ? filters?.sourceType
    : undefined;
  const category = wisdomCategories.includes(filters?.category as never)
    ? filters?.category
    : undefined;
  const section = ["inbox", "active", "favorites", "all", "archived"].includes(
    filters?.section ?? ""
  )
    ? filters?.section
    : "all";

  return {
    q: cleanFilter(filters?.q),
    section,
    category,
    sourceType
  };
}

function buildWisdomWhere(userId: string, filters?: WisdomFilters) {
  const normalized = normalizeWisdomFilters(filters);
  const queryClauses = normalized.q
    ? [
        { title: { contains: normalized.q } },
        { idea: { contains: normalized.q } },
        { takeaway: { contains: normalized.q } },
        { application: { contains: normalized.q } },
        { sourceName: { contains: normalized.q } },
        { author: { contains: normalized.q } },
        { tags: { contains: normalized.q } }
      ]
    : [];

  return {
    userId,
    ...(normalized.section === "inbox" ? { status: "inbox" } : {}),
    ...(normalized.section === "active"
      ? { status: "library", active: true }
      : {}),
    ...(normalized.section === "favorites"
      ? { status: "library", favorite: true }
      : {}),
    ...(normalized.section === "archived" ? { status: "archived" } : {}),
    ...(normalized.section === "all" ? { status: { not: "archived" } } : {}),
    ...(normalized.category ? { category: normalized.category } : {}),
    ...(normalized.sourceType ? { sourceType: normalized.sourceType } : {}),
    ...(queryClauses.length > 0 ? { OR: queryClauses } : {})
  };
}

export async function getWisdomLibraryData(
  userId: string,
  filters?: WisdomFilters,
  selectedEntryId?: string
) {
  await ensureExecutionSetup(userId);
  const normalized = normalizeWisdomFilters(filters);

  const [entries, counts, selectedEntry, domains, projects] = await Promise.all([
    prisma.wisdomEntry.findMany({
      where: buildWisdomWhere(userId, filters),
      include: {
        notebookEntry: { include: { notebook: true } },
        reflections: { orderBy: { createdAt: "desc" }, take: 3 }
      },
      orderBy: [
        { active: "desc" },
        { favorite: "desc" },
        { capturedAt: "desc" },
        { updatedAt: "desc" }
      ],
      take: 100
    }),
    prisma.wisdomEntry.groupBy({
      by: ["status"],
      where: { userId },
      _count: { _all: true }
    }),
    selectedEntryId
      ? prisma.wisdomEntry.findFirst({
          where: { id: selectedEntryId, userId },
          include: {
            notebookEntry: { include: { notebook: true } },
            reflections: { orderBy: { createdAt: "desc" }, take: 10 }
          }
        })
      : Promise.resolve(null),
    prisma.executionDomain.findMany({
      where: { userId },
      orderBy: { name: "asc" }
    }),
    prisma.executionProject.findMany({
      where: { userId },
      orderBy: { name: "asc" },
      include: { domain: true }
    })
  ]);

  const countMap = new Map(
    counts.map((item) => [item.status, item._count._all])
  );
  const activeCount = await prisma.wisdomEntry.count({
    where: { userId, status: "library", active: true }
  });
  const favoriteCount = await prisma.wisdomEntry.count({
    where: { userId, status: "library", favorite: true }
  });

  return {
    entries,
    selectedEntry,
    domains,
    projects,
    counts: {
      inbox: countMap.get("inbox") ?? 0,
      library: countMap.get("library") ?? 0,
      archived: countMap.get("archived") ?? 0,
      active: activeCount,
      favorites: favoriteCount
    },
    filters: {
      q: normalized.q ?? "",
      section: normalized.section ?? "all",
      category: normalized.category ?? "",
      sourceType: normalized.sourceType ?? ""
    }
  };
}

export async function getTodaysPrinciple(userId: string) {
  await ensureExecutionSetup(userId);

  const preferred = await prisma.wisdomEntry.findFirst({
    where: { userId, status: "library", active: true },
    include: { reflections: { orderBy: { createdAt: "desc" }, take: 2 } },
    orderBy: [{ lastShownAt: "asc" }, { capturedAt: "desc" }]
  });

  if (preferred) return preferred;

  return prisma.wisdomEntry.findFirst({
    where: {
      userId,
      status: "library",
      OR: [{ favorite: true }, { active: true }]
    },
    include: { reflections: { orderBy: { createdAt: "desc" }, take: 2 } },
    orderBy: [{ favorite: "desc" }, { lastShownAt: "asc" }, { capturedAt: "desc" }]
  });
}

export async function createWisdomInboxItem(userId: string, input: unknown) {
  const parsed = wisdomInboxSchema.parse(input);

  return prisma.wisdomEntry.create({
    data: {
      userId,
      title: titleFromIdea(parsed.idea),
      idea: parsed.idea,
      sourceType: parsed.sourceType,
      sourceName: parsed.sourceName ?? null,
      photoUrl: parsed.photoUrl ?? null,
      status: "inbox",
      category: "Other",
      capturedAt: startOfToday()
    }
  });
}

export async function createWisdomEntry(userId: string, input: unknown) {
  const parsed = wisdomEntrySchema.parse(input);

  return prisma.wisdomEntry.create({
    data: {
      userId,
      title: parsed.title,
      idea: parsed.idea,
      takeaway: parsed.takeaway ?? null,
      application: parsed.application ?? null,
      sourceType: parsed.sourceType,
      sourceName: parsed.sourceName ?? null,
      author: parsed.author ?? null,
      reference: parsed.reference ?? null,
      category: parsed.category,
      capturedAt: parsed.capturedAt ?? startOfToday(),
      favorite: parsed.favorite,
      active: parsed.active,
      tags: parsed.tags ?? null,
      photoUrl: parsed.photoUrl ?? null,
      status: parsed.status,
      notebookEntryId: parsed.notebookEntryId ?? null
    }
  });
}

export async function updateWisdomEntry(
  userId: string,
  wisdomId: string,
  input: unknown
) {
  const existing = await prisma.wisdomEntry.findFirst({
    where: { id: wisdomId, userId },
    select: { id: true }
  });
  if (!existing) throw new Error("Wisdom entry does not belong to this user");

  const parsed = wisdomEntrySchema.parse(input);

  return prisma.wisdomEntry.update({
    where: { id: wisdomId },
    data: {
      title: parsed.title,
      idea: parsed.idea,
      takeaway: parsed.takeaway ?? null,
      application: parsed.application ?? null,
      sourceType: parsed.sourceType,
      sourceName: parsed.sourceName ?? null,
      author: parsed.author ?? null,
      reference: parsed.reference ?? null,
      category: parsed.category,
      capturedAt: parsed.capturedAt ?? startOfToday(),
      favorite: parsed.favorite,
      active: parsed.active,
      tags: parsed.tags ?? null,
      photoUrl: parsed.photoUrl ?? null,
      status: parsed.status,
      notebookEntryId: parsed.notebookEntryId ?? null,
      archivedAt: parsed.status === "archived" ? new Date() : null
    }
  });
}

export async function promoteInboxWisdom(userId: string, wisdomId: string) {
  return prisma.wisdomEntry.updateMany({
    where: { id: wisdomId, userId, status: "inbox" },
    data: { status: "library", active: true }
  });
}

export async function setWisdomStatus(
  userId: string,
  wisdomId: string,
  status: string
) {
  if (!wisdomStatuses.includes(status as never)) {
    throw new Error("Invalid wisdom status");
  }

  return prisma.wisdomEntry.updateMany({
    where: { id: wisdomId, userId },
    data: {
      status,
      archivedAt: status === "archived" ? new Date() : null
    }
  });
}

export async function toggleWisdomFavorite(userId: string, wisdomId: string) {
  const entry = await prisma.wisdomEntry.findFirst({
    where: { id: wisdomId, userId },
    select: { id: true, favorite: true }
  });
  if (!entry) return null;

  return prisma.wisdomEntry.update({
    where: { id: entry.id },
    data: { favorite: !entry.favorite }
  });
}

export async function toggleWisdomActive(userId: string, wisdomId: string) {
  const entry = await prisma.wisdomEntry.findFirst({
    where: { id: wisdomId, userId },
    select: { id: true, active: true, status: true }
  });
  if (!entry) return null;

  return prisma.wisdomEntry.update({
    where: { id: entry.id },
    data: { active: !entry.active, status: entry.status === "inbox" ? "library" : entry.status }
  });
}

export async function markWisdomShown(userId: string, wisdomId: string) {
  return prisma.wisdomEntry.updateMany({
    where: { id: wisdomId, userId },
    data: { lastShownAt: new Date() }
  });
}

export async function deleteWisdomEntry(userId: string, wisdomId: string) {
  return prisma.wisdomEntry.deleteMany({
    where: { id: wisdomId, userId }
  });
}

export async function addWisdomReflection(
  userId: string,
  wisdomId: string,
  input: unknown
) {
  const entry = await prisma.wisdomEntry.findFirst({
    where: { id: wisdomId, userId },
    select: { id: true }
  });
  if (!entry) throw new Error("Wisdom entry does not belong to this user");

  const parsed = wisdomReflectionSchema.parse(input);

  return prisma.wisdomReflection.create({
    data: {
      userId,
      wisdomId,
      text: parsed.text,
      date: startOfToday()
    }
  });
}

export async function promoteNotebookEntryToWisdom(
  userId: string,
  notebookEntryId: string
) {
  const entry = await prisma.notebookEntryIndex.findFirst({
    where: { id: notebookEntryId, userId },
    include: { notebook: true }
  });
  if (!entry) throw new Error("Notebook entry does not belong to this user");

  return prisma.wisdomEntry.create({
    data: {
      userId,
      title: entry.title,
      idea: entry.summary ?? entry.title,
      takeaway: null,
      sourceType: "personal_insight",
      sourceName: entry.notebook.title,
      reference: `Page ${entry.pageNumber}`,
      category: "Personal Growth",
      capturedAt: entry.date ?? startOfToday(),
      status: "inbox",
      notebookEntryId: entry.id
    }
  });
}

export { parseWisdomTags };
