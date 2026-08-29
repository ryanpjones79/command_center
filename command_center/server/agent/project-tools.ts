import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { evaluateAgentPolicy, type AgentActionCategory } from "@/lib/agent-policy";
import { prisma } from "@/lib/prisma";
import { recordAgentEvent } from "@/server/agent/event-service";

type ToolContext = { userId: string; projectId: string; profile: string };
type ToolDefinition = { id: string; profiles: string[]; classification: "READ" | "WRITE"; sensitivity: "STANDARD" | "CCHCS_PHI_FREE";
  policyCategory: AgentActionCategory; timeoutMs: number; input: z.ZodTypeAny; output: z.ZodTypeAny;
  execute: (context: ToolContext, input: unknown, db: PrismaClient) => Promise<unknown> };

const emptyInput = z.object({}).strict();
const signalOutput = z.object({ prospects: z.array(z.object({ name: z.string(), stage: z.string(), evidence: z.string().nullable(),
  domain: z.string().nullable(), verifiedFacts: z.array(z.object({ fact: z.string(), sourceUrls: z.array(z.string().url()) })),
  sourceUrls: z.array(z.string().url()), evidenceConfidence: z.string().nullable(), nextAction: z.string().nullable(), stale: z.boolean() })), openOwnerDecisions: z.number() });
const rykasOutput = z.object({ backlog: z.number(), toShip: z.string().nullable(), listedToday: z.number(), sourcingAllowed: z.boolean(), blockers: z.array(z.string()) });
const cchcsOutput = z.object({ commitments: z.array(z.object({ title: z.string(), status: z.string(), dueAt: z.string().nullable(), waitingOn: z.string().nullable(), blocked: z.boolean() })), overdueCount: z.number(), waitingCount: z.number() });

export const projectToolRegistry: Record<string, ToolDefinition> = {
  "signalcare.pipeline.snapshot": { id: "signalcare.pipeline.snapshot", profiles: ["SIGNALCARE_GM"], classification: "READ", sensitivity: "STANDARD", policyCategory: "RESEARCH_READ_ONLY", timeoutMs: 5000, input: emptyInput, output: signalOutput,
    async execute(context, _input, db) { const [actions, queue, decisions] = await Promise.all([
      db.pipelineAction.findMany({ where: { userId: context.userId }, orderBy: { date: "desc" }, take: 50 }),
      db.queueItem.findMany({ where: { userId: context.userId, lane: { in: ["signalcare", "pipeline"] }, status: { not: "done" } }, orderBy: { createdAt: "asc" }, take: 50 }),
      db.agentDecision.count({ where: { userId: context.userId, projectId: context.projectId, status: "PENDING" } })]);
      const now = Date.now(); return { prospects: queue.map((item) => { const evidence = actions.find((a) => a.withWhom?.toLowerCase() === item.recipient.toLowerCase());
        let provenance: Record<string, unknown> = {}; try { provenance = evidence?.note ? JSON.parse(evidence.note) as Record<string, unknown> : {}; } catch { provenance = {}; }
        const verifiedFacts = Array.isArray(provenance.verifiedFacts) ? provenance.verifiedFacts : [];
        const sourceUrls = Array.isArray(provenance.sourceUrls) ? provenance.sourceUrls : [];
        return { name: item.recipient, stage: item.status, evidence: evidence?.note ?? null,
          domain: typeof provenance.domain === "string" ? provenance.domain : null,
          verifiedFacts, sourceUrls, evidenceConfidence: typeof provenance.evidenceConfidence === "string" ? provenance.evidenceConfidence : null,
          nextAction: item.nextAction || null, stale: now - item.createdAt.getTime() > 14 * 86400000 }; }), openOwnerDecisions: decisions }; } },
  "rykas.operations.snapshot": { id: "rykas.operations.snapshot", profiles: ["RYKAS_GM"], classification: "READ", sensitivity: "STANDARD", policyCategory: "RESEARCH_READ_ONLY", timeoutMs: 5000, input: emptyInput, output: rykasOutput,
    async execute(context, _input, db) { const [day, tasks] = await Promise.all([db.rykasDay.findFirst({ where: { userId: context.userId }, orderBy: { date: "desc" } }), db.executionTask.findMany({ where: { userId: context.userId, domain: { slug: "rykas" }, status: { notIn: ["DONE", "DROPPED"] } }, take: 50 })]); const backlog = day?.backlogAfter ?? 0; return { backlog, toShip: day?.toShip ?? null, listedToday: day?.listedCount ?? 0, sourcingAllowed: backlog < 10, blockers: tasks.filter((t) => t.isBlocked || t.waitingOn).map((t) => `${t.title}${t.waitingOn ? ` — waiting on ${t.waitingOn}` : ""}`) }; } },
  "cchcs.commitments.snapshot": { id: "cchcs.commitments.snapshot", profiles: ["CCHCS_PM"], classification: "READ", sensitivity: "CCHCS_PHI_FREE", policyCategory: "CCHCS_PROJECT_MANAGEMENT", timeoutMs: 5000, input: emptyInput, output: cchcsOutput,
    async execute(context, _input, db) { const tasks = await db.executionTask.findMany({ where: { userId: context.userId, projectId: context.projectId, status: { notIn: ["DONE", "DROPPED"] } }, orderBy: [{ dueDate: "asc" }, { priority: "desc" }], take: 100 }); const now = new Date(); return { commitments: tasks.map((t) => ({ title: t.title, status: t.status, dueAt: t.dueDate?.toISOString() ?? null, waitingOn: t.waitingOn, blocked: t.isBlocked })), overdueCount: tasks.filter((t) => t.dueDate && t.dueDate < now).length, waitingCount: tasks.filter((t) => t.status === "WAITING" || t.waitingOn).length }; } }
};

export async function executeProjectTool(context: ToolContext, toolId: string, rawInput: unknown, db: PrismaClient = prisma) {
  const tool = projectToolRegistry[toolId]; if (!tool) throw new Error(`DENY: unknown project tool ${toolId}.`);
  const config = await db.agentProjectConfig.findFirst({ where: { userId: context.userId, projectId: context.projectId } });
  if (!config || config.profile !== context.profile) throw new Error("DENY: project tool ownership/profile mismatch.");
  if (!tool.profiles.includes(context.profile)) throw new Error(`DENY: ${toolId} is not eligible for ${context.profile}.`);
  if (context.profile === "CCHCS_PM" && tool.sensitivity !== "CCHCS_PHI_FREE") throw new Error("DENY: CCHCS tool is outside the PHI-free boundary.");
  if (evaluateAgentPolicy({ category: tool.policyCategory, projectProfile: context.profile }) !== "ALLOW") throw new Error(`DENY: policy does not allow ${toolId}.`);
  const input = tool.input.parse(rawInput); const result = await Promise.race([tool.execute(context, input, db), new Promise((_, reject) => setTimeout(() => reject(new Error(`Tool ${toolId} timed out.`)), tool.timeoutMs))]);
  const output = tool.output.parse(result); await recordAgentEvent({ userId: context.userId, projectId: context.projectId, type: "PROJECT_TOOL_EXECUTED", summary: `${toolId} observed current project truth.`, metadata: { toolId, classification: tool.classification, sensitivity: tool.sensitivity } }, db);
  return output;
}

export async function collectProjectEvidence(context: ToolContext, toolIds: string[], db: PrismaClient = prisma, maxCalls = Number(process.env.AGENT_MAX_TOOL_CALLS_PER_REVIEW ?? 3)) {
  if (toolIds.length > maxCalls) throw new Error(`Tool-call limit exceeded (${toolIds.length}/${maxCalls}).`);
  const evidence = []; for (const toolId of toolIds) evidence.push({ toolId, summary: `${toolId} completed`, output: await executeProjectTool(context, toolId, {}, db) }); return evidence;
}

export function defaultToolsForProfile(profile: string) { return profile === "SIGNALCARE_GM" ? ["signalcare.pipeline.snapshot"] : profile === "RYKAS_GM" ? ["rykas.operations.snapshot"] : profile === "CCHCS_PM" ? ["cchcs.commitments.snapshot"] : []; }
