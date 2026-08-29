import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { AgentRunner, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const clockSkewMs = 5 * 60 * 1000;

export function bodySha256(body: string) {
  return createHash("sha256").update(body).digest("hex");
}

export function runnerSignature(input: {
  method: string; path: string; timestamp: string; requestId: string; body: string; secret: string;
}) {
  const canonical = [input.method.toUpperCase(), input.path, input.timestamp, input.requestId, bodySha256(input.body)].join("\n");
  return createHmac("sha256", input.secret).update(canonical).digest("hex");
}

function configuredSecrets(): Record<string, string> {
  if (process.env.RYANOS_RUNNER_HMAC_KEYS) {
    try { return JSON.parse(process.env.RYANOS_RUNNER_HMAC_KEYS) as Record<string, string>; }
    catch { throw new Error("RYANOS_RUNNER_HMAC_KEYS must be valid JSON."); }
  }
  const keyId = process.env.RYANOS_RUNNER_KEY_ID;
  const secret = process.env.RYANOS_RUNNER_HMAC_SECRET;
  return keyId && secret ? { [keyId]: secret } : {};
}

export async function authenticateRunnerRequest(
  request: Request,
  rawBody: string,
  db: PrismaClient = prisma,
  now = new Date()
): Promise<AgentRunner> {
  const keyId = request.headers.get("x-ryanos-key-id") ?? "";
  const timestamp = request.headers.get("x-ryanos-timestamp") ?? "";
  const requestId = request.headers.get("x-ryanos-request-id") ?? "";
  const supplied = request.headers.get("x-ryanos-signature") ?? "";
  const parsedTime = new Date(timestamp);
  if (!keyId || !requestId || !supplied || Number.isNaN(parsedTime.getTime())) throw new Error("Invalid runner authentication headers.");
  if (Math.abs(now.getTime() - parsedTime.getTime()) > clockSkewMs) throw new Error("Runner request timestamp is outside the allowed clock skew.");
  const secret = configuredSecrets()[keyId];
  if (!secret || secret.length < 32) throw new Error("Unknown or weak runner key.");
  const expected = runnerSignature({ method: request.method, path: new URL(request.url).pathname, timestamp, requestId, body: rawBody, secret });
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(supplied, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Invalid runner signature.");
  const runner = await db.agentRunner.findFirst({ where: { keyId, enabled: true } });
  if (!runner) throw new Error("Runner is not registered or enabled.");
  try {
    await db.runnerRequestNonce.create({
      data: { runnerId: runner.id, requestId, timestamp: parsedTime, bodyHash: bodySha256(rawBody), expiresAt: new Date(now.getTime() + clockSkewMs) }
    });
  } catch { throw new Error("Runner request replay rejected."); }
  return runner;
}
