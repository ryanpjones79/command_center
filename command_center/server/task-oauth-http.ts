import { randomBytes, timingSafeEqual } from "node:crypto";
import { type PrismaClient } from "@prisma/client";
import {
  createTaskOAuthService,
  taskOAuthConfig,
  parseTaskAuthorization,
  validateTaskClient,
  TaskOAuthError,
  type TaskOAuthConfig,
} from "@/server/task-oauth";

const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy":
    "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  Vary: "Cookie, Authorization, Origin",
};
const consentCookie = "__Host-ryanos-task-consent";
const revokeCookie = "__Host-ryanos-task-revoke";
const escape = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const cookie = (name: string, value: string, age = 600) =>
  `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
const readCookie = (request: Request, name: string) =>
  request.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${name}=`))
    ?.slice(name.length + 1) ?? "";
const html = (
  title: string,
  body: string,
  extra: Record<string, string> = {},
) =>
  new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title><main><h1>${escape(title)}</h1>${body}</main></html>`,
    {
      headers: {
        ...headers,
        "Content-Type": "text/html; charset=utf-8",
        ...extra,
      },
    },
  );
export function taskOAuthChallenge(
  config: TaskOAuthConfig,
  scope = "tasks:read",
  error?: string,
) {
  return `Bearer resource_metadata="${config.origin}/.well-known/oauth-protected-resource/api/mcp/tasks", scope="${scope}"${error ? `, error="${error}"` : ""}`;
}
export function taskOAuthFailure(error: unknown, config?: TaskOAuthConfig) {
  const known = error instanceof TaskOAuthError;
  const status = known ? error.status : 500;
  const code = known ? error.code : "server_error";
  return Response.json(
    { error: code },
    {
      status,
      headers: {
        ...headers,
        ...(status === 429 ? { "Retry-After": "60" } : {}),
        ...(config && (status === 401 || status === 403)
          ? {
              "WWW-Authenticate": taskOAuthChallenge(
                config,
                "tasks:read",
                code,
              ),
            }
          : {}),
      },
    },
  );
}
export async function boundedTaskForm(request: Request) {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/x-www-form-urlencoded")
  )
    throw new TaskOAuthError(415, "invalid_request");
  if (Number(request.headers.get("content-length")) > 8192)
    throw new TaskOAuthError(413, "invalid_request");
  const reader = request.body?.getReader();
  if (!reader) throw new TaskOAuthError(400, "invalid_request");
  let size = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > 8192) {
      await reader.cancel();
      throw new TaskOAuthError(413, "invalid_request");
    }
    chunks.push(part.value);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}
function strictForm(
  form: URLSearchParams,
  keys: string[],
  arrays: string[] = [],
) {
  if (
    [...form.keys()].some(
      (key) =>
        !keys.includes(key) ||
        (!arrays.includes(key) && form.getAll(key).length !== 1),
    )
  )
    throw new TaskOAuthError(400, "invalid_request");
}
export function requireTaskRequestOrigin(
  request: Request,
  config: TaskOAuthConfig,
  mutation = false,
) {
  if (new URL(request.url).origin !== config.origin)
    throw new TaskOAuthError(403, "origin_denied");
  const origin = request.headers.get("origin");
  if (
    mutation
      ? origin !== config.origin
      : origin !== null &&
        ![config.origin, "https://chatgpt.com"].includes(origin)
  )
    throw new TaskOAuthError(403, "origin_denied");
}
type SessionReader = () => Promise<{ user?: { id?: string } } | null>;
export function taskOAuthHandlers(
  db: PrismaClient,
  session: SessionReader,
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
) {
  const run =
    (
      work: (
        config: TaskOAuthConfig,
        service: ReturnType<typeof createTaskOAuthService>,
      ) => Promise<Response>,
    ) =>
    async (request: Request) => {
      let config: TaskOAuthConfig | undefined;
      try {
        config = taskOAuthConfig(env);
        requireTaskRequestOrigin(request, config);
        return await work(config, createTaskOAuthService(db, config));
      } catch (error) {
        return taskOAuthFailure(error, config);
      }
    };
  const owner = async (config: TaskOAuthConfig) => {
    const id = (await session())?.user?.id;
    if (!id) throw new TaskOAuthError(401, "login_required");
    if (id !== config.ownerId) throw new TaskOAuthError(403, "owner_required");
    return id;
  };
  return {
    metadata: (kind: "resource" | "authorization") =>
      run(async (config) =>
        Response.json(
          kind === "resource"
            ? {
                resource: config.resource,
                authorization_servers: [config.origin],
                bearer_methods_supported: ["header"],
                scopes_supported: config.scopes,
                resource_name: "RyanOS Tasks",
              }
            : {
                issuer: config.origin,
                authorization_endpoint: `${config.origin}/api/mcp/oauth/authorize`,
                token_endpoint: `${config.origin}/api/mcp/oauth/token`,
                revocation_endpoint: `${config.origin}/api/mcp/oauth/revoke`,
                response_types_supported: ["code"],
                grant_types_supported: ["authorization_code"],
                code_challenge_methods_supported: ["S256"],
                token_endpoint_auth_methods_supported: ["none"],
                revocation_endpoint_auth_methods_supported: ["none"],
                client_id_metadata_document_supported: true,
                authorization_response_iss_parameter_supported: true,
                scopes_supported: config.scopes,
              },
          { headers },
        ),
      ),
    authorize: async (request: Request) =>
      run(async (config, service) => {
        await service.rateLimit("authorize", 30);
        const url = new URL(request.url);
        const input = parseTaskAuthorization(url.searchParams, config);
        await validateTaskClient(config, fetcher);
        const userId = (await session())?.user?.id;
        if (!userId) {
          const login = new URL("/login", config.origin);
          login.searchParams.set("returnTo", `${url.pathname}${url.search}`);
          return new Response(null, {
            status: 303,
            headers: { ...headers, Location: login.href },
          });
        }
        if (userId !== config.ownerId)
          throw new TaskOAuthError(403, "owner_required");
        const areas = await db.executionDomain.findMany({
          where: { userId, id: { in: config.domainIds } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        });
        const pending = await service.pending(userId, input);
        const permissions = input.scopes
          .map(
            (scope) =>
              `<label><input type="checkbox" name="operation" value="${escape(scope.slice(6))}"${scope === "tasks:read" ? " checked" : ""}> ${escape(scope)}</label><br>`,
          )
          .join("");
        const areaFields = areas
          .map(
            (area) =>
              `<label><input type="checkbox" name="domainId" value="${escape(area.id)}"> ${escape(area.name)}</label><br>`,
          )
          .join("");
        return html(
          "Allow ChatGPT to access RyanOS tasks",
          `<p>Choose the Areas and permissions for this connection. Access expires after ${Math.floor(config.grantSeconds / 60)} minutes. You can revoke it from Task access. There is no background renewal.</p><form method="post" action="/api/mcp/oauth/consent"><input type="hidden" name="id" value="${escape(pending.id)}"><input type="hidden" name="csrf" value="${escape(pending.csrf)}"><fieldset><legend>Permissions (read is required)</legend>${permissions}</fieldset><fieldset><legend>Owned Areas (choose at least one)</legend>${areaFields}</fieldset><p>Task access can change only the selected operational tasks. Review each requested action in the conversation.</p><button name="decision" value="approve">Allow selected access</button> <button name="decision" value="deny">Cancel</button></form>`,
          { "Set-Cookie": cookie(consentCookie, pending.csrf) },
        );
      })(request),
    consent: async (request: Request) =>
      run(async (config, service) => {
        requireTaskRequestOrigin(request, config, true);
        const userId = await owner(config);
        const form = await boundedTaskForm(request);
        strictForm(
          form,
          ["id", "csrf", "decision", "domainId", "operation"],
          ["domainId", "operation"],
        );
        const csrf = form.get("csrf") ?? "";
        if (
          !/^[A-Za-z0-9_-]{43}$/.test(csrf) ||
          csrf !== readCookie(request, consentCookie) ||
          !["approve", "deny"].includes(form.get("decision") ?? "")
        )
          throw new TaskOAuthError(400, "invalid_request");
        await service.rateLimit("consent", 30);
        const location = await service.consent(
          userId,
          form.get("id") ?? "",
          csrf,
          form.getAll("domainId"),
          form.getAll("operation"),
          form.get("decision") === "approve",
        );
        return new Response(null, {
          status: 303,
          headers: {
            ...headers,
            Location: location,
            "Set-Cookie": cookie(consentCookie, "", 0),
          },
        });
      })(request),
    token: async (request: Request) =>
      run(async (_config, service) => {
        await service.rateLimit("token", 60);
        const form = await boundedTaskForm(request);
        strictForm(form, [
          "grant_type",
          "code",
          "code_verifier",
          "client_id",
          "redirect_uri",
          "resource",
        ]);
        return Response.json(await service.exchange(Object.fromEntries(form)), {
          headers,
        });
      })(request),
    revoke: async (request: Request) =>
      run(async (config, service) => {
        await service.rateLimit("revoke", 60);
        const form = await boundedTaskForm(request);
        strictForm(form, ["token", "token_type_hint", "client_id"]);
        if (!form.has("token"))
          throw new TaskOAuthError(400, "invalid_request");
        await service.revokeToken(
          form.get("token")!,
          form.get("client_id") ?? "",
        );
        return new Response(null, { status: 200, headers });
      })(request),
    accessPage: async (request: Request) =>
      run(async (config, service) => {
        const userId = await owner(config);
        const grants = await service.grants(userId);
        const csrf = randomBytes(32).toString("base64url");
        const areas = await db.executionDomain.findMany({
          where: { userId, id: { in: config.domainIds } },
          select: { id: true, name: true },
        });
        const names = new Map(areas.map((area) => [area.id, area.name]));
        const rows = grants
          .map(
            (grant) =>
              `<li><p>Permissions: ${escape((grant.operations as string[]).join(", "))}. Areas: ${escape((grant.domainIds as string[]).map((id) => names.get(id) ?? "Unavailable area").join(", "))}. Expires: ${escape(grant.expiresAt.toISOString())}.</p><form method="post" action="/api/mcp/oauth/owner-revoke"><input type="hidden" name="id" value="${escape(grant.id)}"><input type="hidden" name="csrf" value="${escape(csrf)}"><button>Revoke this connection</button></form></li>`,
          )
          .join("");
        return html(
          "RyanOS task access",
          `<p>${grants.length} active connections. <a href="/tasks">Open Tasks</a></p><ul>${rows}</ul>`,
          { "Set-Cookie": cookie(revokeCookie, csrf) },
        );
      })(request),
    ownerRevoke: async (request: Request) =>
      run(async (config, service) => {
        requireTaskRequestOrigin(request, config, true);
        const userId = await owner(config);
        const form = await boundedTaskForm(request);
        strictForm(form, ["id", "csrf"]);
        const csrf = form.get("csrf") ?? "",
          expected = readCookie(request, revokeCookie);
        if (
          !/^[A-Za-z0-9_-]{43}$/.test(csrf) ||
          expected.length !== csrf.length ||
          !timingSafeEqual(Buffer.from(csrf), Buffer.from(expected))
        )
          throw new TaskOAuthError(400, "invalid_request");
        await service.rateLimit("owner-revoke", 30);
        await service.revokeGrant(userId, form.get("id") ?? "");
        return new Response(null, {
          status: 303,
          headers: {
            ...headers,
            Location: `${config.origin}/task-access`,
            "Set-Cookie": cookie(revokeCookie, "", 0),
          },
        });
      })(request),
  };
}
