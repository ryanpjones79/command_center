import { z } from "zod";
import { agentActionCategories } from "@/lib/agent-policy";
import { signalCareCommercialProfileInstructions } from "@/lib/signalcare-commercial-profile";
import {
  phase2AllowedCapabilities,
  SIGNALCARE_WEB_RESEARCH_CAPABILITY
} from "@/lib/agent-capabilities";
import type {
  AgentVerifier,
  ChiefPortfolioAgent,
  PortfolioProjectSnapshot,
  ProjectManagerAgent,
  ProjectManagerContext
} from "@/server/agent/contracts";

export type StructuredModelClient = {
  generate<T>(input: {
    model: string;
    name: string;
    instructions: string;
    payload: unknown;
    schema: Record<string, unknown>;
    validator: z.ZodType<T>;
  }): Promise<T>;
};

function responseText(response: Record<string, unknown>) {
  if (typeof response.output_text === "string") return response.output_text;
  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output as Array<Record<string, unknown>>) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content as Array<Record<string, unknown>>)
      if (typeof part.text === "string") return part.text;
  }
  throw new Error("Model response contained no structured output text.");
}

export class OpenAiStructuredModelClient implements StructuredModelClient {
  async generate<T>(input: {
    model: string;
    name: string;
    instructions: string;
    payload: unknown;
    schema: Record<string, unknown>;
    validator: z.ZodType<T>;
  }) {
    if (process.env.FEATURE_AGENT_MODELS !== "true")
      throw new Error("Model-backed agents are disabled.");
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey)
      throw new Error("OPENAI_API_KEY is required for model-backed agents.");
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: input.model,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: input.instructions }]
          },
          {
            role: "user",
            content: [
              { type: "input_text", text: JSON.stringify(input.payload) }
            ]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: input.name,
            strict: true,
            schema: input.schema
          }
        }
      })
    });
    if (!response.ok)
      throw new Error(
        `Model request failed (${response.status}): ${(await response.text()).slice(0, 1000)}`
      );
    const parsed = JSON.parse(
      responseText((await response.json()) as Record<string, unknown>)
    );
    return input.validator.parse(parsed);
  }
}

export const chiefOutputSchema = z.object({
  status: z.enum(["HEALTHY", "NEEDS_ATTENTION", "BLOCKED"]),
  movingProjectIds: z.array(z.string()),
  stalledProjectIds: z.array(z.string()),
  wipViolationProjectIds: z.array(z.string()),
  projectsNeedingPmReview: z.array(z.string()),
  attentionSummary: z.string().min(1).max(4000),
  prioritizationRecommendations: z.array(
    z.object({
      projectId: z.string(),
      action: z.enum(["PRIORITIZE", "DEPRIORITIZE", "KEEP"]),
      rationale: z.string()
    })
  ),
  recommendedParkProjectIds: z.array(z.string()),
  recommendedResumeProjectIds: z.array(z.string()),
  ownerEscalations: z.array(
    z.object({
      projectId: z.string(),
      question: z.string(),
      rationale: z.string()
    })
  )
});

const chiefJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: Object.keys(chiefOutputSchema.shape),
  properties: {
    status: { type: "string", enum: ["HEALTHY", "NEEDS_ATTENTION", "BLOCKED"] },
    movingProjectIds: { type: "array", items: { type: "string" } },
    stalledProjectIds: { type: "array", items: { type: "string" } },
    wipViolationProjectIds: { type: "array", items: { type: "string" } },
    projectsNeedingPmReview: { type: "array", items: { type: "string" } },
    attentionSummary: { type: "string" },
    prioritizationRecommendations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["projectId", "action", "rationale"],
        properties: {
          projectId: { type: "string" },
          action: {
            type: "string",
            enum: ["PRIORITIZE", "DEPRIORITIZE", "KEEP"]
          },
          rationale: { type: "string" }
        }
      }
    },
    recommendedParkProjectIds: { type: "array", items: { type: "string" } },
    recommendedResumeProjectIds: { type: "array", items: { type: "string" } },
    ownerEscalations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["projectId", "question", "rationale"],
        properties: {
          projectId: { type: "string" },
          question: { type: "string" },
          rationale: { type: "string" }
        }
      }
    }
  }
};

export class ModelChiefPortfolioAgent implements ChiefPortfolioAgent {
  constructor(
    private client: StructuredModelClient = new OpenAiStructuredModelClient(),
    private model = process.env.AGENT_CHIEF_MODEL ?? "gpt-5-mini"
  ) {}
  async inspectPortfolio(projects: PortfolioProjectSnapshot[], now: Date) {
    const output = await this.client.generate({
      model: this.model,
      name: "chief_portfolio_review",
      validator: chiefOutputSchema,
      schema: chiefJsonSchema,
      instructions:
        "You are the RyanOS Chief Portfolio Agent. Return only operational recommendations. Do not perform project work. Flag WIP/stalls, avoid project proliferation, and escalate only genuine owner decisions. Never include hidden reasoning.",
      payload: { now, projects }
    });
    const ids = new Set(projects.map((p) => p.projectId));
    for (const id of [
      ...output.movingProjectIds,
      ...output.stalledProjectIds,
      ...output.projectsNeedingPmReview
    ])
      if (!ids.has(id))
        throw new Error("Chief proposed an unknown project ID.");
    return { generatedAt: now, ...output };
  }
}

const ownerDecisionProposalSchema = z
  .object({
    category: z.enum(agentActionCategories),
    question: z.string().min(1).max(1000),
    context: z.string().min(1).max(10000),
    recommendedChoice: z.string().min(1).max(200),
    availableChoices: z.array(z.string().min(1).max(200)).min(2).max(6),
    expectedUpside: z.string().min(1).max(2000),
    risk: z.string().min(1).max(2000),
    targetEntity: z
      .object({
        type: z.literal("SIGNALCARE_PROSPECT"),
        name: z.string().min(1).max(300)
      })
      .strict()
      .nullable()
  })
  .strict();

export const pmOutputSchema = z
  .object({
    disposition: z.enum(["CREATE_WORK", "WAIT", "PARK"]),
    currentBottleneck: z.string().min(1),
    evidence: z.string().min(1).max(10000),
    title: z.string().min(1),
    objective: z.string().min(1),
    expectedValue: z.string().min(1),
    acceptanceCriteria: z.string().min(1),
    agentRole: z.string().min(1),
    actionCategory: z.enum(agentActionCategories),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    maxAttempts: z.number().int().min(1).max(5),
    requiredCapability: z.enum(phase2AllowedCapabilities),
    sandboxPolicy: z.enum(["READ_ONLY", "WORKSPACE_WRITE"]),
    networkPolicy: z.enum(["OFF", "ALLOWLIST"]),
    operationalContext: z.string(),
    researchMode: z
      .enum(["DISCOVER_PROSPECTS", "QUALIFY_EXISTING_PROSPECT"])
      .nullable(),
    targetProspect: z.string().min(1).max(300).nullable(),
    nextReviewMinutes: z.number().int().min(5).max(10080),
    ownerNeeded: z.boolean(),
    ownerDecision: ownerDecisionProposalSchema.nullable()
  })
  .strict()
  .superRefine((value, context) => {
    if (value.ownerNeeded !== (value.ownerDecision !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ownerDecision"],
        message:
          "ownerNeeded=true requires ownerDecision; ownerNeeded=false requires null."
      });
    }
    if (
      value.ownerDecision?.category === "SEND_EMAIL_OR_MESSAGE" &&
      value.ownerDecision.targetEntity === null
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ownerDecision", "targetEntity"],
        message: "SignalCare outreach requires a typed target prospect."
      });
    }
    const hostedResearch =
      value.requiredCapability === SIGNALCARE_WEB_RESEARCH_CAPABILITY;
    if (hostedResearch !== (value.researchMode !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["researchMode"],
        message:
          "SignalCare hosted research requires a researchMode, and other capabilities must use null."
      });
    }
    if (
      value.researchMode === "QUALIFY_EXISTING_PROSPECT" &&
      !value.targetProspect
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetProspect"],
        message: "Qualification requires one target prospect."
      });
    }
    if (
      value.researchMode !== "QUALIFY_EXISTING_PROSPECT" &&
      value.targetProspect !== null
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetProspect"],
        message: "Only qualification may include a target prospect."
      });
    }
  });

const ownerDecisionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "category",
    "question",
    "context",
    "recommendedChoice",
    "availableChoices",
    "expectedUpside",
    "risk",
    "targetEntity"
  ],
  properties: {
    category: { type: "string", enum: agentActionCategories },
    question: { type: "string" },
    context: { type: "string" },
    recommendedChoice: { type: "string" },
    availableChoices: { type: "array", items: { type: "string" } },
    expectedUpside: { type: "string" },
    risk: { type: "string" },
    targetEntity: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "name"],
          properties: {
            type: { type: "string", enum: ["SIGNALCARE_PROSPECT"] },
            name: { type: "string" }
          }
        },
        { type: "null" }
      ]
    }
  }
} as const;

const pmJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "disposition",
    "currentBottleneck",
    "evidence",
    "title",
    "objective",
    "expectedValue",
    "acceptanceCriteria",
    "agentRole",
    "actionCategory",
    "priority",
    "maxAttempts",
    "requiredCapability",
    "sandboxPolicy",
    "networkPolicy",
    "operationalContext",
    "researchMode",
    "targetProspect",
    "nextReviewMinutes",
    "ownerNeeded",
    "ownerDecision"
  ],
  properties: {
    disposition: { type: "string", enum: ["CREATE_WORK", "WAIT", "PARK"] },
    currentBottleneck: { type: "string" },
    evidence: { type: "string" },
    title: { type: "string" },
    objective: { type: "string" },
    expectedValue: { type: "string" },
    acceptanceCriteria: { type: "string" },
    agentRole: { type: "string" },
    actionCategory: { type: "string", enum: agentActionCategories },
    priority: {
      type: "string",
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    },
    maxAttempts: { type: "integer", minimum: 1, maximum: 5 },
    requiredCapability: { type: "string", enum: phase2AllowedCapabilities },
    sandboxPolicy: {
      type: "string",
      enum: ["READ_ONLY", "WORKSPACE_WRITE"]
    },
    networkPolicy: { type: "string", enum: ["OFF", "ALLOWLIST"] },
    operationalContext: { type: "string" },
    researchMode: {
      type: ["string", "null"],
      enum: ["DISCOVER_PROSPECTS", "QUALIFY_EXISTING_PROSPECT", null]
    },
    targetProspect: { type: ["string", "null"] },
    nextReviewMinutes: { type: "integer", minimum: 5, maximum: 10080 },
    ownerNeeded: { type: "boolean" },
    ownerDecision: {
      anyOf: [ownerDecisionJsonSchema, { type: "null" }]
    }
  }
} as const;

export class ModelProjectManagerAgent implements ProjectManagerAgent {
  readonly adapterKind = "MODEL" as const;
  constructor(
    private client: StructuredModelClient = new OpenAiStructuredModelClient(),
    private model = process.env.AGENT_PM_MODEL ?? "gpt-5-mini"
  ) {}
  async chooseNextWork(context: ProjectManagerContext) {
    const result = await this.client.generate({
      model: this.model,
      name: "pm_project_review",
      validator: pmOutputSchema,
      schema: pmJsonSchema,
      instructions: `You are a bounded RyanOS PM/GM. Do not create work merely to stay busy: choose WAIT or PARK when no valuable action exists. Favor business movement over cosmetic optimization. Propose only a registered capability. SIGNALCARE_PUBLIC_WEB_RESEARCH has exactly two modes: DISCOVER_PROSPECTS only when no worthwhile pipeline prospect exists, or QUALIFY_EXISTING_PROSPECT for exactly one target name present in signalcare.pipeline.snapshot. A queued or qualified SignalCare prospect must be qualified before outreach approval; prospect existence alone never implies readiness. When a prospect exists, qualify the highest-value actionable prospect instead of repeating discovery. Only when snapshot evidence says the exact prospect is outreach_ready with prospect_qualification evidence may external contact be proposed. Then set ownerNeeded=true, use SEND_EMAIL_OR_MESSAGE, include targetEntity={type:"SIGNALCARE_PROSPECT",name:<exact snapshot name>}, and use canonical choices APPROVE, NEEDS_MORE_RESEARCH, PASS. Approval is authorization only and no communication will be sent. Do not use ownerNeeded for uncertainty or an ALLOW action. Public research may prepare internal draft language but cannot contact anyone, submit forms, change pricing, commit, spend, deploy, or send outreach. ${signalCareCommercialProfileInstructions()} CCHCS is PHI-free; never propose sensitive data access. Return operational summaries and evidence only, never hidden reasoning.`,
      payload: context
    });
    if (
      result.requiredCapability === SIGNALCARE_WEB_RESEARCH_CAPABILITY &&
      context.profile !== "SIGNALCARE_GM"
    ) {
      throw new Error(
        "Hosted public web research is not eligible for this project profile."
      );
    }
    const signalCareSnapshot = context.toolEvidence?.find(
      (evidence) => evidence.toolId === "signalcare.pipeline.snapshot"
    )?.output as
      | { prospects?: Array<{ name: string; stage: string }> }
      | undefined;
    const actionableProspects = (signalCareSnapshot?.prospects ?? []).filter(
      (prospect) => prospect.stage.toLowerCase() !== "passed"
    );
    if (
      result.requiredCapability === SIGNALCARE_WEB_RESEARCH_CAPABILITY &&
      result.researchMode === "DISCOVER_PROSPECTS" &&
      actionableProspects.length > 0
    ) {
      return {
        disposition: "WAIT" as const,
        title: "Use existing SignalCare prospects",
        objective: "Avoid unnecessary repeated prospect discovery.",
        expectedValue:
          "Preserve attention for current acquisition opportunities.",
        acceptanceCriteria:
          "Existing prospect evidence remains available to the next PM review.",
        agentRole: "SIGNALCARE_GM",
        actionCategory: "RESEARCH_READ_ONLY" as const,
        priority: "MEDIUM" as const,
        maxAttempts: 1,
        plannedBottleneck: result.currentBottleneck,
        requiredCapability: "REPOSITORY_READ",
        sandboxPolicy: "READ_ONLY" as const,
        networkPolicy: "OFF" as const,
        operationalContext:
          "Repeated discovery deterministically suppressed because prospects already exist.",
        evidence: result.evidence,
        nextReviewMinutes: result.nextReviewMinutes,
        ownerNeeded: false,
        ownerDecision: null,
        researchMode: "DISCOVER_PROSPECTS" as const,
        targetProspect: null
      };
    }
    if (
      result.requiredCapability === SIGNALCARE_WEB_RESEARCH_CAPABILITY &&
      result.researchMode === "QUALIFY_EXISTING_PROSPECT" &&
      !actionableProspects.some(
        (prospect) =>
          prospect.name.toLowerCase() === result.targetProspect?.toLowerCase()
      )
    ) {
      throw new Error(
        "SignalCare qualification must target an existing pipeline prospect."
      );
    }
    return {
      disposition: result.disposition,
      title: result.title,
      objective: result.objective,
      expectedValue: result.expectedValue,
      acceptanceCriteria: result.acceptanceCriteria,
      agentRole: result.agentRole,
      actionCategory: result.actionCategory,
      priority: result.priority,
      maxAttempts: result.maxAttempts,
      plannedBottleneck: result.currentBottleneck,
      requiredCapability: result.requiredCapability,
      sandboxPolicy:
        result.requiredCapability === SIGNALCARE_WEB_RESEARCH_CAPABILITY
          ? "READ_ONLY"
          : result.sandboxPolicy,
      networkPolicy:
        result.requiredCapability === SIGNALCARE_WEB_RESEARCH_CAPABILITY
          ? "ALLOWLIST"
          : result.networkPolicy,
      operationalContext: result.operationalContext,
      evidence: result.evidence,
      nextReviewMinutes: result.nextReviewMinutes,
      ownerNeeded: result.ownerNeeded,
      ownerDecision: result.ownerDecision,
      researchMode: result.researchMode,
      targetProspect: result.targetProspect
    };
  }
}

const qaOutputSchema = z.object({
  outcome: z.enum(["PASS", "REPAIR", "ESCALATE"]),
  feedback: z.string().min(1).max(10000),
  evidence: z.string().min(1).max(30000)
});
const qaJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["outcome", "feedback", "evidence"],
  properties: {
    outcome: { type: "string", enum: ["PASS", "REPAIR", "ESCALATE"] },
    feedback: { type: "string" },
    evidence: { type: "string" }
  }
};
export class ModelQaVerifier implements AgentVerifier {
  constructor(
    private client: StructuredModelClient = new OpenAiStructuredModelClient(),
    private model = process.env.AGENT_QA_MODEL ?? "gpt-5-mini"
  ) {}
  async verify(input: Parameters<AgentVerifier["verify"]>[0]) {
    return this.client.generate({
      model: this.model,
      name: "agent_qa_review",
      validator: qaOutputSchema,
      schema: qaJsonSchema,
      instructions:
        "Independently compare the operational result and evidence with the acceptance criteria. Return PASS, bounded REPAIR feedback, or the smallest genuine ESCALATE. Never trust a worker's self-declared pass, never authorize side effects, and never include hidden reasoning.",
      payload: input
    });
  }
}
