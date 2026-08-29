import { z } from "zod";
import { agentActionCategories } from "@/lib/agent-policy";
import { phase2AllowedCapabilities } from "@/lib/agent-capabilities";
import type { AgentVerifier, ChiefPortfolioAgent, PortfolioProjectSnapshot, ProjectManagerAgent, ProjectManagerContext } from "@/server/agent/contracts";

type StructuredModelClient = { generate<T>(input: { model: string; name: string; instructions: string; payload: unknown; schema: Record<string, unknown>; validator: z.ZodType<T> }): Promise<T> };

function responseText(response: Record<string, unknown>) {
  if (typeof response.output_text === "string") return response.output_text;
  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output as Array<Record<string, unknown>>) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content as Array<Record<string, unknown>>) if (typeof part.text === "string") return part.text;
  }
  throw new Error("Model response contained no structured output text.");
}

export class OpenAiStructuredModelClient implements StructuredModelClient {
  async generate<T>(input: { model: string; name: string; instructions: string; payload: unknown; schema: Record<string, unknown>; validator: z.ZodType<T> }) {
    if (process.env.FEATURE_AGENT_MODELS !== "true") throw new Error("Model-backed agents are disabled.");
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is required for model-backed agents.");
    const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: input.model, input: [{ role: "system", content: [{ type: "input_text", text: input.instructions }] },
        { role: "user", content: [{ type: "input_text", text: JSON.stringify(input.payload) }] }],
        text: { format: { type: "json_schema", name: input.name, strict: true, schema: input.schema } } }) });
    if (!response.ok) throw new Error(`Model request failed (${response.status}): ${(await response.text()).slice(0, 1000)}`);
    const parsed = JSON.parse(responseText(await response.json() as Record<string, unknown>));
    return input.validator.parse(parsed);
  }
}

export const chiefOutputSchema = z.object({
  status: z.enum(["HEALTHY", "NEEDS_ATTENTION", "BLOCKED"]), movingProjectIds: z.array(z.string()),
  stalledProjectIds: z.array(z.string()), wipViolationProjectIds: z.array(z.string()), projectsNeedingPmReview: z.array(z.string()),
  attentionSummary: z.string().min(1).max(4000), prioritizationRecommendations: z.array(z.object({ projectId: z.string(), action: z.enum(["PRIORITIZE", "DEPRIORITIZE", "KEEP"]), rationale: z.string() })),
  recommendedParkProjectIds: z.array(z.string()), recommendedResumeProjectIds: z.array(z.string()),
  ownerEscalations: z.array(z.object({ projectId: z.string(), question: z.string(), rationale: z.string() }))
});

const chiefJsonSchema = { type: "object", additionalProperties: false, required: Object.keys(chiefOutputSchema.shape), properties: {
  status: { type: "string", enum: ["HEALTHY", "NEEDS_ATTENTION", "BLOCKED"] }, movingProjectIds: { type: "array", items: { type: "string" } },
  stalledProjectIds: { type: "array", items: { type: "string" } }, wipViolationProjectIds: { type: "array", items: { type: "string" } }, projectsNeedingPmReview: { type: "array", items: { type: "string" } }, attentionSummary: { type: "string" },
  prioritizationRecommendations: { type: "array", items: { type: "object", additionalProperties: false, required: ["projectId", "action", "rationale"], properties: { projectId: { type: "string" }, action: { type: "string", enum: ["PRIORITIZE", "DEPRIORITIZE", "KEEP"] }, rationale: { type: "string" } } } },
  recommendedParkProjectIds: { type: "array", items: { type: "string" } }, recommendedResumeProjectIds: { type: "array", items: { type: "string" } },
  ownerEscalations: { type: "array", items: { type: "object", additionalProperties: false, required: ["projectId", "question", "rationale"], properties: { projectId: { type: "string" }, question: { type: "string" }, rationale: { type: "string" } } } }
} };

export class ModelChiefPortfolioAgent implements ChiefPortfolioAgent {
  constructor(private client: StructuredModelClient = new OpenAiStructuredModelClient(), private model = process.env.AGENT_CHIEF_MODEL ?? "gpt-5-mini") {}
  async inspectPortfolio(projects: PortfolioProjectSnapshot[], now: Date) {
    const output = await this.client.generate({ model: this.model, name: "chief_portfolio_review", validator: chiefOutputSchema, schema: chiefJsonSchema,
      instructions: "You are the RyanOS Chief Portfolio Agent. Return only operational recommendations. Do not perform project work. Flag WIP/stalls, avoid project proliferation, and escalate only genuine owner decisions. Never include hidden reasoning.", payload: { now, projects } });
    const ids = new Set(projects.map((p) => p.projectId));
    for (const id of [...output.movingProjectIds, ...output.stalledProjectIds, ...output.projectsNeedingPmReview]) if (!ids.has(id)) throw new Error("Chief proposed an unknown project ID.");
    return { generatedAt: now, ...output };
  }
}

export const pmOutputSchema = z.object({
  disposition: z.enum(["CREATE_WORK", "WAIT", "PARK"]), currentBottleneck: z.string().min(1), evidence: z.string(),
  title: z.string().min(1), objective: z.string().min(1), expectedValue: z.string().min(1), acceptanceCriteria: z.string().min(1),
  agentRole: z.string().min(1), actionCategory: z.enum(agentActionCategories), priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  maxAttempts: z.number().int().min(1).max(5), requiredCapability: z.enum(phase2AllowedCapabilities), sandboxPolicy: z.enum(["READ_ONLY", "WORKSPACE_WRITE"]),
  networkPolicy: z.enum(["OFF", "ALLOWLIST"]), operationalContext: z.string(), nextReviewMinutes: z.number().int().min(5).max(10080), ownerNeeded: z.boolean()
});
const pmJsonSchema = { type: "object", additionalProperties: false, required: Object.keys(pmOutputSchema.shape), properties: {
  disposition: { type: "string", enum: ["CREATE_WORK", "WAIT", "PARK"] }, currentBottleneck: { type: "string" }, evidence: { type: "string" }, title: { type: "string" }, objective: { type: "string" }, expectedValue: { type: "string" }, acceptanceCriteria: { type: "string" }, agentRole: { type: "string" },
  actionCategory: { type: "string", enum: agentActionCategories }, priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] }, maxAttempts: { type: "integer", minimum: 1, maximum: 5 },
  requiredCapability: { type: "string", enum: phase2AllowedCapabilities }, sandboxPolicy: { type: "string", enum: ["READ_ONLY", "WORKSPACE_WRITE"] }, networkPolicy: { type: "string", enum: ["OFF", "ALLOWLIST"] }, operationalContext: { type: "string" }, nextReviewMinutes: { type: "integer", minimum: 5, maximum: 10080 }, ownerNeeded: { type: "boolean" }
} };

export class ModelProjectManagerAgent implements ProjectManagerAgent {
  constructor(private client: StructuredModelClient = new OpenAiStructuredModelClient(), private model = process.env.AGENT_PM_MODEL ?? "gpt-5-mini") {}
  async chooseNextWork(context: ProjectManagerContext) {
    const result = await this.client.generate({ model: this.model, name: "pm_project_review", validator: pmOutputSchema, schema: pmJsonSchema,
      instructions: `You are a bounded RyanOS PM/GM. Do not create work merely to stay busy: choose WAIT or PARK when no valuable action exists. Favor business movement over cosmetic optimization. Propose only a registered capability. CCHCS is PHI-free; never propose sensitive data access. Owner approval is authority, never proof of execution. Return operational summaries only.`, payload: context });
    return { disposition: result.disposition, title: result.title, objective: result.objective, expectedValue: result.expectedValue,
      acceptanceCriteria: result.acceptanceCriteria, agentRole: result.agentRole, actionCategory: result.actionCategory, priority: result.priority,
      maxAttempts: result.maxAttempts, plannedBottleneck: result.currentBottleneck, requiredCapability: result.requiredCapability,
      sandboxPolicy: result.sandboxPolicy, networkPolicy: result.networkPolicy, operationalContext: result.operationalContext };
  }
}

const qaOutputSchema = z.object({ outcome: z.enum(["PASS", "REPAIR", "ESCALATE"]), feedback: z.string().min(1).max(10000), evidence: z.string().min(1).max(30000) });
const qaJsonSchema = { type: "object", additionalProperties: false, required: ["outcome", "feedback", "evidence"], properties: { outcome: { type: "string", enum: ["PASS", "REPAIR", "ESCALATE"] }, feedback: { type: "string" }, evidence: { type: "string" } } };
export class ModelQaVerifier implements AgentVerifier {
  constructor(private client: StructuredModelClient = new OpenAiStructuredModelClient(), private model = process.env.AGENT_QA_MODEL ?? "gpt-5-mini") {}
  async verify(input: Parameters<AgentVerifier["verify"]>[0]) {
    return this.client.generate({ model: this.model, name: "agent_qa_review", validator: qaOutputSchema, schema: qaJsonSchema,
      instructions: "Independently compare the operational result and evidence with the acceptance criteria. Return PASS, bounded REPAIR feedback, or the smallest genuine ESCALATE. Never trust a worker's self-declared pass, never authorize side effects, and never include hidden reasoning.", payload: input });
  }
}
