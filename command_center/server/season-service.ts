import { prisma } from "@/lib/prisma";
import { seasonSchema } from "@/lib/season-options";

function parseDate(value: string | undefined) {
  if (!value) return null;
  return new Date(`${value}T12:00:00`);
}

export async function getOwnedSeason(userId: string, seasonId: string | null | undefined) {
  if (!seasonId) return null;
  return prisma.season.findFirst({
    where: { id: seasonId, userId },
    select: { id: true }
  });
}

export async function getCurrentSeason(userId: string) {
  return prisma.season.findFirst({
    where: { userId, isCurrent: true },
    include: {
      projects: {
        where: { activeStatus: { not: "COMPLETED" } },
        include: { domain: true },
        orderBy: [{ weeklyFocus: "asc" }, { priority: "desc" }, { updatedAt: "desc" }],
        take: 8
      }
    },
    orderBy: { updatedAt: "desc" }
  });
}

export async function getSeasonArchive(userId: string) {
  const seasons = await prisma.season.findMany({
    where: { userId },
    include: {
      projects: {
        include: { domain: true },
        orderBy: [{ activeStatus: "asc" }, { name: "asc" }]
      }
    },
    orderBy: [{ isCurrent: "desc" }, { startedAt: "desc" }, { updatedAt: "desc" }]
  });

  return {
    currentSeason: seasons.find((season) => season.isCurrent) ?? null,
    seasons,
    completedSeasons: seasons.filter((season) => season.status === "COMPLETED")
  };
}

export async function createSeason(userId: string, formData: FormData) {
  const parsed = seasonSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    startedAt: formData.get("startedAt"),
    completedAt: formData.get("completedAt"),
    status: formData.get("status") || "ACTIVE",
    themeColor: formData.get("themeColor"),
    icon: formData.get("icon"),
    isCurrent: formData.get("isCurrent") === "on"
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid season" };
  }

  const data = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      if (data.isCurrent) {
        await tx.season.updateMany({
          where: { userId, isCurrent: true },
          data: { isCurrent: false }
        });
      }

      await tx.season.create({
        data: {
          userId,
          title: data.title,
          description: data.description || null,
          startedAt: parseDate(data.startedAt),
          completedAt: parseDate(data.completedAt),
          status: data.status,
          themeColor: data.themeColor || null,
          icon: data.icon || null,
          isCurrent: data.isCurrent
        }
      });
    });
  } catch {
    return { ok: false, error: "Season title already exists." };
  }

  return { ok: true, error: "" };
}

export async function updateSeason(userId: string, seasonId: string, formData: FormData) {
  const season = await getOwnedSeason(userId, seasonId);
  if (!season) return;

  const parsed = seasonSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    startedAt: formData.get("startedAt"),
    completedAt: formData.get("completedAt"),
    status: formData.get("status") || "ACTIVE",
    themeColor: formData.get("themeColor"),
    icon: formData.get("icon"),
    isCurrent: formData.get("isCurrent") === "on"
  });

  if (!parsed.success) return;
  const data = parsed.data;

  await prisma.$transaction(async (tx) => {
    if (data.isCurrent) {
      await tx.season.updateMany({
        where: { userId, isCurrent: true, id: { not: season.id } },
        data: { isCurrent: false }
      });
    }

    await tx.season.update({
      where: { id: season.id },
      data: {
        title: data.title,
        description: data.description || null,
        startedAt: parseDate(data.startedAt),
        completedAt: data.status === "COMPLETED" ? parseDate(data.completedAt) ?? new Date() : parseDate(data.completedAt),
        status: data.status,
        themeColor: data.themeColor || null,
        icon: data.icon || null,
        isCurrent: data.status === "COMPLETED" || data.status === "ARCHIVED" ? false : data.isCurrent
      }
    });
  });
}

export async function setCurrentSeason(userId: string, seasonId: string) {
  const season = await getOwnedSeason(userId, seasonId);
  if (!season) return;

  await prisma.$transaction([
    prisma.season.updateMany({
      where: { userId, isCurrent: true },
      data: { isCurrent: false }
    }),
    prisma.season.update({
      where: { id: season.id },
      data: { isCurrent: true, status: "ACTIVE" }
    })
  ]);
}

export async function completeSeason(userId: string, seasonId: string) {
  const season = await getOwnedSeason(userId, seasonId);
  if (!season) return;

  await prisma.season.update({
    where: { id: season.id },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      isCurrent: false
    }
  });
}
