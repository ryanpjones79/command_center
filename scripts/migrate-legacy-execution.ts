import { PrismaClient } from "@prisma/client";

type LegacyArea = {
  id: string;
  userId: string;
  name: string;
  description: string | null;
};

type LegacyProject = {
  id: string;
  userId: string;
  areaId: string;
  name: string;
  status: string;
  priority: string;
  nextAction: string | null;
  description: string | null;
  lastTouched: Date | null;
};

type LegacyTask = {
  id: string;
  userId: string;
  projectId: string;
  title: string;
  details: string | null;
  dueDate: Date | null;
  priority: string;
  tags: string;
  isComplete: boolean;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
};

const prisma = new PrismaClient();

function inferTaskType(tags: string) {
  const value = tags.toLowerCase();
  if (value.includes("follow") || value.includes("waiting")) return "FOLLOW_UP" as const;
  if (value.includes("admin")) return "ADMIN" as const;
  if (value.includes("quick")) return "QUICK_WIN" as const;
  return "ACTION" as const;
}

function inferWhenBucket(tags: string) {
  const value = tags.toLowerCase();
  if (value.includes("today")) return "TODAY" as const;
  if (value.includes("week")) return "THIS_WEEK" as const;
  if (value.includes("waiting")) return "WAITING" as const;
  if (value.includes("parking")) return "PARKING_LOT" as const;
  return "LATER" as const;
}

function inferProjectActiveStatus(status: string) {
  if (status === "COMPLETED" || status === "ARCHIVED") return "COMPLETED" as const;
  if (status === "ON_HOLD") return "PARKED" as const;
  return "ACTIVE_LATER" as const;
}

function inferProjectStatus(status: string) {
  if (status === "COMPLETED" || status === "ARCHIVED") return "COMPLETED" as const;
  return "ON_TRACK" as const;
}

async function main() {
  const tables = (await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('Area', 'Project', 'Task')"
  )).map((row) => row.name);

  if (!tables.includes("Area") || !tables.includes("Project") || !tables.includes("Task")) {
    console.log("Legacy Area/Project/Task tables not found. Nothing to migrate.");
    return;
  }

  const users = await prisma.user.findMany({ select: { id: true } });
  if (users.length === 0) {
    console.log("No users found. Seed a user first.");
    return;
  }

  for (const user of users) {
    const legacyAreas = await prisma.$queryRawUnsafe<LegacyArea[]>(
      `SELECT id, userId, name, description FROM "Area" WHERE userId = '${user.id}'`
    );
    const legacyProjects = await prisma.$queryRawUnsafe<LegacyProject[]>(
      `SELECT id, userId, areaId, name, status, priority, nextAction, description, lastTouched FROM "Project" WHERE userId = '${user.id}'`
    );
    const legacyTasks = await prisma.$queryRawUnsafe<LegacyTask[]>(
      `SELECT id, userId, projectId, title, details, dueDate, priority, tags, isComplete, createdAt, updatedAt, completedAt FROM "Task" WHERE userId = '${user.id}'`
    );

    const domainMap = new Map<string, string>();

    for (const area of legacyAreas) {
      const slug = area.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const domain = await prisma.executionDomain.upsert({
        where: { userId_slug: { userId: user.id, slug } },
        update: { name: area.name, description: area.description },
        create: {
          userId: user.id,
          name: area.name,
          slug,
          description: area.description,
          isDefault: false
        }
      });
      domainMap.set(area.id, domain.id);
    }

    const projectMap = new Map<string, string>();

    for (const project of legacyProjects) {
      const migratedProject = await prisma.executionProject.upsert({
        where: { userId_name: { userId: user.id, name: project.name } },
        update: {
          domainId: domainMap.get(project.areaId) ?? Array.from(domainMap.values())[0],
          status: inferProjectStatus(project.status),
          activeStatus: inferProjectActiveStatus(project.status),
          priority: (project.priority as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL") ?? "MEDIUM",
          nextAction: project.nextAction,
          note: project.description,
          lastReviewedAt: project.lastTouched
        },
        create: {
          userId: user.id,
          domainId: domainMap.get(project.areaId) ?? Array.from(domainMap.values())[0],
          name: project.name,
          status: inferProjectStatus(project.status),
          activeStatus: inferProjectActiveStatus(project.status),
          weeklyFocus: "NONE",
          priority: (project.priority as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL") ?? "MEDIUM",
          nextAction: project.nextAction,
          note: project.description,
          lastReviewedAt: project.lastTouched
        }
      });
      projectMap.set(project.id, migratedProject.id);
    }

    for (const task of legacyTasks) {
      const legacyProject = legacyProjects.find((project) => project.id === task.projectId);
      const domainId =
        (legacyProject ? domainMap.get(legacyProject.areaId) : null) ?? Array.from(domainMap.values())[0];
      if (!domainId) continue;

      await prisma.executionTask.create({
        data: {
          userId: user.id,
          domainId,
          projectId: projectMap.get(task.projectId) ?? null,
          title: task.title,
          type: inferTaskType(task.tags),
          status: task.isComplete ? "DONE" : "NOT_STARTED",
          priority: (task.priority as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL") ?? "MEDIUM",
          whenBucket: inferWhenBucket(task.tags),
          dueDate: task.dueDate,
          note: task.details,
          completedAt: task.completedAt
        }
      });
    }
  }

  console.log("Legacy execution migration complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
