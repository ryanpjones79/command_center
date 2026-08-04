import { prisma } from "@/lib/prisma";
import {
  formatNotebookEntryType,
  notebookEntrySchema,
  notebookEntryTypes,
  notebookSchema
} from "@/lib/notebook-options";
import { formatNotebookMonth, formatNotebookTitle } from "@/lib/notebook-format";
import { ensureExecutionSetup } from "@/server/execution-service";

export type NotebookSearchFilters = {
  query?: string;
  notebookId?: string;
  entryType?: string;
  domainId?: string;
  projectId?: string;
  date?: string;
};

function startOfToday() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

function parseDateInput(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(value: Date, days: number) {
  const copy = new Date(value);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function getActiveNotebook<T extends { completedAt: Date | null }>(notebooks: T[]) {
  const activeNotebooks = notebooks.filter((notebook) => !notebook.completedAt);
  return activeNotebooks.length === 1 ? activeNotebooks[0] : null;
}

function cleanFilter(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeNotebookFilters(filters?: NotebookSearchFilters) {
  const date = parseDateInput(filters?.date);

  return {
    query: cleanFilter(filters?.query),
    notebookId: cleanFilter(filters?.notebookId),
    entryType: notebookEntryTypes.some((type) => type.value === filters?.entryType)
      ? filters?.entryType
      : undefined,
    domainId: cleanFilter(filters?.domainId),
    projectId: cleanFilter(filters?.projectId),
    date,
    dateInput: date ? filters?.date : undefined
  };
}

export function buildNotebookEntryWhere(userId: string, filters?: NotebookSearchFilters) {
  const normalized = normalizeNotebookFilters(filters);
  const queryNumber = normalized.query ? Number(normalized.query) : Number.NaN;
  const queryClauses = normalized.query
    ? [
        { title: { contains: normalized.query } },
        { summary: { contains: normalized.query } },
        { entryType: { contains: normalized.query.toLowerCase().replace(/\s+/g, "_") } },
        { notebook: { is: { title: { contains: normalized.query } } } },
        { domain: { is: { name: { contains: normalized.query } } } },
        { project: { is: { name: { contains: normalized.query } } } },
        ...(Number.isInteger(queryNumber)
          ? [{ pageNumber: queryNumber }, { notebook: { is: { number: queryNumber } } }]
          : [])
      ]
    : [];

  return {
    userId,
    ...(normalized.notebookId ? { notebookId: normalized.notebookId } : {}),
    ...(normalized.entryType ? { entryType: normalized.entryType } : {}),
    ...(normalized.domainId ? { domainId: normalized.domainId } : {}),
    ...(normalized.projectId ? { projectId: normalized.projectId } : {}),
    ...(normalized.date
      ? { date: { gte: normalized.date, lt: addDays(normalized.date, 1) } }
      : {}),
    ...(queryClauses.length > 0 ? { OR: queryClauses } : {})
  };
}

export async function getNotebookIndexData(userId: string, filters?: NotebookSearchFilters) {
  await ensureExecutionSetup(userId);

  const normalized = normalizeNotebookFilters(filters);
  const [notebooks, domains, projects, entries] = await Promise.all([
    prisma.notebook.findMany({
      where: { userId },
      orderBy: [{ number: "asc" }, { startedAt: "desc" }, { createdAt: "desc" }]
    }),
    prisma.executionDomain.findMany({
      where: { userId },
      orderBy: { name: "asc" }
    }),
    prisma.executionProject.findMany({
      where: { userId },
      orderBy: { name: "asc" },
      include: { domain: true }
    }),
    prisma.notebookEntryIndex.findMany({
      where: buildNotebookEntryWhere(userId, filters),
      include: {
        notebook: true,
        domain: true,
        project: true
      },
      orderBy: [{ date: "desc" }, { updatedAt: "desc" }],
      take: 75
    })
  ]);

  return {
    notebooks,
    activeNotebook: getActiveNotebook(notebooks),
    domains,
    projects,
    entries,
    filters: {
      ...normalized,
      query: normalized.query ?? "",
      notebookId: normalized.notebookId ?? "",
      entryType: normalized.entryType ?? "",
      domainId: normalized.domainId ?? "",
      projectId: normalized.projectId ?? "",
      dateInput: normalized.dateInput ?? ""
    }
  };
}

export async function createNotebook(userId: string, input: unknown) {
  const parsed = notebookSchema.parse(input);

  return prisma.notebook.create({
    data: {
      userId,
      title: parsed.title,
      number: parsed.number ?? null,
      startedAt: parsed.startedAt ?? null,
      completedAt: parsed.completedAt ?? null,
      description: parsed.description ?? null
    }
  });
}

export async function updateNotebook(userId: string, notebookId: string, input: unknown) {
  const parsed = notebookSchema.parse(input);
  const existing = await prisma.notebook.findFirst({
    where: { id: notebookId, userId },
    select: { id: true }
  });

  if (!existing) {
    throw new Error("Notebook does not belong to this user");
  }

  return prisma.notebook.update({
    where: { id: notebookId },
    data: {
      title: parsed.title,
      number: parsed.number ?? null,
      startedAt: parsed.startedAt ?? null,
      completedAt: parsed.completedAt ?? null,
      description: parsed.description ?? null
    }
  });
}

export async function deleteNotebook(userId: string, notebookId: string) {
  return prisma.notebook.deleteMany({
    where: { id: notebookId, userId }
  });
}

export async function createNotebookEntry(userId: string, input: unknown) {
  const parsed = notebookEntrySchema.parse(input);

  const notebook = await prisma.notebook.findFirst({
    where: { id: parsed.notebookId, userId },
    select: { id: true }
  });

  if (!notebook) {
    throw new Error("Notebook is required");
  }

  const [domain, project] = await Promise.all([
    parsed.domainId
      ? prisma.executionDomain.findFirst({
          where: { id: parsed.domainId, userId },
          select: { id: true }
        })
      : null,
    parsed.projectId
      ? prisma.executionProject.findFirst({
          where: { id: parsed.projectId, userId },
          select: { id: true }
        })
      : null
  ]);

  if (parsed.domainId && !domain) {
    throw new Error("Area does not belong to this user");
  }

  if (parsed.projectId && !project) {
    throw new Error("Project does not belong to this user");
  }

  return prisma.notebookEntryIndex.create({
    data: {
      userId,
      notebookId: parsed.notebookId,
      date: parsed.date ?? startOfToday(),
      pageNumber: parsed.pageNumber,
      title: parsed.title,
      entryType: parsed.entryType,
      summary: parsed.summary ?? null,
      domainId: parsed.domainId ?? null,
      projectId: parsed.projectId ?? null
    }
  });
}

export async function updateNotebookEntry(userId: string, entryId: string, input: unknown) {
  const existing = await prisma.notebookEntryIndex.findFirst({
    where: { id: entryId, userId },
    select: { id: true }
  });

  if (!existing) {
    throw new Error("Notebook entry does not belong to this user");
  }

  const parsed = notebookEntrySchema.parse(input);
  const notebook = await prisma.notebook.findFirst({
    where: { id: parsed.notebookId, userId },
    select: { id: true }
  });

  if (!notebook) {
    throw new Error("Notebook is required");
  }

  const [domain, project] = await Promise.all([
    parsed.domainId
      ? prisma.executionDomain.findFirst({
          where: { id: parsed.domainId, userId },
          select: { id: true }
        })
      : null,
    parsed.projectId
      ? prisma.executionProject.findFirst({
          where: { id: parsed.projectId, userId },
          select: { id: true }
        })
      : null
  ]);

  if (parsed.domainId && !domain) {
    throw new Error("Area does not belong to this user");
  }

  if (parsed.projectId && !project) {
    throw new Error("Project does not belong to this user");
  }

  return prisma.notebookEntryIndex.update({
    where: { id: entryId },
    data: {
      notebookId: parsed.notebookId,
      date: parsed.date ?? startOfToday(),
      pageNumber: parsed.pageNumber,
      title: parsed.title,
      entryType: parsed.entryType,
      summary: parsed.summary ?? null,
      domainId: parsed.domainId ?? null,
      projectId: parsed.projectId ?? null
    }
  });
}

export async function deleteNotebookEntry(userId: string, entryId: string) {
  return prisma.notebookEntryIndex.deleteMany({
    where: { id: entryId, userId }
  });
}

export async function getProjectNotebookEntries(userId: string, projectId: string) {
  return prisma.notebookEntryIndex.findMany({
    where: { userId, projectId },
    include: { notebook: true, domain: true },
    orderBy: [{ date: "desc" }, { updatedAt: "desc" }],
    take: 8
  });
}

export { formatNotebookEntryType, formatNotebookMonth, formatNotebookTitle };
