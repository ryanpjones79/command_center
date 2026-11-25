import { Prisma, type PrismaClient } from "@prisma/client";
import {
  TaskConnectorError,
  createTaskInput,
  updateTaskInput,
  listTaskInput,
  parseInput,
  rejectSensitiveContext,
  type TaskAccess,
} from "@/lib/task-connector-contract";
import { nextExecutionTaskOccurrence } from "@/server/execution-task-recurrence";

const taskSelect = {
  id: true,
  domainId: true,
  projectId: true,
  title: true,
  type: true,
  status: true,
  priority: true,
  whenBucket: true,
  estimatedDuration: true,
  dueDate: true,
  followUpDate: true,
  waitingOn: true,
  note: true,
  source: true,
  isBlocked: true,
  integrationSourceKey: true,
  updatedAt: true,
  completedAt: true,
  recurrenceFrequency: true,
} satisfies Prisma.ExecutionTaskSelect;
const referenceSelect = {
  id: true,
  provider: true,
  title: true,
  url: true,
  note: true,
} satisfies Prisma.ExecutionTaskReferenceSelect;
type Database = Prisma.TransactionClient;

function requireOperation(
  access: TaskAccess,
  operation: TaskAccess["operations"][number],
) {
  if (
    !access.userId ||
    !access.operations.includes("read") ||
    !access.operations.includes(operation)
  )
    throw new TaskConnectorError(403, "SCOPE_DENIED", "Task operation denied.");
}
function domainScope(access: TaskAccess) {
  return access.domainIds === null
    ? {}
    : { domainId: { in: access.domainIds } };
}
async function requireDomain(
  db: Database,
  access: TaskAccess,
  domainId: string,
) {
  if (access.domainIds !== null && !access.domainIds.includes(domainId))
    throw notFound();
  if (
    !(await db.executionDomain.findFirst({
      where: { id: domainId, userId: access.userId },
      select: { id: true },
    }))
  )
    throw notFound();
}
async function requireProject(
  db: Database,
  access: TaskAccess,
  domainId: string,
  projectId?: string | null,
) {
  if (
    projectId &&
    !(await db.executionProject.findFirst({
      where: { id: projectId, userId: access.userId, domainId },
      select: { id: true },
    }))
  )
    throw notFound();
}
function notFound() {
  return new TaskConnectorError(
    404,
    "NOT_FOUND",
    "Task, area or project not found in your scope.",
  );
}
function conflict() {
  return new TaskConnectorError(
    409,
    "VERSION_CONFLICT",
    "Task changed. Read it again and reconcile before updating.",
  );
}

export function createTaskConnectorService(db: PrismaClient) {
  const scope = (access: TaskAccess) => ({
    userId: access.userId,
    ...domainScope(access),
  });
  const read = async (database: Database, access: TaskAccess, id: string) => {
    const task = await database.executionTask.findFirst({
      where: { id, ...scope(access) },
      select: taskSelect,
    });
    if (!task) throw notFound();
    await requireDomain(database, access, task.domainId);
    // Do not expose a legacy project/reference whose ownership is inconsistent with the task.
    const project = task.projectId
      ? await database.executionProject.findFirst({
          where: {
            id: task.projectId,
            userId: access.userId,
            domainId: task.domainId,
          },
          select: { id: true },
        })
      : null;
    const references = await database.executionTaskReference.findMany({
      where: { taskId: id, userId: access.userId },
      select: referenceSelect,
      orderBy: { createdAt: "asc" },
    });
    return {
      ...task,
      projectId: project?.id ?? null,
      references,
      taskPath: `/tasks?taskId=${encodeURIComponent(id)}`,
    };
  };
  // Retry only database serialization failures, never stale client versions.
  const transaction = async <T>(
    work: (tx: Database) => Promise<T>,
  ): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await db.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034" &&
          attempt < 2
        )
          continue;
        throw error;
      }
    }
  };
  const appendReferences = async (
    tx: Database,
    access: TaskAccess,
    taskId: string,
    refs: Array<{
      provider: string;
      title: string;
      url: string;
      note?: string | null;
    }>,
  ) => {
    for (const ref of refs) {
      if (
        !(await tx.executionTaskReference.findFirst({
          where: {
            userId: access.userId,
            taskId,
            provider: ref.provider,
            url: ref.url,
          },
          select: { id: true },
        }))
      ) {
        await tx.executionTaskReference.create({
          data: { ...ref, userId: access.userId, taskId },
        });
      }
    }
  };
  return {
    async catalog(access: TaskAccess) {
      requireOperation(access, "read");
      const areas = await db.executionDomain.findMany({
        where: {
          userId: access.userId,
          ...(access.domainIds === null
            ? {}
            : { id: { in: access.domainIds } }),
        },
        select: { id: true, name: true, slug: true },
        orderBy: { name: "asc" },
      });
      const projects = await db.executionProject.findMany({
        where: {
          userId: access.userId,
          domainId: { in: areas.map((area) => area.id) },
        },
        select: {
          id: true,
          domainId: true,
          name: true,
          status: true,
          activeStatus: true,
        },
        orderBy: { name: "asc" },
      });
      return { areas, projects };
    },
    async list(access: TaskAccess, raw: unknown) {
      requireOperation(access, "read");
      const input = parseInput(listTaskInput, raw);
      await requireDomain(db, access, input.domainId);
      await requireProject(db, access, input.domainId, input.projectId);
      const tasks = await db.executionTask.findMany({
        where: {
          ...scope(access),
          domainId: input.domainId,
          ...(input.projectId ? { projectId: input.projectId } : {}),
          ...(input.q ? { title: { contains: input.q } } : {}),
          ...(input.sourceKey ? { integrationSourceKey: input.sourceKey } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(input.cursor ? { id: { gt: input.cursor } } : {}),
        },
        select: {
          id: true,
          domainId: true,
          projectId: true,
          title: true,
          status: true,
          priority: true,
          whenBucket: true,
          updatedAt: true,
          integrationSourceKey: true,
          source: true,
          isBlocked: true,
          waitingOn: true,
          followUpDate: true,
        },
        orderBy: { id: "asc" },
        take: input.limit + 1,
      });
      // Cursor comparison is explicit to avoid looking up a foreign cursor record.
      const hasMore = tasks.length > input.limit;
      const page = tasks.slice(0, input.limit);
      const ownedProjects = await db.executionProject.findMany({
        where: {
          userId: access.userId,
          domainId: input.domainId,
          id: {
            in: page.flatMap((task) =>
              task.projectId ? [task.projectId] : [],
            ),
          },
        },
        select: { id: true },
      });
      const projectIds = new Set(ownedProjects.map((project) => project.id));
      return {
        tasks: page.map((task) => ({
          ...task,
          projectId:
            task.projectId && projectIds.has(task.projectId)
              ? task.projectId
              : null,
          taskPath: `/tasks?taskId=${encodeURIComponent(task.id)}`,
        })),
        nextCursor: hasMore ? page.at(-1)?.id : null,
      };
    },
    async get(access: TaskAccess, id: string) {
      requireOperation(access, "read");
      return read(db, access, id);
    },
    async create(access: TaskAccess, raw: unknown) {
      requireOperation(access, "create");
      const input = parseInput(createTaskInput, raw);
      rejectSensitiveContext(input);
      const existing = async () => {
        const task = await db.executionTask.findFirst({
          where: {
            userId: access.userId,
            integrationSourceKey: input.sourceKey,
          },
          select: { id: true, domainId: true },
        });
        if (!task) return null;
        if (
          access.domainIds !== null &&
          !access.domainIds.includes(task.domainId)
        )
          throw notFound();
        if (task.domainId !== input.domainId)
          throw new TaskConnectorError(
            409,
            "SOURCE_SCOPE_CONFLICT",
            "Source key is already bound to another area.",
          );
        return { created: false, task: await read(db, access, task.id) };
      };
      await requireDomain(db, access, input.domainId);
      await requireProject(db, access, input.domainId, input.projectId);
      const previous = await existing();
      if (previous) return previous; // A retry returns live user edits and terminal state without applying the submitted body.
      try {
        return await transaction(async (tx) => {
          await requireDomain(tx, access, input.domainId);
          await requireProject(tx, access, input.domainId, input.projectId);
          const {
            reviewed: _reviewed,
            sourceKey,
            references,
            dueDate,
            followUpDate,
            ...data
          } = input;
          const task = await tx.executionTask.create({
            data: {
              ...data,
              userId: access.userId,
              integrationSourceKey: sourceKey,
              dueDate: dueDate ? new Date(dueDate) : null,
              followUpDate: followUpDate ? new Date(followUpDate) : null,
            },
          });
          await appendReferences(tx, access, task.id, references);
          return { created: true, task: await read(tx, access, task.id) };
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          const previous = await existing();
          if (previous) return previous;
        }
        throw error;
      }
    },
    async update(access: TaskAccess, id: string, raw: unknown) {
      requireOperation(access, "update");
      const input = parseInput(updateTaskInput, raw);
      rejectSensitiveContext(input);
      return transaction(async (tx) => {
        const task = await tx.executionTask.findFirst({
          where: { id, ...scope(access) },
        });
        if (!task) throw notFound();
        await requireDomain(tx, access, task.domainId);
        await requireProject(tx, access, task.domainId, input.patch.projectId);
        const expected = new Date(input.expectedUpdatedAt);
        if (task.updatedAt.getTime() !== expected.getTime()) throw conflict();
        if (
          input.sourceKey &&
          task.integrationSourceKey &&
          input.sourceKey !== task.integrationSourceKey
        ) {
          throw new TaskConnectorError(
            409,
            "SOURCE_KEY_IMMUTABLE",
            "A task's stable source key cannot be replaced.",
          );
        }
        if (input.sourceKey && !task.source && !input.patch.source) {
          throw new TaskConnectorError(
            400,
            "INVALID_INPUT",
            "A reviewed source caption is required to bind a source key.",
          );
        }
        if (
          ["DONE", "DROPPED"].includes(task.status) &&
          input.patch.status &&
          input.patch.status !== task.status
        ) {
          throw new TaskConnectorError(
            409,
            "TERMINAL_TASK",
            "Completed or dropped work stays closed. Reopen explicitly in the owner UI.",
          );
        }
        const { dueDate, followUpDate, ...patch } = input.patch;
        const now = new Date(
          Math.max(Date.now(), task.updatedAt.getTime() + 1),
        );
        const data: Prisma.ExecutionTaskUncheckedUpdateManyInput = {
          ...patch,
          updatedAt: now,
          ...(input.sourceKey && !task.integrationSourceKey
            ? { integrationSourceKey: input.sourceKey }
            : {}),
          ...(dueDate !== undefined
            ? { dueDate: dueDate ? new Date(dueDate) : null }
            : {}),
          ...(followUpDate !== undefined
            ? { followUpDate: followUpDate ? new Date(followUpDate) : null }
            : {}),
        };
        const completes = patch.status === "DONE" && task.status !== "DONE";
        if (completes) data.completedAt = now;
        else if (patch.status && !["DONE", "DROPPED"].includes(patch.status))
          data.completedAt = null;
        let result;
        try {
          result = await tx.executionTask.updateMany({
            where: {
              id,
              ...scope(access),
              updatedAt: expected,
              status: task.status,
            },
            data,
          });
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          ) {
            throw new TaskConnectorError(
              409,
              "SOURCE_ALREADY_BOUND",
              "Source key is already bound; reconcile existing work before retrying.",
            );
          }
          throw error;
        }
        if (result.count !== 1) throw conflict();
        await appendReferences(tx, access, id, input.addReferences);
        if (completes) {
          const updated = await tx.executionTask.findFirstOrThrow({
            where: { id, ...scope(access) },
          });
          const next = nextExecutionTaskOccurrence(updated, now);
          if (next) {
            await requireProject(tx, access, task.domainId, updated.projectId);
            await tx.executionTask.create({ data: next });
          }
        }
        return { task: await read(tx, access, id) };
      });
    },
  };
}
