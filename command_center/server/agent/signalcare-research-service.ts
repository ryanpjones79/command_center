import type {
  AgentProjectConfig,
  AgentWorkItem,
  PrismaClient
} from "@prisma/client";
import { z } from "zod";
import { SIGNALCARE_WEB_RESEARCH_CAPABILITY } from "@/lib/agent-capabilities";
import { evaluateAgentPolicy } from "@/lib/agent-policy";
import { prisma } from "@/lib/prisma";
import { recordAgentEvent } from "@/server/agent/event-service";
import { transitionAgentWorkItem } from "@/server/agent/work-service";

const defaultProspectLimit = 5;
const hardProspectLimit = 10;

const sourceUrlSchema = z.string().url().max(2000);
const verifiedFactSchema = z
  .object({
    fact: z.string().min(1).max(1000),
    sourceUrls: z.array(sourceUrlSchema).min(1).max(5)
  })
  .strict();

export const signalCareResearchCandidateSchema = z
  .object({
    organizationName: z.string().min(1).max(300),
    officialWebsite: sourceUrlSchema,
    domain: z.string().min(3).max(255),
    organizationType: z.string().min(1).max(300),
    locationCount: z.number().int().positive().max(10000).nullable(),
    geography: z.string().min(1).max(500),
    verifiedPublicFacts: z.array(verifiedFactSchema).min(1).max(10),
    signalCareFit: z.string().min(1).max(1500),
    hypothesis: z.string().max(1000).nullable(),
    suggestedEntryOffer: z.string().min(1).max(500),
    evidenceConfidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
    sourceUrls: z.array(sourceUrlSchema).min(1).max(10),
    recommendedNextAction: z.string().min(1).max(1000)
  })
  .strict();

export const signalCareResearchResultSchema = z
  .object({
    candidates: z
      .array(signalCareResearchCandidateSchema)
      .max(hardProspectLimit),
    searchSummary: z.string().min(1).max(4000)
  })
  .strict();

export type SignalCareResearchCandidate = z.infer<
  typeof signalCareResearchCandidateSchema
>;
export type SignalCareResearchResult = z.infer<
  typeof signalCareResearchResultSchema
>;

export interface SignalCareResearchClient {
  discover(input: {
    objective: string;
    existingOrganizations: string[];
    existingDomains: string[];
    maxProspects: number;
  }): Promise<SignalCareResearchResult>;
}

const candidateJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "organizationName",
    "officialWebsite",
    "domain",
    "organizationType",
    "locationCount",
    "geography",
    "verifiedPublicFacts",
    "signalCareFit",
    "hypothesis",
    "suggestedEntryOffer",
    "evidenceConfidence",
    "sourceUrls",
    "recommendedNextAction"
  ],
  properties: {
    organizationName: { type: "string" },
    officialWebsite: { type: "string" },
    domain: { type: "string" },
    organizationType: { type: "string" },
    locationCount: { type: ["integer", "null"], minimum: 1 },
    geography: { type: "string" },
    verifiedPublicFacts: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["fact", "sourceUrls"],
        properties: {
          fact: { type: "string" },
          sourceUrls: {
            type: "array",
            minItems: 1,
            maxItems: 5,
            items: { type: "string" }
          }
        }
      }
    },
    signalCareFit: { type: "string" },
    hypothesis: { type: ["string", "null"] },
    suggestedEntryOffer: { type: "string" },
    evidenceConfidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
    sourceUrls: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: { type: "string" }
    },
    recommendedNextAction: { type: "string" }
  }
} as const;

const researchJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["candidates", "searchSummary"],
  properties: {
    candidates: {
      type: "array",
      maxItems: hardProspectLimit,
      items: candidateJsonSchema
    },
    searchSummary: { type: "string" }
  }
} as const;

function responseText(response: Record<string, unknown>) {
  if (typeof response.output_text === "string") return response.output_text;
  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output as Array<Record<string, unknown>>) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content as Array<Record<string, unknown>>) {
      if (typeof part.text === "string") return part.text;
    }
  }
  throw new Error(
    "SignalCare research response contained no structured output text."
  );
}

function normalizeUrl(value: string) {
  const url = new URL(value);
  url.hash = "";
  return url.toString().replace(/\/$/, "").toLowerCase();
}

export function normalizeProspectDomain(value: string) {
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return new URL(withProtocol).hostname.toLowerCase().replace(/^www\./, "");
}

function responseSourceUrls(response: Record<string, unknown>) {
  const urls = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    for (const key of ["url", "source_url", "source_website_url"]) {
      if (typeof record[key] === "string") {
        try {
          urls.add(normalizeUrl(record[key]));
        } catch {
          // Invalid provider provenance is ignored and can never validate a candidate.
        }
      }
    }
    Object.values(record).forEach(visit);
  };
  visit(response.output);
  return urls;
}

function retainCitedEvidence(
  result: SignalCareResearchResult,
  provenance: Set<string>
) {
  const candidates = result.candidates.flatMap((candidate) => {
    const citedSources = candidate.sourceUrls.filter((url) =>
      provenance.has(normalizeUrl(url))
    );
    const verifiedPublicFacts = candidate.verifiedPublicFacts.flatMap(
      (fact) => {
        const sourceUrls = fact.sourceUrls.filter((url) =>
          provenance.has(normalizeUrl(url))
        );
        return sourceUrls.length > 0 ? [{ ...fact, sourceUrls }] : [];
      }
    );
    if (
      candidate.evidenceConfidence === "LOW" ||
      citedSources.length === 0 ||
      verifiedPublicFacts.length === 0
    ) {
      return [];
    }
    return [{ ...candidate, sourceUrls: citedSources, verifiedPublicFacts }];
  });
  return signalCareResearchResultSchema.parse({
    candidates,
    searchSummary: result.searchSummary
  });
}

export class OpenAiSignalCareResearchClient implements SignalCareResearchClient {
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly model = process.env.AGENT_SIGNALCARE_RESEARCH_MODEL ??
      "gpt-4.1-mini"
  ) {}

  async discover(input: {
    objective: string;
    existingOrganizations: string[];
    existingDomains: string[];
    maxProspects: number;
  }) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY is required for SignalCare web research."
      );
    }
    const response = await this.fetcher("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        tools: [{ type: "web_search", search_context_size: "medium" }],
        tool_choice: "required",
        include: ["web_search_call.action.sources"],
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: "Find a small evidence-backed SignalCare prospect shortlist using public web sources only. Prefer official organization, locations, providers, careers, and credible business pages. Clearly separate VERIFIED FACTS from HYPOTHESES. Never claim revenue leakage or operational problems without public evidence. Do not contact anyone, submit forms, change pricing, make commitments, or propose more candidates than requested. Exclude organizations already supplied. Return operational evidence only."
              }
            ]
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify(input)
              }
            ]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "signalcare_prospect_research",
            strict: true,
            schema: researchJsonSchema
          }
        }
      })
    });
    if (!response.ok) {
      throw new Error(
        `SignalCare research request failed (${response.status}): ${(await response.text()).slice(0, 1000)}`
      );
    }
    const raw = (await response.json()) as Record<string, unknown>;
    const parsed = signalCareResearchResultSchema.parse(
      JSON.parse(responseText(raw))
    );
    return retainCitedEvidence(parsed, responseSourceUrls(raw));
  }
}

export function getSignalCareResearchLimit() {
  const configured = Number(
    process.env.AGENT_SIGNALCARE_RESEARCH_MAX_PROSPECTS ?? defaultProspectLimit
  );
  if (!Number.isFinite(configured)) return defaultProspectLimit;
  return Math.min(hardProspectLimit, Math.max(1, Math.floor(configured)));
}

export function signalCareWebResearchEnabled() {
  return (
    process.env.FEATURE_AGENT_MODELS === "true" &&
    process.env.FEATURE_SIGNALCARE_WEB_RESEARCH === "true"
  );
}

type LegacyResearchWork = Pick<
  AgentWorkItem,
  "id" | "title" | "objective" | "requiredCapability" | "state"
>;

export function isLegacySignalCareProspectResearch(
  work: LegacyResearchWork,
  profile: string | null | undefined
) {
  if (profile !== "SIGNALCARE_GM") return false;
  if (!["QUEUED", "RETRY"].includes(work.state)) return false;
  if (work.requiredCapability === SIGNALCARE_WEB_RESEARCH_CAPABILITY)
    return false;
  const description = `${work.title} ${work.objective}`.toLowerCase();
  return (
    work.title.trim().toLowerCase() ===
      "build an evidence-backed qualified prospect shortlist for signalcare" ||
    (description.includes("evidence-backed") &&
      description.includes("prospect") &&
      description.includes("shortlist"))
  );
}

export async function reclassifySignalCareProspectResearch(
  config: Pick<AgentProjectConfig, "userId" | "projectId" | "profile">,
  db: PrismaClient = prisma
) {
  if (config.profile !== "SIGNALCARE_GM") return [];
  const workItems = await db.agentWorkItem.findMany({
    where: {
      userId: config.userId,
      projectId: config.projectId,
      state: { in: ["QUEUED", "RETRY"] }
    }
  });
  const reclassified: string[] = [];
  for (const work of workItems) {
    if (!isLegacySignalCareProspectResearch(work, config.profile)) continue;
    const changed = await db.agentWorkItem.updateMany({
      where: {
        id: work.id,
        userId: config.userId,
        state: { in: ["QUEUED", "RETRY"] },
        requiredCapability: work.requiredCapability
      },
      data: {
        requiredCapability: SIGNALCARE_WEB_RESEARCH_CAPABILITY,
        sandboxPolicy: "READ_ONLY",
        networkPolicy: "ALLOWLIST",
        workspaceIdentifier: null,
        blocker: null
      }
    });
    if (changed.count !== 1) continue;
    reclassified.push(work.id);
    await recordAgentEvent(
      {
        userId: config.userId,
        projectId: config.projectId,
        workItemId: work.id,
        idempotencyKey: `signalcare-research-reclassified:${work.id}`,
        type: "WORK_RECLASSIFIED",
        summary:
          "SignalCare prospect discovery reclassified from local repository work to bounded hosted public-web research.",
        metadata: {
          fromCapability: work.requiredCapability,
          toCapability: SIGNALCARE_WEB_RESEARCH_CAPABILITY
        }
      },
      db
    );
  }
  return reclassified;
}

function parseEvidenceDomain(note: string | null) {
  if (!note) return null;
  try {
    const parsed = JSON.parse(note) as Record<string, unknown>;
    return typeof parsed.domain === "string"
      ? normalizeProspectDomain(parsed.domain)
      : null;
  } catch {
    return null;
  }
}

function isUsefulExistingProspect(item: {
  status: string;
  nextAction: string;
}) {
  const status = item.status.trim().toLowerCase();
  const nextAction = item.nextAction.trim().toLowerCase();
  return (
    ["qualified", "ready", "outreach_ready", "decision_ready"].includes(
      status
    ) ||
    /outreach|contact|conversation|prepare.+package|owner.+approval/.test(
      nextAction
    )
  );
}

async function persistCandidates(
  userId: string,
  candidates: SignalCareResearchCandidate[],
  db: PrismaClient,
  now: Date
) {
  const [queue, actions] = await Promise.all([
    db.queueItem.findMany({
      where: { userId, lane: { in: ["signalcare", "pipeline"] } }
    }),
    db.pipelineAction.findMany({
      where: { userId, type: "prospect_research" }
    })
  ]);
  const names = new Set(
    queue.map((item) => item.recipient.trim().toLowerCase())
  );
  const domains = new Set(
    actions.flatMap((action) => {
      const domain = parseEvidenceDomain(action.note);
      return domain ? [domain] : [];
    })
  );
  const created: string[] = [];
  for (const candidate of candidates) {
    const nameKey = candidate.organizationName.trim().toLowerCase();
    const domainKey = normalizeProspectDomain(
      candidate.domain || candidate.officialWebsite
    );
    if (names.has(nameKey) || domains.has(domainKey)) continue;
    await db.queueItem.create({
      data: {
        userId,
        title: `Qualify ${candidate.organizationName}`,
        lane: "signalcare",
        recipient: candidate.organizationName,
        nextAction: candidate.recommendedNextAction,
        status: "queued"
      }
    });
    await db.pipelineAction.create({
      data: {
        userId,
        date: now,
        type: "prospect_research",
        withWhom: candidate.organizationName,
        note: JSON.stringify({
          kind: "signalcare_prospect_research_v1",
          domain: domainKey,
          officialWebsite: candidate.officialWebsite,
          organizationType: candidate.organizationType,
          locationCount: candidate.locationCount,
          geography: candidate.geography,
          verifiedFacts: candidate.verifiedPublicFacts,
          signalCareFit: candidate.signalCareFit,
          hypothesis: candidate.hypothesis,
          suggestedEntryOffer: candidate.suggestedEntryOffer,
          evidenceConfidence: candidate.evidenceConfidence,
          sourceUrls: candidate.sourceUrls,
          recommendedNextAction: candidate.recommendedNextAction
        })
      }
    });
    names.add(nameKey);
    domains.add(domainKey);
    created.push(candidate.organizationName);
  }
  return created;
}

export async function executeSignalCareHostedResearch(
  input: {
    userId: string;
    projectId: string;
    workItemId: string;
    objective: string;
  },
  client: SignalCareResearchClient = new OpenAiSignalCareResearchClient(),
  db: PrismaClient = prisma,
  now = new Date()
) {
  const config = await db.agentProjectConfig.findFirst({
    where: { userId: input.userId, projectId: input.projectId }
  });
  if (!config || config.profile !== "SIGNALCARE_GM") {
    throw new Error(
      "DENY: public web research is available only to the SignalCare STANDARD profile."
    );
  }
  if (!signalCareWebResearchEnabled()) {
    throw new Error("SignalCare hosted web research is disabled.");
  }
  if (
    evaluateAgentPolicy({
      category: "RESEARCH_READ_ONLY",
      projectProfile: config.profile
    }) !== "ALLOW"
  ) {
    throw new Error("DENY: deterministic policy rejected public web research.");
  }
  let work = await db.agentWorkItem.findFirst({
    where: {
      id: input.workItemId,
      userId: input.userId,
      projectId: input.projectId
    }
  });
  if (!work) throw new Error("SignalCare research work item was not found.");
  if (work.requiredCapability !== SIGNALCARE_WEB_RESEARCH_CAPABILITY) {
    throw new Error(
      "SignalCare work item does not request hosted web research."
    );
  }
  if (!["QUEUED", "RETRY"].includes(work.state)) {
    throw new Error(`SignalCare research cannot start from ${work.state}.`);
  }

  work = await transitionAgentWorkItem(
    input.userId,
    work.id,
    "PLANNING",
    {},
    db
  );
  work = await transitionAgentWorkItem(
    input.userId,
    work.id,
    "RUNNING",
    {},
    db
  );
  const attempt = work.attemptCount + 1;
  work = await db.agentWorkItem.update({
    where: { id: work.id },
    data: {
      attemptCount: attempt,
      executorIdentifier: "ryanos-hosted-signalcare-research",
      providerIdentifier: "openai"
    }
  });
  const run = await db.agentRun.upsert({
    where: { idempotencyKey: `signalcare-web-research:${work.id}:${attempt}` },
    update: {},
    create: {
      userId: input.userId,
      projectId: input.projectId,
      workItemId: work.id,
      idempotencyKey: `signalcare-web-research:${work.id}:${attempt}`,
      role: "SIGNALCARE_RESEARCHER",
      runType: "HOSTED_WEB_RESEARCH",
      status: "RUNNING",
      providerIdentifier: "openai",
      modelIdentifier:
        process.env.AGENT_SIGNALCARE_RESEARCH_MODEL ?? "gpt-4.1-mini",
      executorIdentifier: "ryanos-hosted-signalcare-research"
    }
  });
  await recordAgentEvent(
    {
      userId: input.userId,
      projectId: input.projectId,
      workItemId: work.id,
      runId: run.id,
      idempotencyKey: `signalcare-hosted-dispatch:${run.id}`,
      type: "WORK_DISPATCHED",
      summary:
        "SignalCare prospect discovery dispatched to the bounded hosted web-research executor."
    },
    db
  );

  try {
    const existingQueue = await db.queueItem.findMany({
      where: {
        userId: input.userId,
        lane: { in: ["signalcare", "pipeline"] },
        status: { notIn: ["done", "killed"] }
      }
    });
    const existingActions = await db.pipelineAction.findMany({
      where: { userId: input.userId, type: "prospect_research" }
    });
    const existingDomains = existingActions.flatMap((action) => {
      const domain = parseEvidenceDomain(action.note);
      return domain ? [domain] : [];
    });
    const maxProspects = getSignalCareResearchLimit();
    const usefulExistingProspects = existingQueue.filter(
      isUsefulExistingProspect
    );
    const research =
      usefulExistingProspects.length > 0
        ? {
            candidates: [],
            searchSummary: `${usefulExistingProspects.length} useful SignalCare prospect(s) already exist; repeated discovery was skipped.`
          }
        : await client.discover({
            objective: input.objective,
            existingOrganizations: existingQueue.map((item) => item.recipient),
            existingDomains,
            maxProspects
          });
    const validated = signalCareResearchResultSchema.parse(research);
    const boundedCandidates = validated.candidates
      .filter((candidate) => candidate.evidenceConfidence !== "LOW")
      .slice(0, maxProspects);
    if (
      usefulExistingProspects.length === 0 &&
      boundedCandidates.length === 0
    ) {
      throw new Error(
        "Hosted research returned no candidates with adequate cited evidence."
      );
    }
    const created = await persistCandidates(
      input.userId,
      boundedCandidates,
      db,
      now
    );
    await db.agentRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCEEDED",
        operationalResultSummary:
          usefulExistingProspects.length > 0
            ? validated.searchSummary
            : `Created ${created.length} evidence-backed SignalCare prospect(s).`,
        evidence: JSON.stringify({
          created,
          candidateCount: boundedCandidates.length,
          summary: validated.searchSummary
        }),
        structuredOutcome: JSON.stringify({ ...validated, created }),
        completedAt: now
      }
    });
    work = await transitionAgentWorkItem(
      input.userId,
      work.id,
      "VERIFYING",
      {
        resultSummary: validated.searchSummary,
        evidenceSummary: `${created.length} deduplicated prospect(s) persisted with public source provenance.`
      },
      db
    );
    const qaRun = await db.agentRun.upsert({
      where: { idempotencyKey: `signalcare-research-qa:${work.id}:${attempt}` },
      update: {},
      create: {
        userId: input.userId,
        projectId: input.projectId,
        workItemId: work.id,
        idempotencyKey: `signalcare-research-qa:${work.id}:${attempt}`,
        role: "INDEPENDENT_QA",
        runType: "DETERMINISTIC_RESEARCH_QA",
        status: "SUCCEEDED",
        providerIdentifier: "ryanos",
        executorIdentifier: "signalcare-evidence-validator",
        operationalResultSummary: "PASS",
        evidence: `${boundedCandidates.length} candidate(s) passed schema, source, confidence, limit, and deduplication checks.`,
        structuredOutcome: JSON.stringify({ outcome: "PASS", created }),
        completedAt: now
      }
    });
    await transitionAgentWorkItem(
      input.userId,
      work.id,
      "DONE",
      {
        blocker: null,
        resultSummary:
          usefulExistingProspects.length > 0
            ? validated.searchSummary
            : `Created ${created.length} evidence-backed SignalCare prospect(s).`,
        evidenceSummary: `${created.length} prospect(s) persisted with verified facts and public source URLs.`
      },
      db
    );
    await recordAgentEvent(
      {
        userId: input.userId,
        projectId: input.projectId,
        workItemId: work.id,
        runId: qaRun.id,
        idempotencyKey: `signalcare-research-completed:${work.id}:${attempt}`,
        type: "QA_PASSED",
        summary:
          usefulExistingProspects.length > 0
            ? "Existing SignalCare prospects prevented unnecessary repeated discovery."
            : `${created.length} evidence-backed prospect(s) entered the existing SignalCare pipeline.`,
        metadata: {
          movementKind: "SIGNALCARE_PROSPECTS_ADVANCED",
          createdCount: created.length,
          externalOutreachPerformed: false
        }
      },
      db
    );
    await db.agentProjectConfig.update({
      where: { projectId: input.projectId },
      data: { nextAgentReviewAt: now }
    });
    return {
      outcome: "COMPLETED" as const,
      created,
      skippedBecauseProspectsExist: usefulExistingProspects.length > 0
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.agentRun.update({
      where: { id: run.id },
      data: { status: "FAILED", error: message, completedAt: now }
    });
    const nextState: "FAILED" | "RETRY" =
      attempt >= work.maxAttempts ? "FAILED" : "RETRY";
    await transitionAgentWorkItem(
      input.userId,
      work.id,
      nextState,
      {
        blocker: message,
        nextEligibleRunAt: nextState === "RETRY" ? now : null
      },
      db
    );
    await recordAgentEvent(
      {
        userId: input.userId,
        projectId: input.projectId,
        workItemId: work.id,
        runId: run.id,
        idempotencyKey: `signalcare-research-failed:${work.id}:${attempt}`,
        type: nextState === "RETRY" ? "RETRY_CREATED" : "MAX_RETRIES_EXHAUSTED",
        summary: message
      },
      db
    );
    return { outcome: nextState, created: [], error: message };
  }
}
