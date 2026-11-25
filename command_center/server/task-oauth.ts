import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { type TaskAccess } from "@/lib/task-connector-contract";

export const TASK_SCOPES = [
  "tasks:read",
  "tasks:create",
  "tasks:update",
] as const;
export const hashTaskSecret = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const secret = () => randomBytes(32).toString("base64url");
const equalHash = (value: string, hash: string) =>
  /^[a-f0-9]{64}$/.test(hash) &&
  timingSafeEqual(
    Buffer.from(hashTaskSecret(value), "hex"),
    Buffer.from(hash, "hex"),
  );
export class TaskOAuthError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
export type TaskOAuthConfig = {
  origin: string;
  resource: string;
  ownerId: string;
  domainIds: string[];
  scopes: string[];
  clientId: string;
  redirectUri: string;
  grantSeconds: number;
};
const cuid = z.string().cuid();
function canonicalOrigin(value: string) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    u.pathname !== "/"
  )
    throw new Error();
  return u.origin;
}
export function taskOAuthConfig(
  env: Record<string, string | undefined> = process.env,
): TaskOAuthConfig {
  try {
    if (env.RYANOS_MCP_ENABLED !== "true") throw new Error();
    const origin = canonicalOrigin(env.RYANOS_MCP_ORIGIN ?? "");
    const ownerId = cuid.parse(env.RYANOS_MCP_OWNER_ID);
    const domainIds = z
      .array(cuid)
      .min(1)
      .max(20)
      .parse((env.RYANOS_MCP_DOMAIN_IDS ?? "").split(",").filter(Boolean));
    const scopes = z
      .array(z.enum(TASK_SCOPES))
      .min(1)
      .max(3)
      .parse((env.RYANOS_MCP_SCOPES ?? "tasks:read").split(","));
    if (
      !scopes.includes("tasks:read") ||
      new Set(scopes).size !== scopes.length
    )
      throw new Error();
    const clientId = env.RYANOS_MCP_CLIENT_ID ?? "";
    const redirectUri = env.RYANOS_MCP_REDIRECT_URI ?? "";
    // Exactly one owner-approved OpenAI client document/callback; no arbitrary metadata fetch or DCR.
    if (
      !/^https:\/\/chatgpt\.com\/oauth\/(?:[A-Za-z0-9_-]+\/)?client\.json$/.test(
        clientId,
      )
    )
      throw new Error();
    const redirect = new URL(redirectUri);
    if (
      redirect.origin !== "https://chatgpt.com" ||
      redirect.username ||
      redirect.password ||
      redirect.search ||
      redirect.hash ||
      !/^(?:\/connector_platform_oauth_redirect|\/connector\/oauth\/[A-Za-z0-9_-]+)$/.test(
        redirect.pathname,
      )
    )
      throw new Error();
    const grantSeconds = Number(env.RYANOS_MCP_GRANT_TTL_SECONDS);
    if (
      !Number.isInteger(grantSeconds) ||
      grantSeconds < 300 ||
      grantSeconds > 86_400
    )
      throw new Error();
    return {
      origin,
      resource: `${origin}/api/mcp/tasks`,
      ownerId,
      domainIds: [...new Set(domainIds)],
      scopes,
      clientId,
      redirectUri,
      grantSeconds,
    };
  } catch {
    throw new TaskOAuthError(503, "connector_disabled");
  }
}

export async function validateTaskClient(
  config: TaskOAuthConfig,
  fetcher: typeof fetch = fetch,
) {
  // The only outbound URL is an exact configured OpenAI HTTPS document; redirects fail closed.
  const response = await fetcher(config.clientId, {
    redirect: "error",
    signal: AbortSignal.timeout(5_000),
    cache: "no-store",
  });
  if (!response.ok || !response.body)
    throw new TaskOAuthError(400, "invalid_client");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > 16_384) {
      await reader.cancel();
      throw new TaskOAuthError(400, "invalid_client");
    }
    chunks.push(part.value);
  }
  try {
    const doc = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const methods = doc.token_endpoint_auth_methods_supported ?? [
      doc.token_endpoint_auth_method,
    ];
    if (
      doc.client_id !== config.clientId ||
      !Array.isArray(doc.redirect_uris) ||
      !doc.redirect_uris.includes(config.redirectUri) ||
      !Array.isArray(methods) ||
      !methods.includes("none")
    )
      throw new Error();
  } catch {
    throw new TaskOAuthError(400, "invalid_client");
  }
}

export function parseTaskAuthorization(
  params: URLSearchParams,
  config: TaskOAuthConfig,
) {
  const allowed = [
    "client_id",
    "redirect_uri",
    "response_type",
    "code_challenge",
    "code_challenge_method",
    "scope",
    "state",
    "resource",
  ];
  if (
    [...params.keys()].some(
      (k) => !allowed.includes(k) || params.getAll(k).length !== 1,
    )
  )
    throw new TaskOAuthError(400, "invalid_request");
  const input = z
    .object({
      client_id: z.literal(config.clientId),
      redirect_uri: z.literal(config.redirectUri),
      response_type: z.literal("code"),
      code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
      code_challenge_method: z.literal("S256"),
      scope: z.string().min(1).max(100),
      state: z.string().min(1).max(512),
      resource: z.literal(config.resource),
    })
    .safeParse(Object.fromEntries(params));
  if (!input.success) throw new TaskOAuthError(400, "invalid_request");
  const scopes = input.data.scope.split(" ");
  if (
    !scopes.includes("tasks:read") ||
    scopes.some((s) => !config.scopes.includes(s)) ||
    new Set(scopes).size !== scopes.length
  )
    throw new TaskOAuthError(400, "invalid_scope");
  return { ...input.data, scopes };
}

export function createTaskOAuthService(
  db: PrismaClient,
  config: TaskOAuthConfig,
  now: () => number = Date.now,
) {
  const date = () => new Date(now());
  const tx = async <T>(
    work: (database: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> => {
    for (let attempt = 0; ; attempt++)
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
  };
  const requireOwner = (userId: string) => {
    if (userId !== config.ownerId)
      throw new TaskOAuthError(403, "owner_required");
  };
  const validGrant = (grant: {
    userId: string;
    clientId: string;
    resource: string;
    issuer: string;
    expiresAt: Date;
    revokedAt: Date | null;
    operations: Prisma.JsonValue;
    domainIds: Prisma.JsonValue;
  }) => {
    if (
      grant.userId !== config.ownerId ||
      grant.clientId !== config.clientId ||
      grant.resource !== config.resource ||
      grant.issuer !== config.origin ||
      grant.revokedAt ||
      grant.expiresAt.getTime() <= now()
    )
      throw new TaskOAuthError(401, "invalid_token");
    const domains = z.array(cuid).min(1).max(20).safeParse(grant.domainIds);
    const ops = z
      .array(z.enum(["read", "create", "update"]))
      .min(1)
      .max(3)
      .safeParse(grant.operations);
    if (
      !domains.success ||
      domains.data.some((id) => !config.domainIds.includes(id)) ||
      !ops.success ||
      !ops.data.includes("read") ||
      ops.data.some((op) => !config.scopes.includes(`tasks:${op}`))
    )
      throw new TaskOAuthError(401, "invalid_token");
    return {
      userId: grant.userId,
      domainIds: domains.data,
      operations: ops.data,
    } satisfies TaskAccess;
  };
  return {
    async rateLimit(key: string, maximum: number) {
      const id = hashTaskSecret(key);
      await db.taskOAuthRateBucket.updateMany({
        where: { id, resetsAt: { lte: date() } },
        data: { count: 0, resetsAt: new Date(now() + 60_000) },
      });
      const bucket = await db.taskOAuthRateBucket.upsert({
        where: { id },
        create: { id, count: 1, resetsAt: new Date(now() + 60_000) },
        update: { count: { increment: 1 } },
      });
      if (bucket.count > maximum) throw new TaskOAuthError(429, "rate_limited");
    },
    async pending(
      userId: string,
      request: ReturnType<typeof parseTaskAuthorization>,
    ) {
      requireOwner(userId);
      const csrf = secret();
      // The count and insert share a serializable transaction so concurrent authorization cannot exceed the cap.
      return tx(async (database) => {
        await database.taskOAuthCode.deleteMany({
          where: { userId, expiresAt: { lte: date() } },
        });
        if (
          (await database.taskOAuthCode.count({
            where: { userId, consentedAt: null },
          })) >= 10
        )
          throw new TaskOAuthError(429, "rate_limited");
        const row = await database.taskOAuthCode.create({
          data: {
            userId,
            csrfHash: hashTaskSecret(csrf),
            clientId: request.client_id,
            redirectUri: request.redirect_uri,
            issuer: config.origin,
            resource: request.resource,
            scopes: request.scopes.join(" "),
            state: request.state,
            challenge: request.code_challenge,
            expiresAt: new Date(now() + 600_000),
          },
        });
        return { id: row.id, csrf };
      });
    },
    async consent(
      userId: string,
      id: string,
      csrf: string,
      domainIds: string[],
      operations: string[],
      approve: boolean,
    ) {
      requireOwner(userId);
      const code = secret();
      return tx(async (database) => {
        const row = await database.taskOAuthCode.findFirst({
          where: {
            id,
            userId,
            consentedAt: null,
            consumedAt: null,
            expiresAt: { gt: date() },
          },
        });
        if (
          !row ||
          !equalHash(csrf, row.csrfHash) ||
          row.clientId !== config.clientId ||
          row.redirectUri !== config.redirectUri ||
          row.resource !== config.resource ||
          row.issuer !== config.origin
        )
          throw new TaskOAuthError(400, "invalid_request");
        const redirect = new URL(row.redirectUri);
        redirect.searchParams.set("state", row.state);
        redirect.searchParams.set("iss", config.origin);
        if (!approve) {
          const denied = await database.taskOAuthCode.updateMany({
            where: { id, consentedAt: null },
            data: { consentedAt: date(), consumedAt: date() },
          });
          if (denied.count !== 1)
            throw new TaskOAuthError(400, "invalid_request");
          redirect.searchParams.set("error", "access_denied");
          return redirect.href;
        }
        const domains = z.array(cuid).min(1).max(20).safeParse(domainIds);
        const ops = z
          .array(z.enum(["read", "create", "update"]))
          .min(1)
          .max(3)
          .safeParse(operations);
        if (
          !domains.success ||
          !ops.success ||
          !ops.data.includes("read") ||
          new Set(domains.data).size !== domains.data.length ||
          new Set(ops.data).size !== ops.data.length ||
          domains.data.some((d) => !config.domainIds.includes(d)) ||
          ops.data.some(
            (op) =>
              !row.scopes.split(" ").includes(`tasks:${op}`) ||
              !config.scopes.includes(`tasks:${op}`),
          )
        )
          throw new TaskOAuthError(400, "invalid_scope");
        if (
          (await database.executionDomain.count({
            where: { userId, id: { in: domains.data } },
          })) !== domains.data.length
        )
          throw new TaskOAuthError(400, "invalid_scope");
        // At most five active grants; the owner can revoke obsolete connections through task-access.
        await database.taskOAuthGrant.deleteMany({
          where: { userId, expiresAt: { lte: date() } },
        });
        if (
          (await database.taskOAuthGrant.count({
            where: { userId, revokedAt: null },
          })) >= 5
        )
          throw new TaskOAuthError(429, "rate_limited");
        const grant = await database.taskOAuthGrant.create({
          data: {
            userId,
            clientId: config.clientId,
            issuer: config.origin,
            resource: config.resource,
            domainIds: domains.data,
            operations: ops.data,
            expiresAt: new Date(now() + config.grantSeconds * 1000),
          },
        });
        const issued = await database.taskOAuthCode.updateMany({
          where: { id, consentedAt: null },
          data: {
            grantId: grant.id,
            codeHash: hashTaskSecret(code),
            consentedAt: date(),
            expiresAt: new Date(now() + 120_000),
          },
        });
        if (issued.count !== 1)
          throw new TaskOAuthError(400, "invalid_request");
        redirect.searchParams.set("code", code);
        return redirect.href;
      });
    },
    async exchange(input: Record<string, string>) {
      const parsed = z
        .object({
          grant_type: z.literal("authorization_code"),
          code: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
          code_verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
          client_id: z.literal(config.clientId),
          redirect_uri: z.literal(config.redirectUri),
          resource: z.literal(config.resource),
        })
        .strict()
        .safeParse(input);
      if (!parsed.success) throw new TaskOAuthError(400, "invalid_grant");
      const token = secret();
      return tx(async (database) => {
        const row = await database.taskOAuthCode.findUnique({
          where: { codeHash: hashTaskSecret(parsed.data.code) },
          include: { grant: true },
        });
        const challenge = createHash("sha256")
          .update(parsed.data.code_verifier)
          .digest("base64url");
        if (
          !row?.grant ||
          !row.consentedAt ||
          row.consumedAt ||
          row.expiresAt.getTime() <= now() ||
          row.clientId !== parsed.data.client_id ||
          row.redirectUri !== parsed.data.redirect_uri ||
          row.resource !== parsed.data.resource ||
          row.issuer !== config.origin ||
          challenge !== row.challenge
        )
          throw new TaskOAuthError(400, "invalid_grant");
        const access = validGrant(row.grant);
        const consumed = await database.taskOAuthCode.updateMany({
          where: { id: row.id, consumedAt: null, expiresAt: { gt: date() } },
          data: { consumedAt: date() },
        });
        if (consumed.count !== 1)
          throw new TaskOAuthError(400, "invalid_grant");
        const expiresAt = row.grant.expiresAt;
        await database.taskOAuthAccessToken.create({
          data: {
            grantId: row.grant.id,
            tokenHash: hashTaskSecret(token),
            expiresAt,
          },
        });
        return {
          access_token: token,
          token_type: "Bearer",
          expires_in: Math.max(
            1,
            Math.floor((expiresAt.getTime() - now()) / 1000),
          ),
          scope: access.operations.map((op) => `tasks:${op}`).join(" "),
        };
      });
    },
    async access(
      token: string,
      operation: "read" | "create" | "update" = "read",
    ): Promise<TaskAccess> {
      if (!/^[A-Za-z0-9_-]{43}$/.test(token))
        throw new TaskOAuthError(401, "invalid_token");
      const row = await db.taskOAuthAccessToken.findUnique({
        where: { tokenHash: hashTaskSecret(token) },
        include: { grant: true },
      });
      if (!row || row.revokedAt || row.expiresAt.getTime() <= now())
        throw new TaskOAuthError(401, "invalid_token");
      const access = validGrant(row.grant);
      if (!access.operations.includes(operation))
        throw new TaskOAuthError(403, "insufficient_scope");
      return access;
    },
    async revokeToken(token: string, clientId: string) {
      if (clientId !== config.clientId)
        throw new TaskOAuthError(400, "invalid_client");
      if (/^[A-Za-z0-9_-]{43}$/.test(token))
        await db.taskOAuthAccessToken.updateMany({
          where: { tokenHash: hashTaskSecret(token), grant: { clientId } },
          data: { revokedAt: date() },
        });
    },
    async revokeGrant(userId: string, id: string) {
      requireOwner(userId);
      await db.taskOAuthGrant.updateMany({
        where: { id, userId },
        data: { revokedAt: date() },
      });
    },
    async grants(userId: string) {
      requireOwner(userId);
      return db.taskOAuthGrant.findMany({
        where: { userId, expiresAt: { gt: date() }, revokedAt: null },
        select: {
          id: true,
          operations: true,
          domainIds: true,
          createdAt: true,
          expiresAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      });
    },
  };
}
