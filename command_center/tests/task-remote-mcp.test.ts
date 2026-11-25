import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  taskOAuthConfig,
  parseTaskAuthorization,
  validateTaskClient,
  createTaskOAuthService,
} from "@/server/task-oauth";
import { taskOAuthHandlers } from "@/server/task-oauth-http";
import { remoteTaskMcp } from "@/server/task-remote-mcp";
import { taskLoginReturn } from "@/lib/task-login-return";

const temp = mkdtempSync(path.join(tmpdir(), "ryanos-remote-mcp-test-"));
const url = `file:${path.join(temp, "synthetic.db").replace(/\\/g, "/")}`;
const db = new PrismaClient({ datasourceUrl: url, log: [] });
let owner: string,
  foreignOwner: string,
  area: string,
  excluded: string,
  foreignArea: string;
let env: Record<string, string>, config: ReturnType<typeof taskOAuthConfig>;
const verifier = "synthetic_verifier_only_".padEnd(43, "x");
const challenge = createHash("sha256").update(verifier).digest("base64url");
const params = (overrides: Record<string, string> = {}) =>
  new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    resource: config.resource,
    response_type: "code",
    code_challenge_method: "S256",
    code_challenge: challenge,
    scope: "tasks:read tasks:create tasks:update",
    state: "synthetic-state",
    ...overrides,
  });
const formRequest = (
  endpoint: string,
  form: URLSearchParams,
  headers: Record<string, string> = {},
) =>
  new Request(`${config.origin}${endpoint}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body: form.toString(),
  });
const metadataFetch = (data?: unknown) =>
  vi.fn(async () =>
    Response.json(
      data ?? {
        client_id: config.clientId,
        redirect_uris: [config.redirectUri],
        token_endpoint_auth_methods_supported: ["none", "private_key_jwt"],
      },
    ),
  ) as unknown as typeof fetch;
const issue = async (
  operations = ["read", "create", "update"],
  service = createTaskOAuthService(db, config),
) => {
  const pending = await service.pending(
    owner,
    parseTaskAuthorization(params(), config),
  );
  const redirect = new URL(
    await service.consent(
      owner,
      pending.id,
      pending.csrf,
      [area],
      operations,
      true,
    ),
  );
  const input = {
    grant_type: "authorization_code",
    code: redirect.searchParams.get("code")!,
    code_verifier: verifier,
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    resource: config.resource,
  };
  const token = await service.exchange(input);
  return { pending, redirect, input, token, service };
};
const rpc = async (
  token: string,
  method: string,
  argumentsValue?: Record<string, unknown>,
  name?: string,
) =>
  remoteTaskMcp(
    db,
    env,
  )(
    new Request(config.resource, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-06-18",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params:
          method === "initialize"
            ? {
                protocolVersion: "2025-06-18",
                capabilities: {},
                clientInfo: { name: "synthetic-test", version: "1" },
              }
            : method === "tools/call"
              ? { name, arguments: argumentsValue ?? {} }
              : {},
      }),
    }),
  );

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
    throw new Error("Could not prepare isolated synthetic MCP database.");
  owner = (
    await db.user.create({
      data: {
        email: "synthetic-remote-owner@example.invalid",
        passwordHash: "synthetic-not-a-credential",
      },
    })
  ).id;
  foreignOwner = (
    await db.user.create({
      data: {
        email: "synthetic-remote-foreign@example.invalid",
        passwordHash: "synthetic-not-a-credential",
      },
    })
  ).id;
  area = (
    await db.executionDomain.create({
      data: { userId: owner, name: "Synthetic Rykas", slug: "synthetic-rykas" },
    })
  ).id;
  excluded = (
    await db.executionDomain.create({
      data: {
        userId: owner,
        name: "Synthetic Excluded",
        slug: "synthetic-excluded",
      },
    })
  ).id;
  foreignArea = (
    await db.executionDomain.create({
      data: {
        userId: foreignOwner,
        name: "Synthetic Foreign",
        slug: "synthetic-foreign",
      },
    })
  ).id;
  env = {
    RYANOS_MCP_ENABLED: "true",
    RYANOS_MCP_ORIGIN: "https://tasks.example.invalid",
    RYANOS_MCP_OWNER_ID: owner,
    RYANOS_MCP_DOMAIN_IDS: area,
    RYANOS_MCP_SCOPES: "tasks:read,tasks:create,tasks:update",
    RYANOS_MCP_CLIENT_ID: "https://chatgpt.com/oauth/client.json",
    RYANOS_MCP_REDIRECT_URI:
      "https://chatgpt.com/connector_platform_oauth_redirect",
    RYANOS_MCP_GRANT_TTL_SECONDS: "3600",
  };
  config = taskOAuthConfig(env);
});
beforeEach(async () => {
  await db.taskOAuthCode.deleteMany();
  await db.taskOAuthGrant.deleteMany();
  await db.taskOAuthRateBucket.deleteMany();
  await db.executionTask.deleteMany();
});
afterAll(async () => {
  await db.$disconnect();
  rmSync(temp, { recursive: true, force: true });
});

it("fails closed when disabled, incomplete, HTTP, wildcard, foreign callback or unbounded lifetime", () => {
  expect(() => taskOAuthConfig({})).toThrow();
  for (const patch of [
    { RYANOS_MCP_ENABLED: "false" },
    { RYANOS_MCP_ORIGIN: "http://localhost" },
    { RYANOS_MCP_DOMAIN_IDS: "*" },
    { RYANOS_MCP_REDIRECT_URI: "https://evil.example.invalid/callback" },
    {
      RYANOS_MCP_CLIENT_ID:
        "https://chatgpt.com.evil.example.invalid/oauth/client.json",
    },
    { RYANOS_MCP_GRANT_TTL_SECONDS: "0" },
    { RYANOS_MCP_SCOPES: "tasks:create" },
  ])
    expect(() => taskOAuthConfig({ ...env, ...patch })).toThrow();
});
it("validates only approved CIMD and exact callback, supports public PKCE, rejects redirects/large docs", async () => {
  const fetcher = metadataFetch();
  await validateTaskClient(config, fetcher);
  expect(fetcher).toHaveBeenCalledWith(
    config.clientId,
    expect.objectContaining({ redirect: "error" }),
  );
  await expect(
    validateTaskClient(
      config,
      metadataFetch({
        client_id: config.clientId,
        redirect_uris: ["https://evil.example.invalid"],
        token_endpoint_auth_methods_supported: ["none"],
      }),
    ),
  ).rejects.toThrow();
  await expect(
    validateTaskClient(
      config,
      metadataFetch({
        client_id: config.clientId,
        redirect_uris: [config.redirectUri],
        token_endpoint_auth_methods_supported: ["private_key_jwt"],
      }),
    ),
  ).rejects.toThrow();
  await expect(
    validateTaskClient(
      config,
      (async () => new Response("x".repeat(17_000))) as typeof fetch,
    ),
  ).rejects.toThrow();
});
it("rejects wrong resource, client, callback, missing PKCE and duplicate/unknown parameters", () => {
  const patches: Array<Record<string, string>> = [
    { resource: `${config.origin}/other` },
    { client_id: "evil" },
    { redirect_uri: "https://evil.example.invalid" },
    { code_challenge_method: "plain" },
    { scope: "tasks:read admin" },
  ];
  for (const patch of patches)
    expect(() => parseTaskAuthorization(params(patch), config)).toThrow();
  const duplicate = params();
  duplicate.append("resource", config.resource);
  expect(() => parseTaskAuthorization(duplicate, config)).toThrow();
  const extra = params();
  extra.set("ownerId", foreignOwner);
  expect(() => parseTaskAuthorization(extra, config)).toThrow();
});
it("requires configured owner, valid nonce and explicit owned Areas/operations", async () => {
  const service = createTaskOAuthService(db, config);
  await expect(
    service.pending(foreignOwner, parseTaskAuthorization(params(), config)),
  ).rejects.toThrow();
  const pending = await service.pending(
    owner,
    parseTaskAuthorization(params(), config),
  );
  await expect(
    service.consent(owner, pending.id, "x".repeat(43), [area], ["read"], true),
  ).rejects.toThrow();
  for (const domains of [[], [excluded], [foreignArea], [area, area]])
    await expect(
      service.consent(owner, pending.id, pending.csrf, domains, ["read"], true),
    ).rejects.toThrow();
  await expect(
    service.consent(owner, pending.id, pending.csrf, [area], ["create"], true),
  ).rejects.toThrow();
  expect(await db.taskOAuthGrant.count()).toBe(0);
});
it("denial returns bound state/issuer and issues no grant or code", async () => {
  const service = createTaskOAuthService(db, config);
  const pending = await service.pending(
    owner,
    parseTaskAuthorization(params(), config),
  );
  const location = new URL(
    await service.consent(owner, pending.id, pending.csrf, [], [], false),
  );
  expect(location.searchParams.get("error")).toBe("access_denied");
  expect(location.searchParams.get("iss")).toBe(config.origin);
  expect(location.searchParams.get("state")).toBe("synthetic-state");
  expect(await db.taskOAuthGrant.count()).toBe(0);
  await expect(
    service.consent(owner, pending.id, pending.csrf, [area], ["read"], true),
  ).rejects.toThrow();
});
it("stores hashes, verifies PKCE and allows exactly one code exchange", async () => {
  const service = createTaskOAuthService(db, config);
  const pending = await service.pending(
    owner,
    parseTaskAuthorization(params(), config),
  );
  const redirect = new URL(
    await service.consent(
      owner,
      pending.id,
      pending.csrf,
      [area],
      ["read"],
      true,
    ),
  );
  const input = {
    grant_type: "authorization_code",
    code: redirect.searchParams.get("code")!,
    code_verifier: verifier,
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    resource: config.resource,
  };
  await expect(
    service.exchange({ ...input, code_verifier: "x".repeat(43) }),
  ).rejects.toThrow();
  const result = await service.exchange(input);
  expect(result.scope).toBe("tasks:read");
  await expect(service.exchange(input)).rejects.toThrow();
  const stored = JSON.stringify({
    codes: await db.taskOAuthCode.findMany(),
    tokens: await db.taskOAuthAccessToken.findMany(),
  });
  expect(stored).not.toContain(result.access_token);
  expect(stored).not.toContain(input.code);
  expect(stored).not.toContain(pending.csrf);
  expect(stored).not.toContain(verifier);
});
it("rejects code reuse under concurrent exchange", async () => {
  const service = createTaskOAuthService(db, config);
  const pending = await service.pending(
    owner,
    parseTaskAuthorization(params(), config),
  );
  const redirect = new URL(
    await service.consent(
      owner,
      pending.id,
      pending.csrf,
      [area],
      ["read"],
      true,
    ),
  );
  const input = {
    grant_type: "authorization_code",
    code: redirect.searchParams.get("code")!,
    code_verifier: verifier,
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    resource: config.resource,
  };
  const results = await Promise.allSettled([
    service.exchange(input),
    service.exchange(input),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(await db.taskOAuthAccessToken.count()).toBe(1);
});
it("checks expiry, revocation, configured resource/owner and narrowed policy on every access", async () => {
  let clock = Date.now();
  const service = createTaskOAuthService(db, config, () => clock);
  const issued = await issue(["read"], service);
  expect((await service.access(issued.token.access_token)).domainIds).toEqual([
    area,
  ]);
  await expect(
    service.access(issued.token.access_token, "create"),
  ).rejects.toThrow();
  await expect(
    createTaskOAuthService(db, {
      ...config,
      resource: `${config.origin}/wrong`,
    }).access(issued.token.access_token),
  ).rejects.toThrow();
  await expect(
    createTaskOAuthService(db, { ...config, ownerId: foreignOwner }).access(
      issued.token.access_token,
    ),
  ).rejects.toThrow();
  await expect(
    createTaskOAuthService(db, { ...config, domainIds: [excluded] }).access(
      issued.token.access_token,
    ),
  ).rejects.toThrow();
  clock += 3_601_000;
  await expect(service.access(issued.token.access_token)).rejects.toThrow();
});
it("revokes individual tokens and owner grants without revealing unknown tokens", async () => {
  const issued = await issue();
  await issued.service.revokeToken("x".repeat(43), config.clientId);
  await issued.service.revokeToken(issued.token.access_token, config.clientId);
  await expect(
    issued.service.access(issued.token.access_token),
  ).rejects.toThrow();
  const next = await issue();
  const grant = (await next.service.grants(owner))[0];
  await expect(
    next.service.revokeGrant(foreignOwner, grant.id),
  ).rejects.toThrow();
  await next.service.revokeGrant(owner, grant.id);
  await expect(next.service.access(next.token.access_token)).rejects.toThrow();
});
it("provides bounded durable throttling and caps pending requests", async () => {
  let clock = Date.now();
  const service = createTaskOAuthService(db, config, () => clock);
  await service.rateLimit("synthetic", 1);
  await expect(service.rateLimit("synthetic", 1)).rejects.toThrow();
  clock += 61_000;
  await service.rateLimit("synthetic", 1);
  expect(await db.taskOAuthRateBucket.count()).toBe(1);
  for (let i = 0; i < 10; i++)
    await service.pending(owner, parseTaskAuthorization(params(), config));
  await expect(
    service.pending(owner, parseTaskAuthorization(params(), config)),
  ).rejects.toThrow();
});

it("bounds pending consent under concurrency and expires pending/issued codes", async () => {
  let clock = Date.now();
  const service = createTaskOAuthService(db, config, () => clock);
  for (let i = 0; i < 9; i++)
    await service.pending(owner, parseTaskAuthorization(params(), config));
  const results = await Promise.allSettled([
    service.pending(owner, parseTaskAuthorization(params(), config)),
    service.pending(owner, parseTaskAuthorization(params(), config)),
  ]);
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect(await db.taskOAuthCode.count({ where: { consentedAt: null } })).toBe(
    10,
  );
  const pending = (
    results.find(
      (result) => result.status === "fulfilled",
    ) as PromiseFulfilledResult<{ id: string; csrf: string }>
  ).value;
  clock += 601_000;
  await expect(
    service.consent(owner, pending.id, pending.csrf, [area], ["read"], true),
  ).rejects.toThrow();
  const fresh = await service.pending(
    owner,
    parseTaskAuthorization(params(), config),
  );
  const location = new URL(
    await service.consent(owner, fresh.id, fresh.csrf, [area], ["read"], true),
  );
  clock += 121_000;
  await expect(
    service.exchange({
      grant_type: "authorization_code",
      code: location.searchParams.get("code")!,
      code_verifier: verifier,
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      resource: config.resource,
    }),
  ).rejects.toThrow();
});

it("owner access control uses session, exact Origin and a nonce to revoke a connection", async () => {
  const issued = await issue();
  const handlers = taskOAuthHandlers(
    db,
    async () => ({ user: { id: owner } }),
    env,
    metadataFetch(),
  );
  const response = await handlers.accessPage(
    new Request(`${config.origin}/task-access`),
  );
  expect(response.status).toBe(200);
  const page = await response.text();
  expect(page).not.toContain(issued.token.access_token);
  const id = /name="id" value="([^"]+)"/.exec(page)![1];
  const csrf = /name="csrf" value="([^"]+)"/.exec(page)![1];
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  const form = new URLSearchParams({ id, csrf });
  expect(
    (
      await handlers.ownerRevoke(
        formRequest("/api/mcp/oauth/owner-revoke", form, { cookie }),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await handlers.ownerRevoke(
        formRequest("/api/mcp/oauth/owner-revoke", form, {
          origin: config.origin,
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await handlers.ownerRevoke(
        formRequest("/api/mcp/oauth/owner-revoke", form, {
          origin: config.origin,
          cookie,
        }),
      )
    ).status,
  ).toBe(303);
  await expect(
    issued.service.access(issued.token.access_token),
  ).rejects.toThrow();
  expect(
    (
      await taskOAuthHandlers(
        db,
        async () => ({ user: { id: foreignOwner } }),
        env,
        metadataFetch(),
      ).accessPage(new Request(`${config.origin}/task-access`))
    ).status,
  ).toBe(403);
});
it("advertises exact discovery/issuer metadata and preserves a safe login return", async () => {
  const handlers = taskOAuthHandlers(
    db,
    async () => null,
    env,
    metadataFetch(),
  );
  const metadata = await handlers.metadata("authorization")(
    new Request(`${config.origin}/.well-known/oauth-authorization-server`),
  );
  const body = await metadata.json();
  expect(body.issuer).toBe(config.origin);
  expect(body.code_challenge_methods_supported).toEqual(["S256"]);
  expect(body.token_endpoint_auth_methods_supported).toEqual(["none"]);
  const authorize = await handlers.authorize(
    new Request(`${config.origin}/api/mcp/oauth/authorize?${params()}`),
  );
  expect(authorize.status).toBe(303);
  const returnTo = new URL(authorize.headers.get("location")!).searchParams.get(
    "returnTo",
  );
  expect(taskLoginReturn(returnTo)).toBe(returnTo);
  for (const value of [
    "https://evil.example.invalid",
    "//evil.example.invalid",
    "/api/mcp/oauth/authorize/../token?a=b",
    "/api/mcp/oauth/authorize?x=\\evil",
    "/tasks",
  ])
    expect(taskLoginReturn(value)).toBe("/now");
});
it("requires same-origin consent and nonce cookie then exchanges through real HTTP handlers", async () => {
  const handlers = taskOAuthHandlers(
    db,
    async () => ({ user: { id: owner } }),
    env,
    metadataFetch(),
  );
  const response = await handlers.authorize(
    new Request(`${config.origin}/api/mcp/oauth/authorize?${params()}`),
  );
  expect(response.status).toBe(200);
  const page = await response.text();
  const id = /name="id" value="([^"]+)"/.exec(page)![1];
  const csrf = /name="csrf" value="([^"]+)"/.exec(page)![1];
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  const form = new URLSearchParams({
    id,
    csrf,
    decision: "approve",
    domainId: area,
    operation: "read",
  });
  expect(
    (
      await handlers.consent(
        formRequest("/api/mcp/oauth/consent", form, { cookie }),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await handlers.consent(
        formRequest("/api/mcp/oauth/consent", form, { origin: config.origin }),
      )
    ).status,
  ).toBe(400);
  const consent = await handlers.consent(
    formRequest("/api/mcp/oauth/consent", form, {
      origin: config.origin,
      cookie,
    }),
  );
  expect(consent.status).toBe(303);
  const redirect = new URL(consent.headers.get("location")!);
  const token = await handlers.token(
    formRequest(
      "/api/mcp/oauth/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        code: redirect.searchParams.get("code")!,
        code_verifier: verifier,
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        resource: config.resource,
      }),
    ),
  );
  expect(token.status).toBe(200);
  expect((await token.json()).scope).toBe("tasks:read");
  expect(token.headers.get("cache-control")).toBe("no-store");
});
it("MCP uses real SDK stateless initialization/discovery and denies unauthenticated or read-only writes", async () => {
  const issued = await issue(["read"]);
  const init = await rpc(issued.token.access_token, "initialize");
  expect(init.status).toBe(200);
  expect((await init.json()).result.serverInfo.name).toBe("ryanos-tasks");
  expect(init.headers.has("mcp-session-id")).toBe(false);
  const listed = await (
    await rpc(issued.token.access_token, "tools/list")
  ).json();
  expect(listed.result.tools).toHaveLength(5);
  expect(listed.result.tools[3]._meta.securitySchemes[0].scopes).toContain(
    "tasks:create",
  );
  const unauthorized = await remoteTaskMcp(
    db,
    env,
  )(new Request(config.resource, { method: "POST" }));
  expect(unauthorized.status).toBe(401);
  expect(unauthorized.headers.get("www-authenticate")).toContain(
    "resource_metadata",
  );
  const denied = await (
    await rpc(
      issued.token.access_token,
      "tools/call",
      {
        domainId: area,
        title: "Synthetic action",
        reviewed: true,
        sourceKey: "synthetic:denied",
        source: "Synthetic test",
      },
      "ryanos_task_create",
    )
  ).json();
  expect(denied.result.isError).toBe(true);
  expect(denied.result._meta["mcp/www_authenticate"][0]).toContain(
    "tasks:create",
  );
  expect(await db.executionTask.count()).toBe(0);
});
it("MCP creates, dedupes, lists, reads, version-updates and preserves closed work with canonical links", async () => {
  const issued = await issue();
  const call = async (name: string, args: Record<string, unknown>) =>
    (
      await (
        await rpc(issued.token.access_token, "tools/call", args, name)
      ).json()
    ).result;
  const input = {
    domainId: area,
    title: "Review synthetic supplier quote",
    sourceKey: "synthetic:remote-create",
    source: "Synthetic reviewed source",
    reviewed: true,
    note: "Synthetic details",
    references: [
      {
        title: "Synthetic reference",
        url: "https://source.example.invalid/quote",
      },
    ],
  };
  const created = await call("ryanos_task_create", input);
  expect(created.isError).toBeUndefined();
  const task = created.structuredContent.task;
  expect(task.taskUrl).toBe(`${config.origin}/tasks?taskId=${task.id}`);
  expect(
    (await call("ryanos_task_create", input)).structuredContent.created,
  ).toBe(false);
  expect(await db.executionTask.count()).toBe(1);
  const listed = await call("ryanos_task_list", { domainId: area });
  expect(listed.structuredContent.tasks).toHaveLength(1);
  expect(listed.structuredContent.tasks[0].note).toBeUndefined();
  expect((await call("ryanos_task_list", { domainId: excluded })).isError).toBe(
    true,
  );
  expect(
    (await call("ryanos_task_list", { domainId: foreignArea })).isError,
  ).toBe(true);
  const read = (await call("ryanos_task_read", { id: task.id }))
    .structuredContent;
  expect(read.references).toHaveLength(1);
  const updated = await call("ryanos_task_update", {
    id: task.id,
    reviewed: true,
    expectedUpdatedAt: read.updatedAt,
    patch: { status: "DONE" },
  });
  expect(updated.structuredContent.task.status).toBe("DONE");
  expect(
    (
      await call("ryanos_task_update", {
        id: task.id,
        reviewed: true,
        expectedUpdatedAt: read.updatedAt,
        patch: { note: "stale" },
      })
    ).isError,
  ).toBe(true);
  const closed = (await call("ryanos_task_read", { id: task.id }))
    .structuredContent;
  expect(
    (
      await call("ryanos_task_update", {
        id: task.id,
        reviewed: true,
        expectedUpdatedAt: closed.updatedAt,
        patch: { status: "NOT_STARTED" },
      })
    ).isError,
  ).toBe(true);
});
it("MCP bounds payloads, rejects foreign origins/unknown fields and leaks no token in errors", async () => {
  const issued = await issue();
  const oversized = await remoteTaskMcp(
    db,
    env,
  )(
    new Request(config.resource, {
      method: "POST",
      headers: {
        authorization: `Bearer ${issued.token.access_token}`,
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
      body: "x".repeat(33_000),
    }),
  );
  expect(oversized.status).toBe(413);
  const foreign = await remoteTaskMcp(
    db,
    env,
  )(
    new Request(config.resource, {
      method: "POST",
      headers: {
        authorization: `Bearer ${issued.token.access_token}`,
        origin: "https://evil.example.invalid",
      },
    }),
  );
  expect(foreign.status).toBe(403);
  expect(await foreign.text()).not.toContain(issued.token.access_token);
  const extra = await (
    await rpc(
      issued.token.access_token,
      "tools/call",
      { ownerId: foreignOwner },
      "ryanos_task_catalog",
    )
  ).json();
  expect(extra.result.isError).toBe(true);
  await issued.service.revokeGrant(
    owner,
    (await issued.service.grants(owner))[0].id,
  );
  expect((await rpc(issued.token.access_token, "tools/list")).status).toBe(401);
});

describe("public origin behind a proxy", () => {
  it("uses the forwarded host on Railway and ignores malformed forwarding", async () => {
    const { publicRequestOrigin } = await import("@/server/task-oauth-http");
    const at = (headers: Record<string, string>) => new Request("http://localhost:8080/api/mcp/tasks", { headers });
    expect(publicRequestOrigin(at({ "x-forwarded-host": "commandcenter-production-264d.up.railway.app", "x-forwarded-proto": "https" }))).toBe("https://commandcenter-production-264d.up.railway.app");
    expect(publicRequestOrigin(at({}))).toBe("http://localhost:8080");
    expect(publicRequestOrigin(at({ "x-forwarded-host": "evil.example/@x", "x-forwarded-proto": "https" }))).toBe("http://localhost:8080");
    expect(publicRequestOrigin(at({ "x-forwarded-host": "a.example", "x-forwarded-proto": "javascript" }))).toBe("http://localhost:8080");
  });
});

describe("authorize rejection diagnostics", () => {
  it("names the mismatched field without echoing state or PKCE values", async () => {
    const { authorizationMismatch } = await import("@/server/task-oauth");
    const config = { clientId: "https://chatgpt.com/oauth/client.json", redirectUri: "https://chatgpt.com/connector_platform_oauth_redirect", resource: "https://x.example/api/mcp/tasks" };
    const params = new URLSearchParams({ client_id: config.clientId, redirect_uri: "https://chatgpt.com/connector/oauth/abc123", response_type: "code", code_challenge: "a".repeat(43), code_challenge_method: "S256", scope: "tasks:read", state: "secret-state", prompt: "consent" });
    const result = authorizationMismatch(params, config);
    expect(result.issues).toEqual(["unexpected parameter(s): prompt", "redirect_uri does not match the configured value", "resource missing"]);
    expect(result.received.redirect_uri).toBe("https://chatgpt.com/connector/oauth/abc123");
    expect(JSON.stringify(result)).not.toContain("secret-state");
    expect(JSON.stringify(result)).not.toContain("a".repeat(43));
  });
});
