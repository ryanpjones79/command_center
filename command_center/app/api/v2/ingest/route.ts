import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ingestGoals } from "@/server/v2/goals-ingest";
import { ingestSourceEvents, recordSourceSync } from "@/server/v2/ingest";
import { ingestSystemForRequest, resolveOwnerUserId } from "@/server/v2/inbound-auth";

// POST /api/v2/ingest  (Authorization: Bearer <that source's token>)
// Body: { events?: SourceEvent[], goals?: SourceGoal[], results?: SourceResult[] }
// Contract: docs/RYANOS_V2_INTEGRATIONS.md. Receiving only; never writes back.
export const dynamic = "force-dynamic";
const MAX_BYTES = 512 * 1024;

export async function POST(request: Request) {
  const system = ingestSystemForRequest(request);
  if (!system) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return NextResponse.json({ error: "Payload too large" }, { status: 413 });

  let body: { events?: unknown[]; goals?: unknown[]; results?: unknown[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const userId = await resolveOwnerUserId(prisma);
  if (!userId) return NextResponse.json({ error: "Owner not configured" }, { status: 503 });

  const events = Array.isArray(body.events) ? body.events : [];
  // A token may only post for its own system.
  const foreign = events.filter((event) => (event as { system?: string })?.system !== system).length;
  const own = events.filter((event) => (event as { system?: string })?.system === system);
  const results = await ingestSourceEvents(userId, own, prisma);
  const goals = await ingestGoals(userId, system, Array.isArray(body.goals) ? body.goals : [], Array.isArray(body.results) ? body.results : [], prisma);
  await recordSourceSync(userId, system, true, null, prisma);

  return NextResponse.json({
    system,
    accepted: results.filter((result) => result.decision !== "REJECTED").length,
    rejected: results.filter((result) => result.decision === "REJECTED").length + foreign,
    decisions: results.map((result) => ({ key: result.key, decision: result.decision, error: result.error ?? null })),
    goals
  });
}
