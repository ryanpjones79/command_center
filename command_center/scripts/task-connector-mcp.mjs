import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

import { tools } from "./task-tool-definitions.mjs";
export { tools } from "./task-tool-definitions.mjs";

export function createMcpHandler({
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  let initialized = false;
  let ready = false;
  const api = async (path, method = "GET", body) => {
    // Exact trusted endpoint only; never follow redirects with the credential.
    let base;
    try {
      base = new URL(env.RYANOS_TASK_API_URL);
    } catch {
      throw new Error(
        "Configure the approved RyanOS API URL and scoped credential locally.",
      );
    }
    if (
      base.username ||
      base.password ||
      base.search ||
      base.hash ||
      !["", "/"].includes(base.pathname)
    )
      throw new Error("Configure an origin URL without credentials or a path.");
    if (
      base.protocol !== "https:" &&
      !(
        base.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)
      )
    )
      throw new Error("RyanOS requires HTTPS or loopback HTTP.");
    const token = env.RYANOS_TASK_CONNECTOR_TOKEN;
    if (!/^[A-Za-z0-9_-]{32,256}$/.test(token ?? ""))
      throw new Error("A scoped RyanOS task credential is required.");
    const response = await fetchImpl(new URL(path, base), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    const result = await response.json();
    if (!response.ok) {
      // Only known safe contract errors cross the adapter boundary; do not echo arbitrary server HTML/diagnostics.
      const code = result?.error?.code;
      if (
        [
          "VERSION_CONFLICT",
          "TERMINAL_TASK",
          "SOURCE_SCOPE_CONFLICT",
          "SOURCE_KEY_IMMUTABLE",
          "SOURCE_ALREADY_BOUND",
          "NOT_FOUND",
          "UNAUTHORIZED",
          "SCOPE_DENIED",
          "INVALID_INPUT",
          "SENSITIVE_CONTEXT",
        ].includes(code)
      ) {
        return { error: { code, status: response.status }, confirmed: false };
      }
      throw new Error(
        "Task request failed; read current task state before retrying.",
      );
    }
    return result;
  };
  return async (message) => {
    const failure = (code, messageText) => ({
      jsonrpc: "2.0",
      id: message?.id ?? null,
      error: { code, message: messageText },
    });
    if (
      !message ||
      message.jsonrpc !== "2.0" ||
      typeof message.method !== "string"
    )
      return failure(-32600, "Invalid request");
    if (!Object.hasOwn(message, "id")) {
      if (message.method === "notifications/initialized" && initialized)
        ready = true;
      return null;
    }
    const result = (value) => ({
      jsonrpc: "2.0",
      id: message.id,
      result: value,
    });
    if (message.method === "ping") return result({});
    if (message.method === "initialize") {
      if (initialized || typeof message.params?.protocolVersion !== "string")
        return failure(-32602, "Invalid initialization");
      initialized = true;
      const versions = ["2024-11-05", "2025-03-26", "2025-06-18"];
      return result({
        protocolVersion: versions.includes(message.params.protocolVersion)
          ? message.params.protocolVersion
          : "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "ryanos-tasks", version: "1.0.0" },
      });
    }
    if (!ready) return failure(-32000, "Initialize the MCP session first");
    if (message.method === "tools/list") return result({ tools });
    if (message.method !== "tools/call")
      return failure(-32601, "Method not found");
    const name = message.params?.name;
    const tool = tools.find((tool) => tool.name === name);
    const args = message.params?.arguments ?? {};
    if (!tool) return failure(-32602, "Unknown task tool");
    if (!args || Array.isArray(args) || typeof args !== "object")
      return failure(-32602, "Arguments must be an object");
    if (
      Object.keys(args).some(
        (key) => !Object.hasOwn(tool.inputSchema.properties, key),
      ) ||
      tool.inputSchema.required.some((key) => !Object.hasOwn(args, key))
    )
      return failure(-32602, "Invalid task arguments");
    try {
      let value;
      if (name === "ryanos_task_catalog")
        value = await api("/api/task-connector/catalog");
      if (name === "ryanos_task_list") {
        const query = new URLSearchParams(
          Object.entries(args).map(([key, value]) => [key, String(value)]),
        );
        value = await api(`/api/task-connector/tasks?${query}`);
      }
      if (name === "ryanos_task_read" || name === "ryanos_task_update") {
        if (typeof args.id !== "string" || !/^c[a-z0-9]{24}$/.test(args.id))
          return failure(-32602, "Invalid task ID");
        const { id, ...body } = args;
        value = await api(
          `/api/task-connector/tasks/${encodeURIComponent(id)}`,
          name === "ryanos_task_read" ? "GET" : "PATCH",
          name === "ryanos_task_read" ? undefined : body,
        );
      }
      if (name === "ryanos_task_create")
        value = await api("/api/task-connector/tasks", "POST", args);
      return result({
        content: [{ type: "text", text: JSON.stringify(value) }],
        isError: Boolean(value?.error),
      });
    } catch {
      return result({
        content: [
          {
            type: "text",
            text: "Task request could not be confirmed. Check local connector configuration and read current state before retrying.",
          },
        ],
        isError: true,
      });
    }
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const handler = createMcpHandler();
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  // Serial processing prevents protocol initialization races and bounds in-flight writes.
  for await (const line of input) {
    let reply;
    if (Buffer.byteLength(line, "utf8") > 65_536)
      reply = {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32600, message: "Request too large" },
      };
    else {
      try {
        reply = await handler(JSON.parse(line));
      } catch {
        reply = {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error" },
        };
      }
    }
    if (reply) process.stdout.write(`${JSON.stringify(reply)}\n`);
  }
}
