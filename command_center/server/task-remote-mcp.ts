import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { tools } from "@/scripts/task-tool-definitions.mjs";
import { type PrismaClient } from "@prisma/client";
import { TaskConnectorError, parseInput } from "@/lib/task-connector-contract";
import { createTaskConnectorService } from "@/server/task-connector-service";
import {
  createTaskOAuthService,
  taskOAuthConfig,
  TaskOAuthError,
} from "@/server/task-oauth";
import {
  requireTaskRequestOrigin,
  taskOAuthFailure,
  taskOAuthChallenge,
} from "@/server/task-oauth-http";

export function remoteTaskMcp(
  db: PrismaClient,
  env: Record<string, string | undefined> = process.env,
  revalidate: () => void = () => {},
) {
  return async (request: Request) => {
    let config: ReturnType<typeof taskOAuthConfig> | undefined;
    let server: Server | undefined;
    try {
      config = taskOAuthConfig(env);
      requireTaskRequestOrigin(request, config);
      if (request.method !== "POST")
        return new Response(null, {
          status: 405,
          headers: { Allow: "POST", "Cache-Control": "no-store" },
        });
      const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(
        request.headers.get("authorization") ?? "",
      )?.[1];
      if (!token) throw new TaskOAuthError(401, "invalid_token");
      const oauth = createTaskOAuthService(db, config);
      await oauth.rateLimit("mcp", 240);
      await oauth.access(token);
      const service = createTaskConnectorService(db);
      server = new Server(
        { name: "ryanos-tasks", version: "1.1.0" },
        {
          capabilities: { tools: {} },
          instructions:
            "Use only reviewed, authorized operational work. Resolve permitted Areas, search existing and closed tasks, read details, and reconcile before a version-checked update. A reviewed flag is not owner authorization. Never invent dates or reopen closed work. No outreach, purchases, trades, patient or employee-sensitive content.",
        },
      );
      server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: tools.map((tool) => {
          const operation =
            tool.name === "ryanos_task_create"
              ? "create"
              : tool.name === "ryanos_task_update"
                ? "update"
                : "read";
          const securitySchemes = [
            {
              type: "oauth2",
              scopes:
                operation === "read"
                  ? ["tasks:read"]
                  : ["tasks:read", `tasks:${operation}`],
            },
          ];
          return { ...tool, securitySchemes, _meta: { securitySchemes } };
        }),
      }));
      const origin = config.origin;
      server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
        const operation =
          params.name === "ryanos_task_create"
            ? "create"
            : params.name === "ryanos_task_update"
              ? "update"
              : "read";
        try {
          const definition = tools.find((tool) => tool.name === params.name);
          if (!definition)
            throw new TaskConnectorError(
              400,
              "INVALID_INPUT",
              "Unknown task tool.",
            );
          const args = params.arguments ?? {};
          const allowed = definition.inputSchema.properties ?? {};
          if (
            Object.keys(args).some((key) => !Object.hasOwn(allowed, key)) ||
            (definition.inputSchema.required ?? []).some(
              (key) => !Object.hasOwn(args, key),
            )
          )
            throw new TaskConnectorError(
              400,
              "INVALID_INPUT",
              "Invalid task arguments.",
            );
          const access = await oauth.access(token, operation); // Revocation and operation check again at execution.
          let result: unknown;
          if (params.name === "ryanos_task_catalog")
            result = await service.catalog(access);
          if (params.name === "ryanos_task_list")
            result = await service.list(access, args);
          if (params.name === "ryanos_task_read")
            result = await service.get(
              access,
              parseInput(z.object({ id: z.string().cuid() }).strict(), args).id,
            );
          if (params.name === "ryanos_task_create")
            result = await service.create(access, args);
          if (params.name === "ryanos_task_update") {
            const { id, ...patch } = args;
            result = await service.update(
              access,
              parseInput(z.string().cuid(), id),
              patch,
            );
          }
          if (operation !== "read")
            try {
              revalidate();
            } catch {
              /* Committed results stay authoritative. */
            }
          // Dates serialize normally; every returned taskPath gets its canonical user-openable URL.
          const value = JSON.parse(JSON.stringify(result), (key, item) =>
            item &&
            typeof item === "object" &&
            typeof item.taskPath === "string"
              ? { ...item, taskUrl: new URL(item.taskPath, origin).href }
              : item,
          );
          return {
            content: [{ type: "text" as const, text: JSON.stringify(value) }],
            structuredContent: value,
          };
        } catch (error) {
          const safe =
            error instanceof TaskConnectorError
              ? { error: error.code, message: error.message, confirmed: false }
              : error instanceof TaskOAuthError
                ? { error: error.code, confirmed: false }
                : { error: "TASK_SERVICE_ERROR", confirmed: false };
          const requiredScopes =
            operation === "read"
              ? "tasks:read"
              : `tasks:read tasks:${operation}`;
          return {
            content: [{ type: "text" as const, text: JSON.stringify(safe) }],
            isError: true,
            ...(error instanceof TaskOAuthError
              ? {
                  _meta: {
                    "mcp/www_authenticate": [
                      taskOAuthChallenge(config!, requiredScopes, error.code),
                    ],
                  },
                }
              : {}),
          };
        }
      });
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
        maxRequestBodySize: 32_768,
      });
      await server.connect(transport);
      const response = await transport.handleRequest(request);
      // Materialize short JSON before closing request-scoped transport; no persistent SSE channel.
      const body = await response.arrayBuffer();
      const resultHeaders = new Headers(response.headers);
      resultHeaders.set("Cache-Control", "no-store");
      resultHeaders.set("Vary", "Authorization, Origin");
      return new Response(response.status === 204 ? null : body, {
        status: response.status,
        headers: resultHeaders,
      });
    } catch (error) {
      return taskOAuthFailure(error, config);
    } finally {
      try {
        await server?.close();
      } catch {
        /* No diagnostics or private data leave the route. */
      }
    }
  };
}
