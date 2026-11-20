import { timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

// Bearer-token checks for machine callers. Tokens live only in env
// (RYANOS_INGEST_TOKENS = {"EBAY":"...","STORE_ROUTE":"...","CASINO_AP":"..."};
// RYANOS_CAPTURE_TOKEN for the phone Shortcut). Never logged or echoed.

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function bearer(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

// Returns the single system this token may post for, or null.
export function ingestSystemForRequest(request: Request, env: Record<string, string | undefined> = process.env): string | null {
  const token = bearer(request);
  if (!token) return null;
  let map: Record<string, string> = {};
  try {
    map = JSON.parse(env.RYANOS_INGEST_TOKENS ?? "{}");
  } catch {
    return null;
  }
  for (const [system, expected] of Object.entries(map)) {
    if (typeof expected === "string" && expected.length >= 24 && safeEqual(token, expected)) return system;
  }
  return null;
}

export function captureTokenValid(request: Request, env: Record<string, string | undefined> = process.env) {
  const expected = env.RYANOS_CAPTURE_TOKEN ?? "";
  const token = bearer(request);
  return expected.length >= 24 && token.length > 0 && safeEqual(token, expected);
}

// Single-owner app: the owner is RYANOS_OWNER_EMAIL, else the only user.
export async function resolveOwnerUserId(db: PrismaClient, env: Record<string, string | undefined> = process.env) {
  const email = env.RYANOS_OWNER_EMAIL?.trim();
  if (email) return (await db.user.findUnique({ where: { email }, select: { id: true } }))?.id ?? null;
  const users = await db.user.findMany({ select: { id: true }, take: 2 });
  return users.length === 1 ? users[0].id : null;
}
