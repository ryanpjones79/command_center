import { createHash, timingSafeEqual } from "node:crypto";
import {
  TaskConnectorError,
  type TaskAccess,
} from "@/lib/task-connector-contract";

type Session = { user?: { id?: string } } | null;
export async function authenticateTaskRequest(
  request: Request,
  operation: TaskAccess["operations"][number],
  session: () => Promise<Session>,
  env: Record<string, string | undefined> = process.env,
  now = Date.now(),
): Promise<TaskAccess> {
  const unauthorized = () =>
    new TaskConnectorError(
      401,
      "UNAUTHORIZED",
      "Task authentication required.",
    );
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  if (origin && origin !== url.origin) {
    throw new TaskConnectorError(
      403,
      "ORIGIN_DENIED",
      "Cross-origin task requests are disabled.",
    );
  }
  const authorization = request.headers.get("authorization");
  if (authorization !== null) {
    // A bad bearer token never falls back to cookies. No credential values are logged.
    const token = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(authorization)?.[1];
    const hash = env.RYANOS_TASK_CONNECTOR_SHA256 ?? "";
    const owner = env.RYANOS_TASK_CONNECTOR_OWNER_ID ?? "";
    const domains = (env.RYANOS_TASK_CONNECTOR_DOMAIN_IDS ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    const expires = Date.parse(env.RYANOS_TASK_CONNECTOR_EXPIRES_AT ?? "");
    const operations = (env.RYANOS_TASK_CONNECTOR_OPERATIONS ?? "read")
      .split(",")
      .map((v) => v.trim());
    const cuid = /^c[a-z0-9]{24}$/;
    const valid =
      env.RYANOS_TASK_CONNECTOR_ENABLED === "true" &&
      /^[a-f0-9]{64}$/.test(hash) &&
      cuid.test(owner) &&
      domains.length > 0 &&
      domains.length <= 20 &&
      domains.every((v) => cuid.test(v)) &&
      Number.isFinite(expires) &&
      expires > now &&
      operations.length > 0 &&
      operations.includes("read") &&
      operations.every((v) => ["read", "create", "update"].includes(v));
    if (!token || !valid) throw unauthorized();
    if (
      url.protocol !== "https:" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
      throw unauthorized();
    if (
      !timingSafeEqual(
        createHash("sha256").update(token).digest(),
        Buffer.from(hash, "hex"),
      )
    )
      throw unauthorized();
    if (!operations.includes(operation))
      throw new TaskConnectorError(
        403,
        "SCOPE_DENIED",
        "Task operation is outside this connector's scope.",
      );
    return {
      userId: owner,
      domainIds: [...new Set(domains)],
      operations: operations as TaskAccess["operations"],
    };
  }
  const user = (await session())?.user;
  if (!user?.id) throw unauthorized();
  if (operation !== "read" && origin !== url.origin) {
    throw new TaskConnectorError(
      403,
      "ORIGIN_REQUIRED",
      "Session writes require the app's same-origin request.",
    );
  }
  return {
    userId: user.id,
    domainIds: null,
    operations: ["read", "create", "update"],
  };
}
