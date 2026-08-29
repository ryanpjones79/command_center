import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { activeAgentWorkStates } from "@/lib/agent-state-machine";
import { RYKAS_READ_CAPABILITY, rykasReadRequestSchema, rykasTruthResultSchema, serializeRykasReadRequest, type RykasTruthResult } from "@/lib/rykas-truth-contract";
import { recordAgentEvent } from "@/server/agent/event-service";

type Context = { userId: string; projectId: string; profile: string };
export type RykasReadEnvelope = { status: "READY" | "PENDING" | "BLOCKED" | "DISABLED"; result: RykasTruthResult | null; workItemId: string | null; blockers: string[] };

function cacheMs() { const raw = Number(process.env.AGENT_RYKAS_TRUTH_CACHE_MS ?? 15 * 60_000); return Number.isFinite(raw) ? Math.max(60_000, Math.min(raw, 60 * 60_000)) : 15 * 60_000; }

export async function getOrQueueRykasTruth(context: Context, rawRequest: unknown, db: PrismaClient, now = new Date()): Promise<RykasReadEnvelope> {
  const request = rykasReadRequestSchema.parse(rawRequest);
  if (context.profile !== "RYKAS_GM") return { status: "BLOCKED", result: null, workItemId: null, blockers: ["Rykas truth reads are eligible only for RYKAS_GM."] };
  if (process.env.FEATURE_RYKAS_TRUTH_READ !== "true") return { status: "DISABLED", result: null, workItemId: null, blockers: ["Rykas truth connector is disabled."] };
  const config = await db.agentProjectConfig.findFirst({ where: { userId: context.userId, projectId: context.projectId } });
  if (!config || config.profile !== "RYKAS_GM" || config.workspaceIdentifier !== "rykas-repo") return { status: "BLOCKED", result: null, workItemId: null, blockers: ["Rykas project must use the fixed rykas-repo workspace before truth reads can run."] };
  const operationalContext = serializeRykasReadRequest(request);
  const latestRun = await db.agentRun.findFirst({ where: { userId: context.userId, projectId: context.projectId, status: "SUCCEEDED", workItem: { requiredCapability: RYKAS_READ_CAPABILITY, operationalContext } }, orderBy: { completedAt: "desc" } });
  if (latestRun?.structuredOutcome && latestRun.completedAt && now.getTime() - latestRun.completedAt.getTime() <= cacheMs()) {
    let persisted: unknown;
    try { persisted = JSON.parse(latestRun.structuredOutcome); }
    catch { persisted = null; }
    const parsed = rykasTruthResultSchema.safeParse(persisted);
    if (parsed.success) return { status: "READY", result: parsed.data, workItemId: latestRun.workItemId, blockers: parsed.data.data.blockers.map((item) => item.summary) };
    await recordAgentEvent({ userId: context.userId, projectId: context.projectId, workItemId: latestRun.workItemId, runId: latestRun.id, type: "RYKAS_DATA_BLOCKED", summary: "A persisted Rykas truth result failed schema validation and was rejected." }, db);
    return { status: "BLOCKED", result: null, workItemId: latestRun.workItemId, blockers: ["Persisted Rykas truth result failed schema validation."] };
  }
  const existing = await db.agentWorkItem.findFirst({ where: { userId: context.userId, projectId: context.projectId, requiredCapability: RYKAS_READ_CAPABILITY, operationalContext, state: { in: ["QUEUED", "RETRY", "PLANNING", "RUNNING"] } } });
  if (existing) return { status: "PENDING", result: null, workItemId: existing.id, blockers: ["A bounded outbound Rykas truth read is pending."] };
  const activeCount = await db.agentWorkItem.count({ where: { userId: context.userId, projectId: context.projectId, state: { in: activeAgentWorkStates } } });
  if (activeCount >= config.maxConcurrentWorkItems) return { status: "BLOCKED", result: null, workItemId: null, blockers: [`Rykas WIP limit is full (${activeCount}/${config.maxConcurrentWorkItems}); no truth-read work was created.`] };
  const bucket = Math.floor(now.getTime() / cacheMs()); const fingerprint = createHash("sha256").update(operationalContext).digest("hex").slice(0, 16);
  const work = await db.agentWorkItem.upsert({ where: { projectId_idempotencyKey: { projectId: context.projectId, idempotencyKey: `rykas-truth:${fingerprint}:${bucket}` } }, update: {}, create: { userId: context.userId, projectId: context.projectId, idempotencyKey: `rykas-truth:${fingerprint}:${bucket}`, title: `Read bounded Rykas truth: ${request.operation}`, objective: "Read the existing Rykas SQL-backed operating truth without changing Rykas or executing a purchase.", expectedValue: "Fresh authoritative evidence for the next bounded Rykas GM decision.", acceptanceCriteria: "The fixed loopback adapter returns a schema-valid bounded read-only result with explicit freshness and blockers.", agentRole: "RYKAS_TRUTH_READER", actionCategory: "RESEARCH_READ_ONLY", requiredCapability: RYKAS_READ_CAPABILITY, sandboxPolicy: "READ_ONLY", networkPolicy: "LOCALHOST_ONLY", operationalContext, workspaceIdentifier: "rykas-repo", priority: "HIGH", maxAttempts: 2 } });
  await recordAgentEvent({ userId: context.userId, projectId: context.projectId, workItemId: work.id, idempotencyKey: `rykas-truth-queued:${work.id}`, type: "WORK_QUEUED_FOR_RUNNER", summary: `Bounded ${request.operation} Rykas truth read queued for the outbound runner.`, metadata: { capability: RYKAS_READ_CAPABILITY, operation: request.operation, readOnly: true } }, db);
  return { status: "PENDING", result: null, workItemId: work.id, blockers: ["A bounded outbound Rykas truth read was queued."] };
}
