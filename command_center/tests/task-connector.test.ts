import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createInterface } from "node:readline";
import { authenticateTaskRequest } from "@/server/task-connector-auth";
import { createTaskConnectorService } from "@/server/task-connector-service";
import { taskHandlers, taskRequestBody } from "@/server/task-connector-http";
import type { TaskAccess } from "@/lib/task-connector-contract";
import { nextExecutionTaskOccurrence } from "@/server/execution-task-recurrence";

// Only invented operational fixtures in an isolated file; never connect to the app's configured DB.
const temp = mkdtempSync(path.join(tmpdir(), "ryanos-task-connector-test-"));
const url = `file:${path.join(temp, "synthetic.db").replace(/\\/g, "/")}`;
const db = new PrismaClient({ datasourceUrl: url, log: [] });
const service = createTaskConnectorService(db);
let owner: string,
  otherOwner: string,
  area: string,
  excludedArea: string,
  otherArea: string,
  project: string;
let access: TaskAccess;
const token = "synthetic_task_test_token_0000000000";
const request = (
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  new Request("https://tasks.example.invalid/api/task-connector/tasks", {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const create = (key: string, extra: Record<string, unknown> = {}) =>
  service.create(access, {
    domainId: area,
    projectId: project,
    title: "Review synthetic action",
    sourceKey: `synthetic:${key}`,
    source: "Reviewed synthetic source",
    reviewed: true,
    ...extra,
  });

beforeAll(async () => {
  const pushed = spawnSync(
    process.execPath,
    [
      path.join(process.cwd(), "node_modules/prisma/build/index.js"),
      "db",
      "push",
      "--schema",
      "prisma/schema.prisma",
      "--skip-generate",
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: url },
      encoding: "utf8",
      timeout: 30_000,
    },
  );
  if (pushed.status !== 0)
    throw new Error("Could not prepare the isolated synthetic task database.");
  owner = (
    await db.user.create({
      data: {
        email: "synthetic-owner-a@example.invalid",
        passwordHash: "synthetic-not-a-credential",
      },
    })
  ).id;
  otherOwner = (
    await db.user.create({
      data: {
        email: "synthetic-owner-b@example.invalid",
        passwordHash: "synthetic-not-a-credential",
      },
    })
  ).id;
  area = (
    await db.executionDomain.create({
      data: {
        userId: owner,
        name: "Synthetic Supplier Work",
        slug: "synthetic-suppliers",
      },
    })
  ).id;
  excludedArea = (
    await db.executionDomain.create({
      data: {
        userId: owner,
        name: "Synthetic Excluded Area",
        slug: "synthetic-excluded",
      },
    })
  ).id;
  otherArea = (
    await db.executionDomain.create({
      data: {
        userId: otherOwner,
        name: "Synthetic Other Owner",
        slug: "synthetic-other",
      },
    })
  ).id;
  project = (
    await db.executionProject.create({
      data: {
        userId: owner,
        domainId: area,
        name: "Synthetic Supplier Project",
      },
    })
  ).id;
  access = {
    userId: owner,
    domainIds: [area],
    operations: ["read", "create", "update"],
  };
}, 40_000);
afterAll(async () => {
  await db.$disconnect();
  if (
    !path.resolve(temp).startsWith(path.resolve(tmpdir()) + path.sep) ||
    !path.basename(temp).startsWith("ryanos-task-connector-test-")
  ) {
    throw new Error(
      "Synthetic cleanup path is outside its temporary test root.",
    );
  }
  rmSync(temp, { recursive: true, force: true });
});

describe("task connector authentication", () => {
  const config = () => ({
    RYANOS_TASK_CONNECTOR_ENABLED: "true",
    RYANOS_TASK_CONNECTOR_OWNER_ID: owner,
    RYANOS_TASK_CONNECTOR_DOMAIN_IDS: area,
    RYANOS_TASK_CONNECTOR_OPERATIONS: "read,create,update",
    RYANOS_TASK_CONNECTOR_SHA256: createHash("sha256")
      .update(token)
      .digest("hex"),
    RYANOS_TASK_CONNECTOR_EXPIRES_AT: "2030-01-01T00:00:00.000Z",
  });
  it("fails closed without a session; a bad bearer cannot use a valid cookie session", async () => {
    await expect(
      authenticateTaskRequest(request(), "read", async () => null, {}),
    ).rejects.toMatchObject({ status: 401 });
    const session = vi.fn(async () => ({ user: { id: owner } }));
    await expect(
      authenticateTaskRequest(
        request("GET", undefined, { authorization: "Bearer wrong" }),
        "read",
        session,
        config(),
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(session).not.toHaveBeenCalled();
  });
  it("requires complete opt-in, expiry, exact token and explicit owned-area scope", async () => {
    const req = request("GET", undefined, { authorization: `Bearer ${token}` });
    const auth = () =>
      authenticateTaskRequest(
        req,
        "read",
        async () => null,
        config(),
        Date.parse("2026-10-03T00:00:00Z"),
      );
    expect(await auth()).toEqual(access);
    for (const overrides of [
      { RYANOS_TASK_CONNECTOR_ENABLED: "false" },
      { RYANOS_TASK_CONNECTOR_DOMAIN_IDS: "" },
      { RYANOS_TASK_CONNECTOR_OWNER_ID: "unknown" },
      { RYANOS_TASK_CONNECTOR_EXPIRES_AT: "2020-01-01" },
      { RYANOS_TASK_CONNECTOR_SHA256: "0".repeat(64) },
      { RYANOS_TASK_CONNECTOR_OPERATIONS: "all" },
      { RYANOS_TASK_CONNECTOR_OPERATIONS: "create" },
    ]) {
      await expect(
        authenticateTaskRequest(req, "read", async () => null, {
          ...config(),
          ...overrides,
        }),
      ).rejects.toMatchObject({ status: 401 });
    }
    await expect(
      authenticateTaskRequest(req, "create", async () => null, {
        ...config(),
        RYANOS_TASK_CONNECTOR_OPERATIONS: "read",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("enforces origin on session mutations and denies foreign origins even with a bearer", async () => {
    const session = async () => ({ user: { id: owner } });
    expect(
      (await authenticateTaskRequest(request(), "read", session)).userId,
    ).toBe(owner);
    await expect(
      authenticateTaskRequest(request("POST", {}), "create", session),
    ).rejects.toMatchObject({ code: "ORIGIN_REQUIRED" });
    expect(
      (
        await authenticateTaskRequest(
          request("POST", {}, { origin: "https://tasks.example.invalid" }),
          "create",
          session,
        )
      ).domainIds,
    ).toBeNull();
    await expect(
      authenticateTaskRequest(
        request(
          "POST",
          {},
          {
            authorization: `Bearer ${token}`,
            origin: "https://foreign.example.invalid",
          },
        ),
        "create",
        session,
        config(),
      ),
    ).rejects.toMatchObject({ code: "ORIGIN_DENIED" });
    await expect(
      authenticateTaskRequest(
        new Request("http://remote.example.invalid", {
          headers: { authorization: `Bearer ${token}` },
        }),
        "read",
        session,
        config(),
      ),
    ).rejects.toMatchObject({ status: 401 });
  });
});

describe("owned tasks and idempotency against real synthetic Prisma records", () => {
  it("lists only allowed owned areas/projects and refuses cross-owner and cross-area creation/read/search", async () => {
    const catalog = await service.catalog(access);
    expect(catalog.areas.map((x) => x.id)).toEqual([area]);
    expect(catalog.projects.map((x) => x.id)).toEqual([project]);
    const foreign = await db.executionTask.create({
      data: {
        userId: otherOwner,
        domainId: otherArea,
        title: "Synthetic foreign task",
      },
    });
    const excluded = await db.executionTask.create({
      data: {
        userId: owner,
        domainId: excludedArea,
        title: "Synthetic excluded task",
      },
    });
    for (const id of [foreign.id, excluded.id]) {
      await expect(service.get(access, id)).rejects.toMatchObject({
        status: 404,
      });
      await expect(
        service.update(access, id, {
          reviewed: true,
          expectedUpdatedAt: foreign.updatedAt.toISOString(),
          patch: { note: "Synthetic attempt" },
        }),
      ).rejects.toMatchObject({ status: 404 });
    }
    for (const domainId of [otherArea, excludedArea]) {
      await expect(
        create(`wrong-area-${domainId}`, { domainId }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(service.list(access, { domainId })).rejects.toMatchObject({
        status: 404,
      });
    }
    const wrongProject = (
      await db.executionProject.create({
        data: {
          userId: owner,
          domainId: excludedArea,
          name: "Synthetic Different Area Project",
        },
      })
    ).id;
    await expect(
      create("wrong-project", { projectId: wrongProject }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("withholds inconsistent legacy ownership relations and other-owner references", async () => {
    const foreignProject = await db.executionProject.create({
      data: {
        userId: otherOwner,
        domainId: otherArea,
        name: "Synthetic foreign relation",
      },
    });
    const task = await db.executionTask.create({
      data: {
        userId: owner,
        domainId: area,
        projectId: foreignProject.id,
        title: "Synthetic inconsistent project relation",
      },
    });
    await db.executionTaskReference.create({
      data: {
        userId: otherOwner,
        taskId: task.id,
        title: "Synthetic foreign reference",
        url: "https://example.invalid/foreign",
      },
    });
    const read = await service.get(access, task.id);
    expect(read.projectId).toBeNull();
    expect(read.references).toEqual([]);
    const listed = await service.list(access, {
      domainId: area,
      q: "Synthetic inconsistent",
    });
    expect(listed.tasks[0].projectId).toBeNull();
    expect(listed.tasks[0]).not.toHaveProperty("note");
    const inconsistentAreaTask = await db.executionTask.create({
      data: {
        userId: owner,
        domainId: otherArea,
        title: "Synthetic inconsistent owner area",
      },
    });
    await expect(
      service.get({ ...access, domainIds: null }, inconsistentAreaTask.id),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("makes retries return the original task, preserving owner edits and completion; unique constraint handles concurrent retries", async () => {
    const first = await create("retry", {
      note: "Original synthetic details",
      references: [
        { title: "Synthetic evidence", url: "https://example.invalid/source" },
      ],
    });
    expect(first.created).toBe(true);
    await db.executionTask.update({
      where: { id: first.task.id },
      data: {
        title: "Owner edited synthetic title",
        note: "Owner edited details",
        status: "DONE",
        completedAt: new Date(),
      },
    });
    const retry = await create("retry", {
      title: "Stale submitted title",
      note: "Stale submitted details",
    });
    expect(retry.created).toBe(false);
    expect(retry.task).toMatchObject({
      id: first.task.id,
      title: "Owner edited synthetic title",
      note: "Owner edited details",
      status: "DONE",
    });
    expect(retry.task.references).toHaveLength(1);
    expect(
      await db.executionTask.count({
        where: { userId: owner, integrationSourceKey: "synthetic:retry" },
      }),
    ).toBe(1);
    const races = await Promise.all([
      create("concurrent-retry"),
      create("concurrent-retry"),
    ]);
    expect(races[0].task.id).toBe(races[1].task.id);
    expect(races.filter((x) => x.created)).toHaveLength(1);
  });
  it("does not leak data when an existing source key is outside the supplied area", async () => {
    await db.executionTask.create({
      data: {
        userId: owner,
        domainId: excludedArea,
        title: "Synthetic excluded source",
        integrationSourceKey: "synthetic:source-collision",
      },
    });
    await expect(create("source-collision")).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
  });
  it("requires exact version, changes only submitted fields, and preserves scheduling, recurrence and existing reference edits", async () => {
    const first = await create("patch", {
      note: "Synthetic starting note",
      references: [
        {
          title: "Original synthetic reference",
          url: "https://example.invalid/retain",
          note: "Owner retained context",
        },
      ],
    });
    const scheduled = new Date("2030-01-02T12:00:00Z");
    await db.executionTask.update({
      where: { id: first.task.id },
      data: {
        scheduledStart: scheduled,
        scheduledEnd: new Date("2030-01-02T12:30:00Z"),
        pinToTodayUntilDone: true,
        recipient: "Synthetic responsibility",
        isNeedle: true,
      },
    });
    await expect(
      service.update(access, first.task.id, {
        reviewed: true,
        expectedUpdatedAt: first.task.updatedAt.toISOString(),
        patch: { title: "Stale update" },
      }),
    ).rejects.toMatchObject({ status: 409 });
    const current = await service.get(access, first.task.id);
    const result = await service.update(access, current.id, {
      reviewed: true,
      expectedUpdatedAt: current.updatedAt.toISOString(),
      patch: {
        title: "Updated synthetic next action",
        status: "WAITING",
        whenBucket: "WAITING",
      },
      addReferences: [
        {
          title: "Attempted reference rewrite",
          url: "https://example.invalid/retain",
          note: "Attempted replacement",
        },
        {
          title: "Additional synthetic source",
          url: "https://example.invalid/add",
        },
      ],
    });
    expect(result.task).toMatchObject({
      title: "Updated synthetic next action",
      status: "WAITING",
      note: "Synthetic starting note",
      source: "Reviewed synthetic source",
      projectId: project,
    });
    expect(result.task.references).toHaveLength(2);
    expect(
      result.task.references.find(
        (x) => x.url === "https://example.invalid/retain",
      )?.note,
    ).toBe("Owner retained context");
    const stored = await db.executionTask.findUniqueOrThrow({
      where: { id: current.id },
    });
    expect(stored).toMatchObject({
      scheduledStart: scheduled,
      pinToTodayUntilDone: true,
      recipient: "Synthetic responsibility",
      isNeedle: true,
      recurrenceFrequency: "NONE",
    });
    await expect(
      service.update(access, current.id, {
        reviewed: true,
        expectedUpdatedAt: current.updatedAt.toISOString(),
        patch: { note: "Competing stale edit" },
      }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });
  it("adopts an existing UI task once using a reviewed source key, without overwriting unrelated owner content", async () => {
    const task = await db.executionTask.create({
      data: {
        userId: owner,
        domainId: area,
        title: "Synthetic existing UI action",
        note: "Owner's retained synthetic note",
      },
    });
    const adopted = await service.update(access, task.id, {
      reviewed: true,
      sourceKey: "synthetic:adopted-ui",
      expectedUpdatedAt: task.updatedAt.toISOString(),
      patch: { source: "Reviewed synthetic note page" },
    });
    expect(adopted.task.note).toBe("Owner's retained synthetic note");
    expect((await create("adopted-ui")).task.id).toBe(task.id);
    await expect(
      service.update(access, task.id, {
        reviewed: true,
        sourceKey: "synthetic:replacement",
        expectedUpdatedAt: adopted.task.updatedAt.toISOString(),
        patch: { source: "Replacement source" },
      }),
    ).rejects.toMatchObject({ code: "SOURCE_KEY_IMMUTABLE" });
    const other = await create("adoption-conflict");
    await expect(
      service.update(access, other.task.id, {
        reviewed: true,
        sourceKey: "synthetic:adopted-ui",
        expectedUpdatedAt: other.task.updatedAt.toISOString(),
        patch: { note: "Synthetic unchanged" },
      }),
    ).rejects.toMatchObject({ code: "SOURCE_KEY_IMMUTABLE" });
    const unbound = await db.executionTask.create({
      data: {
        userId: owner,
        domainId: area,
        title: "Synthetic second UI action",
        source: "Reviewed synthetic source",
      },
    });
    await expect(
      service.update(access, unbound.id, {
        reviewed: true,
        sourceKey: "synthetic:adopted-ui",
        expectedUpdatedAt: unbound.updatedAt.toISOString(),
        patch: { note: "Synthetic unchanged" },
      }),
    ).rejects.toMatchObject({ code: "SOURCE_ALREADY_BOUND" });
  });
  it("allows terminal completion/drop but refuses reopening or replayed recurrence completion", async () => {
    for (const terminal of ["DONE", "DROPPED"] as const) {
      const first = await create(`terminal-${terminal}`);
      const updated = await service.update(access, first.task.id, {
        reviewed: true,
        expectedUpdatedAt: first.task.updatedAt.toISOString(),
        patch: { status: terminal },
      });
      expect(updated.task.status).toBe(terminal);
      if (terminal === "DONE")
        expect(updated.task.completedAt).toBeInstanceOf(Date);
      await expect(
        service.update(access, first.task.id, {
          reviewed: true,
          expectedUpdatedAt: updated.task.updatedAt.toISOString(),
          patch: { status: "NOT_STARTED" },
        }),
      ).rejects.toMatchObject({ code: "TERMINAL_TASK" });
      const edited = await service.update(access, first.task.id, {
        reviewed: true,
        expectedUpdatedAt: updated.task.updatedAt.toISOString(),
        patch: { note: "Updated synthetic terminal context" },
      });
      expect(edited.task.status).toBe(terminal);
      expect((await create(`terminal-${terminal}`)).task.status).toBe(terminal);
    }
    const recurring = await create("recurring");
    await db.executionTask.update({
      where: { id: recurring.task.id },
      data: {
        recurrenceFrequency: "DAILY",
        dueDate: new Date("2030-01-01T12:00:00Z"),
      },
    });
    const current = await service.get(access, recurring.task.id);
    const complete = {
      reviewed: true,
      expectedUpdatedAt: current.updatedAt.toISOString(),
      patch: { status: "DONE" },
    };
    await service.update(access, current.id, complete);
    await expect(
      service.update(access, current.id, complete),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    const occurrences = await db.executionTask.findMany({
      where: { recurrenceParentId: current.id },
    });
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]).toMatchObject({
      status: "NOT_STARTED",
      dueDate: new Date("2030-01-02T12:00:00Z"),
      integrationSourceKey: null,
    });
  });
  it("rejects unknown fields, dates, recurrence/scheduling changes, oversized details and synthetic PHI markers", async () => {
    for (const extra of [
      { reviewed: false },
      { source: "" },
      { userId: otherOwner },
      { recurrenceFrequency: "DAILY" },
      { scheduledStart: "2030-01-01T12:00:00Z" },
      { note: "x".repeat(1001) },
      { dueDate: "tomorrow" },
      { references: [{ title: "Bad link", url: "javascript:alert(1)" }] },
    ]) {
      await expect(create("invalid", extra)).rejects.toMatchObject({
        status: 400,
      });
    }
    await expect(
      create("synthetic-phi", { note: "MRN: SYNTHETIC" }),
    ).rejects.toMatchObject({ code: "SENSITIVE_CONTEXT" });
    const first = await create("invalid-patch");
    await expect(
      service.update(access, first.task.id, {
        reviewed: true,
        expectedUpdatedAt: first.task.updatedAt.toISOString(),
        patch: { domainId: excludedArea },
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.create(
        { ...access, operations: ["read"] },
        {
          domainId: area,
          title: "Read only attempt",
          sourceKey: "synthetic:read-only",
        },
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("searches closed work too, filters by stable source key and paginates within the requested area", async () => {
    const result = await service.list(access, {
      domainId: area,
      sourceKey: "synthetic:retry",
    });
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].status).toBe("DONE");
    const ids = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await service.list(access, {
        domainId: area,
        limit: 2,
        ...(cursor ? { cursor } : {}),
      });
      for (const task of page.tasks) {
        expect(ids.has(task.id)).toBe(false);
        expect(task.domainId).toBe(area);
        ids.add(task.id);
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(ids.size).toBe(
      await db.executionTask.count({
        where: { userId: owner, domainId: area },
      }),
    );
  });
});

it("connects a real stdio MCP child through authenticated loopback HTTP to the synthetic task database", async () => {
  const connectorConfig = {
    RYANOS_TASK_CONNECTOR_ENABLED: "true",
    RYANOS_TASK_CONNECTOR_OWNER_ID: owner,
    RYANOS_TASK_CONNECTOR_DOMAIN_IDS: area,
    RYANOS_TASK_CONNECTOR_OPERATIONS: "read,create,update",
    RYANOS_TASK_CONNECTOR_SHA256: createHash("sha256")
      .update(token)
      .digest("hex"),
    RYANOS_TASK_CONNECTOR_EXPIRES_AT: "2030-01-01T00:00:00Z",
  };
  const handlers = taskHandlers(service, (req, op) =>
    authenticateTaskRequest(req, op, async () => null, connectorConfig),
  );
  const http = createServer(async (incoming, outgoing) => {
    const chunks: Buffer[] = [];
    for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks);
    const req = new Request(
      `http://127.0.0.1:${(http.address() as { port: number }).port}${incoming.url}`,
      {
        method: incoming.method,
        headers: incoming.headers as Record<string, string>,
        ...(body.length ? { body } : {}),
      },
    );
    const pathname = new URL(req.url).pathname;
    let response: Response;
    if (pathname.endsWith("/catalog")) response = await handlers.catalog(req);
    else if (pathname === "/api/task-connector/tasks")
      response =
        req.method === "POST"
          ? await handlers.create(req)
          : await handlers.list(req);
    else
      response =
        req.method === "PATCH"
          ? await handlers.update(req, pathname.split("/").at(-1)!)
          : await handlers.get(req, pathname.split("/").at(-1)!);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(await response.text());
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const child = spawn(
    process.execPath,
    [path.join(process.cwd(), "scripts/task-connector-mcp.mjs")],
    {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        RYANOS_TASK_API_URL: `http://127.0.0.1:${(http.address() as { port: number }).port}`,
        RYANOS_TASK_CONNECTOR_TOKEN: token,
      },
    },
  );
  const lines = createInterface({ input: child.stdout });
  let requestId = 0;
  const call = (method: string, params: unknown) =>
    new Promise<any>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Synthetic MCP response timeout")),
        5000,
      );
      lines.once("line", (line) => {
        clearTimeout(timer);
        resolve(JSON.parse(line));
      });
      child.stdin.write(
        JSON.stringify({ jsonrpc: "2.0", id: ++requestId, method, params }) +
          "\n",
      );
    });
  const tool = async (name: string, args: Record<string, unknown>) => {
    const response = await call("tools/call", { name, arguments: args });
    expect(response.result.isError).toBe(false);
    return JSON.parse(response.result.content[0].text);
  };
  try {
    await call("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "synthetic-e2e", version: "1" },
    });
    child.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) +
        "\n",
    );
    expect(
      (await tool("ryanos_task_catalog", {})).areas.map(
        (item: { id: string }) => item.id,
      ),
    ).toEqual([area]);
    const args = {
      domainId: area,
      title: "Synthetic MCP end to end action",
      sourceKey: "synthetic:mcp-e2e",
      source: "Reviewed synthetic MCP fixture",
      reviewed: true,
    };
    const created = await tool("ryanos_task_create", args);
    expect(created.created).toBe(true);
    expect((await tool("ryanos_task_create", args)).created).toBe(false);
    const current = await tool("ryanos_task_read", { id: created.task.id });
    const updated = await tool("ryanos_task_update", {
      id: current.id,
      expectedUpdatedAt: current.updatedAt,
      reviewed: true,
      patch: { status: "IN_PROGRESS", note: "Synthetic reviewed progress" },
    });
    expect(updated.task.status).toBe("IN_PROGRESS");
    const stored = await db.executionTask.findUniqueOrThrow({
      where: { id: current.id },
    });
    expect(stored.note).toBe("Synthetic reviewed progress");
  } finally {
    lines.close();
    const stopped = new Promise<void>((resolve) =>
      child.once("exit", () => resolve()),
    );
    child.stdin.end();
    await stopped;
    await new Promise<void>((resolve, reject) =>
      http.close((error) => (error ? reject(error) : resolve())),
    );
  }
}, 15_000);

it("preserves the existing UI recurrence calendar rules and end-date cutoff", async () => {
  const created = await create("recurrence-rules");
  const task = await db.executionTask.findUniqueOrThrow({
    where: { id: created.task.id },
  });
  const completed = new Date("2030-01-04T12:00:00Z");
  for (const [frequency, expected] of [
    ["DAILY", "2030-01-05T12:00:00Z"],
    ["WEEKLY", "2030-01-11T12:00:00Z"],
    ["WORKDAYS", "2030-01-07T12:00:00Z"],
    ["WEEKENDS", "2030-01-05T12:00:00Z"],
    ["CUSTOM_WEEKDAYS", "2030-01-08T12:00:00Z"],
    ["MONTHLY", "2030-02-04T12:00:00Z"],
  ] as const) {
    const next = nextExecutionTaskOccurrence(
      {
        ...task,
        dueDate: completed,
        recurrenceFrequency: frequency,
        recurrenceWeekdays: "2",
      },
      completed,
    );
    expect(next?.dueDate).toEqual(new Date(expected));
    expect(next?.recurrenceParentId).toBe(task.id);
    expect(next?.integrationSourceKey).toBeUndefined();
  }
  expect(
    nextExecutionTaskOccurrence(
      {
        ...task,
        dueDate: completed,
        recurrenceFrequency: "DAILY",
        recurrenceEndDate: completed,
      },
      completed,
    ),
  ).toBeNull();
  const followUp = nextExecutionTaskOccurrence(
    {
      ...task,
      dueDate: null,
      followUpDate: completed,
      recurrenceFrequency: "DAILY",
    },
    completed,
  );
  expect(followUp?.dueDate).toBeNull();
  expect(followUp?.followUpDate).toEqual(new Date("2030-01-05T12:00:00Z"));
});

describe("HTTP boundary", () => {
  it("authenticates before reading the body or invoking task service; errors and cache headers are safe", async () => {
    const createSpy = vi.spyOn(service, "create");
    const handlers = taskHandlers(service, (req, op) =>
      authenticateTaskRequest(req, op, async () => null, {}),
    );
    const result = await handlers.create(
      request("POST", { title: "Synthetic body" }),
    );
    expect(result.status).toBe(401);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(await result.json()).toEqual({
      error: { code: "UNAUTHORIZED", message: "Task authentication required." },
    });
    expect(createSpy).not.toHaveBeenCalled();
    createSpy.mockRestore();
  });
  it("bounds JSON body size and exposes only known fields through create/read/update handlers", async () => {
    await expect(
      taskRequestBody(request("POST", { note: "x".repeat(17_000) })),
    ).rejects.toMatchObject({ status: 413 });
    const handlers = taskHandlers(
      service,
      async () => access,
      () => {
        throw new Error("Synthetic cache refresh failure");
      },
    );
    const created = await handlers.create(
      request("POST", {
        title: "Synthetic HTTP action",
        domainId: area,
        sourceKey: "synthetic:http",
        source: "Reviewed synthetic HTTP source",
        reviewed: true,
      }),
    );
    expect(created.status).toBe(200);
    const data = await created.json();
    expect(data.task.userId).toBeUndefined();
    const read = await handlers.get(request(), data.task.id);
    expect((await read.json()).taskPath).toBe(`/tasks?taskId=${data.task.id}`);
    const update = await handlers.update(
      request("PATCH", {
        reviewed: true,
        expectedUpdatedAt: data.task.updatedAt,
        patch: { priority: "HIGH" },
      }),
      data.task.id,
    );
    expect((await update.json()).task.priority).toBe("HIGH");
  });
});
