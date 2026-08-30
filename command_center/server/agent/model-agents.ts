import { z } from "zod";
import { agentActionCategories } from "@/lib/agent-policy";
import { signalCareCommercialProfileInstructions } from "@/lib/signalcare-commercial-profile";
import {
  extractRykasTruthReconciliation,
  rykasTruthReconciliationWorkPlan
} from "@/lib/rykas-owner-data-contract";
import {
  phase2AllowedCapabilities,
  SIGNALCARE_WEB_RESEARCH_CAPABILITY
} from "@/lib/agent-capabilities";
import {
  RYKAS_READ_CAPABILITY,
  rykasReadRequestSchema,
  serializeRykasReadRequest
} from "@/lib/rykas-truth-contract";
import type {
  AgentVerifier,
  AgentWorkPlan,
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
    rykasReadRequest: rykasReadRequestSchema.nullable().default(null),
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
    const rykasRead = value.requiredCapability === RYKAS_READ_CAPABILITY;
    if (rykasRead !== (value.rykasReadRequest !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rykasReadRequest"],
        message:
          "RYKAS_OPERATIONS_READ requires one typed Rykas request, and all other capabilities require null."
      });
    }
    // An owner escalation is targeted by ownerDecision.targetEntity. Providers
    // may echo stale research context; the adapter normalizes those fields away
    // before the plan reaches orchestration.
    if (value.ownerNeeded && value.ownerDecision !== null) {
      return;
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

const rykasReadRequestJsonSchema = {
  anyOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["version", "operation", "input"],
      properties: {
        version: { type: "integer", enum: [1] },
        operation: { type: "string", enum: ["OPERATIONS_SNAPSHOT"] },
        input: {
          type: "object",
          additionalProperties: false,
          required: ["limit"],
          properties: { limit: { type: "integer", minimum: 1, maximum: 25 } }
        }
      }
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["version", "operation", "input"],
      properties: {
        version: { type: "integer", enum: [1] },
        operation: { type: "string", enum: ["SOURCING_OPPORTUNITIES"] },
        input: {
          type: "object",
          additionalProperties: false,
          required: ["view", "limit"],
          properties: {
            view: {
              type: "string",
              enum: [
                "TOP",
                "OWNER_ACTION_NEEDED",
                "PURCHASE_READY",
                "NEEDS_DATA",
                "BLOCKED",
                "STALE_EVIDENCE"
              ]
            },
            limit: { type: "integer", minimum: 1, maximum: 25 }
          }
        }
      }
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["version", "operation", "input"],
      properties: {
        version: { type: "integer", enum: [1] },
        operation: { type: "string", enum: ["OPPORTUNITY_DETAIL"] },
        input: {
          type: "object",
          additionalProperties: false,
          required: ["opportunityId"],
          properties: {
            opportunityId: {
              type: "string",
              pattern: "^US:[A-Z0-9]{10}$"
            }
          }
        }
      }
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["version", "operation", "input"],
      properties: {
        version: { type: "integer", enum: [1] },
        operation: {
          type: "string",
          enum: ["PURCHASE_CANDIDATES", "OPERATIONS_BLOCKERS"]
        },
        input: {
          type: "object",
          additionalProperties: false,
          required: ["limit"],
          properties: { limit: { type: "integer", minimum: 1, maximum: 25 } }
        }
      }
    },
    { type: "null" }
  ]
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
    "rykasReadRequest",
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
    rykasReadRequest: rykasReadRequestJsonSchema,
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
  async chooseNextWork(context: ProjectManagerContext): Promise<AgentWorkPlan> {
    const rykasOwnerDataRequest =
      context.profile === "RYKAS_GM"
        ? extractRykasTruthReconciliation(context.toolEvidence)
        : null;
    if (rykasOwnerDataRequest) {
      return rykasTruthReconciliationWorkPlan(rykasOwnerDataRequest);
    }
    const result = await this.client.generate({
      model: this.model,
      name: "pm_project_review",
      validator: pmOutputSchema,
      schema: pmJsonSchema,
      instructions: `You are a bounded RyanOS PM/GM. Do not create work merely to stay busy: choose WAIT or PARK when no valuable action exists. Favor business movement over cosmetic optimization. Propose only a registered capability. For RYKAS_GM, Rykas owns economics: use only realTruth values, treat null as UNKNOWN, and never derive landed cost, profit, ROI, margin, max/ideal cost, score, or quantity. Prioritize purchase-decision-ready profitable candidates, then high-value missing evidence, inventory/listing flow, and stale tied-up capital. Stale evidence requires refresh/research, never BUY. BUY is authorization only and cannot purchase. For RYKAS_OPERATIONS_READ, choose exactly one predefined business read and bounded arguments in the typed rykasReadRequest field; use null for every other capability. Do not add schemaVersion, readOnly, SQL, shell, URLs, paths, or other protocol metadata. Application code enforces and serializes the read-only wire contract; operationalContext is only a concise business note. SIGNALCARE_PUBLIC_WEB_RESEARCH has exactly two modes: DISCOVER_PROSPECTS only when no worthwhile pipeline prospect exists, or QUALIFY_EXISTING_PROSPECT for exactly one target name present in signalcare.pipeline.snapshot. All SignalCare commercial prospect discovery, public research, qualification, buyer/contact verification, and public provenance-gap resolution must use SIGNALCARE_PUBLIC_WEB_RESEARCH, never a repository capability. Repository capabilities are only for genuine SignalCare software/repository work and should use REVERSIBLE_REPOSITORY_WORK. SignalCare passed prospects are terminal audit history: never qualify them, propose outreach to them, or resurrect them unless Ryan explicitly reopens them. When signalcare.pipeline.snapshot has zero actionable prospects, normally continue customer acquisition with bounded DISCOVER_PROSPECTS while honoring passedProspects as permanent discovery exclusions. A queued or qualified SignalCare prospect must be qualified before outreach approval; prospect existence alone never implies readiness. When an actionable prospect exists, qualify the highest-value actionable prospect instead of repeating discovery. Only when snapshot evidence says the exact prospect is outreach_ready with prospect_qualification evidence may external contact be proposed. Then set ownerNeeded=true, use SEND_EMAIL_OR_MESSAGE, include targetEntity={type:"SIGNALCARE_PROSPECT",name:<exact snapshot name>}, use canonical choices APPROVE, NEEDS_MORE_RESEARCH, PASS, and set researchMode=null and targetProspect=null. ownerDecision.targetEntity is the canonical prospect for owner authorization. Do not request additional research unless the evidence actually requires it. Approval is authorization only and no communication will be sent. Do not use ownerNeeded for uncertainty or an ALLOW action. Public research may prepare internal draft language but cannot contact anyone, submit forms, change pricing, commit, spend, deploy, or send outreach. ${signalCareCommercialProfileInstructions()} CCHCS is PHI-free; never propose sensitive data access. Return operational summaries and evidence only, never hidden reasoning.`,
      payload: context
    });
    const ownerEscalation = result.ownerNeeded && result.ownerDecision !== null;
    let requiredCapability = result.requiredCapability;
    let researchMode = ownerEscalation ? null : result.researchMode;
    let targetProspect = ownerEscalation ? null : result.targetProspect;
    let sandboxPolicy = result.sandboxPolicy;
    let networkPolicy = result.networkPolicy;
    let maxAttempts = result.maxAttempts;
    const rykasReadRequest =
      result.requiredCapability === RYKAS_READ_CAPABILITY
        ? rykasReadRequestSchema.parse(result.rykasReadRequest)
        : null;
    const operationalContext = rykasReadRequest
      ? serializeRykasReadRequest(rykasReadRequest)
      : result.operationalContext;
    if (result.requiredCapability === RYKAS_READ_CAPABILITY) {
      if (context.profile !== "RYKAS_GM") throw new Error("Rykas truth reads are eligible only for RYKAS_GM.");
    }
    if (
      !ownerEscalation &&
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
      | {
          prospects?: Array<{ name: string; stage: string }>;
          passedProspects?: Array<{ name: string; domain: string | null }>;
        }
      | undefined;
    const actionableProspects = (signalCareSnapshot?.prospects ?? []).filter(
      (prospect) => prospect.stage.toLowerCase() !== "passed"
    );
    const passedProspects = signalCareSnapshot?.passedProspects ?? [];
    const proposalText = [
      result.title,
      result.objective,
      result.acceptanceCriteria,
      result.evidence,
      result.currentBottleneck,
      result.operationalContext
    ]
      .join(" ")
      .toLowerCase();
    const mentionedActionableProspects = actionableProspects.filter(
      (prospect) =>
        proposalText.includes(prospect.name.trim().toLowerCase())
    );
    const mentionedPassedProspects = passedProspects.filter((prospect) =>
      proposalText.includes(prospect.name.trim().toLowerCase())
    );
    const commercialResearchProposal =
      context.profile === "SIGNALCARE_GM" &&
      !ownerEscalation &&
      result.disposition === "CREATE_WORK" &&
      result.actionCategory === "RESEARCH_READ_ONLY" &&
      (result.agentRole === "SIGNALCARE_RESEARCHER" ||
        /\b(prospect|qualification|buyer|contact|public evidence|provenance)\b/.test(
          proposalText
        ));
    const needsSignalCareCapabilityCorrection =
      commercialResearchProposal &&
      requiredCapability !== SIGNALCARE_WEB_RESEARCH_CAPABILITY;
    if (
      needsSignalCareCapabilityCorrection &&
      mentionedPassedProspects.length > 0
    ) {
      requiredCapability = SIGNALCARE_WEB_RESEARCH_CAPABILITY;
      researchMode = "QUALIFY_EXISTING_PROSPECT";
      targetProspect = mentionedPassedProspects[0]!.name;
      sandboxPolicy = "READ_ONLY";
      networkPolicy = "ALLOWLIST";
      maxAttempts = 1;
    } else if (
      needsSignalCareCapabilityCorrection &&
      mentionedActionableProspects.length === 1
    ) {
      requiredCapability = SIGNALCARE_WEB_RESEARCH_CAPABILITY;
      researchMode = "QUALIFY_EXISTING_PROSPECT";
      targetProspect = mentionedActionableProspects[0]!.name;
      sandboxPolicy = "READ_ONLY";
      networkPolicy = "ALLOWLIST";
      maxAttempts = 1;
    } else if (
      needsSignalCareCapabilityCorrection &&
      actionableProspects.length === 0 &&
      /\b(discover|discovery|find|identify|shortlist|new prospect)\b/.test(
        proposalText
      )
    ) {
      requiredCapability = SIGNALCARE_WEB_RESEARCH_CAPABILITY;
      researchMode = "DISCOVER_PROSPECTS";
      targetProspect = null;
      sandboxPolicy = "READ_ONLY";
      networkPolicy = "ALLOWLIST";
      maxAttempts = Math.max(1, Math.min(2, result.maxAttempts));
    } else if (
      needsSignalCareCapabilityCorrection &&
      /\b(qualify|qualification|buyer|contact|public evidence|provenance)\b/.test(
        proposalText
      )
    ) {
      throw new Error(
        "SignalCare commercial qualification must identify exactly one existing actionable prospect."
      );
    }
    const proposedSignalCareTarget = ownerEscalation
      ? result.ownerDecision?.targetEntity?.name ?? null
      : targetProspect;
    const targetsPassedProspect =
      context.profile === "SIGNALCARE_GM" &&
      typeof proposedSignalCareTarget === "string" &&
      passedProspects.some(
        (prospect) =>
          prospect.name.trim().toLowerCase() ===
          proposedSignalCareTarget.trim().toLowerCase()
      ) &&
      ((ownerEscalation &&
        result.ownerDecision?.category === "SEND_EMAIL_OR_MESSAGE") ||
        (!ownerEscalation &&
          requiredCapability === SIGNALCARE_WEB_RESEARCH_CAPABILITY &&
          researchMode === "QUALIFY_EXISTING_PROSPECT"));
    if (targetsPassedProspect && actionableProspects.length === 0) {
      return {
        disposition: "CREATE_WORK" as const,
        title: "Discover the next evidence-backed SignalCare prospects",
        objective:
          "Identify new plausible customers after the prior prospect was passed by the owner.",
        expectedValue:
          "Continue customer acquisition without resurrecting a terminal prospect.",
        acceptanceCriteria:
          "At most the configured number of source-backed candidates enter the actionable pipeline; passed organizations remain excluded; no external communication occurs.",
        agentRole: "SIGNALCARE_RESEARCHER",
        actionCategory: "RESEARCH_READ_ONLY" as const,
        priority: "HIGH" as const,
        maxAttempts: Math.max(1, Math.min(3, result.maxAttempts)),
        plannedBottleneck: "No actionable SignalCare prospects remain.",
        requiredCapability: SIGNALCARE_WEB_RESEARCH_CAPABILITY,
        sandboxPolicy: "READ_ONLY" as const,
        networkPolicy: "ALLOWLIST" as const,
        operationalContext:
          "Run bounded discovery and exclude all passed organizations and domains from the snapshot.",
        rykasReadRequest: null,
        evidence: result.evidence,
        nextReviewMinutes: result.nextReviewMinutes,
        ownerNeeded: false,
        ownerDecision: null,
        researchMode: "DISCOVER_PROSPECTS" as const,
        targetProspect: null
      };
    }
    if (targetsPassedProspect) {
      return {
        disposition: "WAIT" as const,
        title: "Do not resurrect a passed SignalCare prospect",
        objective: "Keep owner PASS terminal while other actionable prospects remain available.",
        expectedValue: "Preserve owner intent and acquisition focus.",
        acceptanceCriteria: "No work, decision, action request, or communication is created for the passed prospect.",
        agentRole: "SIGNALCARE_GM",
        actionCategory: "RESEARCH_READ_ONLY" as const,
        priority: "MEDIUM" as const,
        maxAttempts: 1,
        plannedBottleneck: result.currentBottleneck,
        requiredCapability: "REPOSITORY_READ",
        sandboxPolicy: "READ_ONLY" as const,
        networkPolicy: "OFF" as const,
        operationalContext: "Passed prospect proposal deterministically suppressed.",
        rykasReadRequest: null,
        evidence: result.evidence,
        nextReviewMinutes: result.nextReviewMinutes,
        ownerNeeded: false,
        ownerDecision: null,
        researchMode: null,
        targetProspect: null
      };
    }
    if (
      !ownerEscalation &&
      requiredCapability === SIGNALCARE_WEB_RESEARCH_CAPABILITY &&
      researchMode === "DISCOVER_PROSPECTS" &&
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
        rykasReadRequest: null,
        evidence: result.evidence,
        nextReviewMinutes: result.nextReviewMinutes,
        ownerNeeded: false,
        ownerDecision: null,
        researchMode: "DISCOVER_PROSPECTS" as const,
        targetProspect: null
      };
    }
    if (
      !ownerEscalation &&
      requiredCapability === SIGNALCARE_WEB_RESEARCH_CAPABILITY &&
      researchMode === "QUALIFY_EXISTING_PROSPECT" &&
      !actionableProspects.some(
        (prospect) =>
          prospect.name.toLowerCase() === targetProspect?.toLowerCase()
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
      maxAttempts,
      plannedBottleneck: result.currentBottleneck,
      requiredCapability,
      sandboxPolicy:
        requiredCapability === SIGNALCARE_WEB_RESEARCH_CAPABILITY
          ? "READ_ONLY"
          : sandboxPolicy,
      networkPolicy:
        requiredCapability === SIGNALCARE_WEB_RESEARCH_CAPABILITY
          ? "ALLOWLIST"
          : networkPolicy,
      operationalContext,
      rykasReadRequest,
      evidence: result.evidence,
      nextReviewMinutes: result.nextReviewMinutes,
      ownerNeeded: result.ownerNeeded,
      ownerDecision: result.ownerDecision,
      researchMode,
      targetProspect
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
