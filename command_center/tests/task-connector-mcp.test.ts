import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import path from "node:path";

const script = path.join(process.cwd(), "scripts/task-connector-mcp.mjs");
const load = () => import(pathToFileURL(script).href);
const token = "synthetic_task_test_token_0000000000";
const env = {
  RYANOS_TASK_API_URL: "https://tasks.example.invalid",
  RYANOS_TASK_CONNECTOR_TOKEN: token,
};
const initialize = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "synthetic-client", version: "1" },
  },
};
const notification = { jsonrpc: "2.0", method: "notifications/initialized" };

it("runs a real newline-delimited stdio MCP handshake and exposes only the five task tools", async () => {
  const child = spawn(process.execPath, [script], {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      RYANOS_TASK_CONNECTOR_TOKEN: "",
      RYANOS_TASK_API_URL: "",
    },
  });
  let output = "",
    errors = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    errors += chunk;
  });
  const done = new Promise<number | null>((resolve, reject) => {
    child.on("exit", resolve);
    child.on("error", reject);
  });
  child.stdin.end(
    [
      initialize,
      notification,
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "ryanos_task_catalog", arguments: {} },
      },
    ]
      .map((value) => JSON.stringify(value))
      .join("\n") + "\n",
  );
  expect(await done).toBe(0);
  expect(errors).toBe("");
  const messages = output
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(messages).toHaveLength(3);
  expect(messages[0].result.capabilities).toEqual({ tools: {} });
  expect(
    messages[1].result.tools.map((tool: { name: string }) => tool.name),
  ).toEqual([
    "ryanos_task_catalog",
    "ryanos_task_list",
    "ryanos_task_read",
    "ryanos_task_create",
    "ryanos_task_update",
  ]);
  expect(messages[2].result.isError).toBe(true); // No configured credential, no network access.
});

it("maps authenticated tools only to the reviewed task endpoint and suppresses secrets and redirect responses", async () => {
  const { createMcpHandler } = await load();
  const fetchMock = vi.fn(async (_url: URL, _init: RequestInit) =>
    Response.json({
      task: { id: "c" + "a".repeat(24), title: "Synthetic response" },
    }),
  );
  const handle = createMcpHandler({ env, fetchImpl: fetchMock });
  expect(
    (await handle({ jsonrpc: "2.0", id: 0, method: "tools/list" })).error.code,
  ).toBe(-32000);
  await handle(initialize);
  await handle(notification);
  const id = "c" + "a".repeat(24);
  const result = await handle({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "ryanos_task_update",
      arguments: {
        id,
        reviewed: true,
        expectedUpdatedAt: "2026-10-03T00:00:00Z",
        patch: { note: "Synthetic details" },
      },
    },
  });
  expect(result.result.isError).toBe(false);
  expect(String(fetchMock.mock.calls[0][0])).toBe(
    `https://tasks.example.invalid/api/task-connector/tasks/${id}`,
  );
  expect(fetchMock.mock.calls[0][1]).toMatchObject({
    method: "PATCH",
    redirect: "error",
    headers: { Authorization: `Bearer ${token}` },
  });
  const unknown = await handle({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "ryanos_task_delete", arguments: { id } },
  });
  expect(unknown.error.code).toBe(-32602);
  fetchMock.mockImplementation(async () =>
    Response.json({ diagnostic: token }, { status: 302 }),
  );
  const failed = await handle({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "ryanos_task_catalog", arguments: {} },
  });
  expect(failed.result.isError).toBe(true);
  expect(JSON.stringify(failed)).not.toContain(token);
});

it("fails closed on unsafe endpoint configuration and returns a structured conflict without overwriting", async () => {
  const { createMcpHandler } = await load();
  for (const endpoint of [
    "http://remote.example.invalid",
    "https://tasks.example.invalid/other",
    "https://user:pass@tasks.example.invalid",
    "https://tasks.example.invalid?redirect=1",
  ]) {
    const fetchMock = vi.fn();
    const handle = createMcpHandler({
      env: { ...env, RYANOS_TASK_API_URL: endpoint },
      fetchImpl: fetchMock,
    });
    await handle(initialize);
    await handle(notification);
    const result = await handle({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "ryanos_task_catalog", arguments: {} },
    });
    expect(result.result.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  }
  const fetchMock = vi.fn(async () =>
    Response.json(
      { error: { code: "VERSION_CONFLICT", message: "Synthetic message" } },
      { status: 409 },
    ),
  );
  const handle = createMcpHandler({ env, fetchImpl: fetchMock });
  await handle(initialize);
  await handle(notification);
  const result = await handle({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "ryanos_task_read",
      arguments: { id: "c" + "a".repeat(24) },
    },
  });
  expect(result.result.isError).toBe(true);
  expect(JSON.parse(result.result.content[0].text).error.code).toBe(
    "VERSION_CONFLICT",
  );
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
