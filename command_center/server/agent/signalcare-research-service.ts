import type {
  AgentProjectConfig,
  AgentWorkItem,
  PrismaClient
} from "@prisma/client";
import { z } from "zod";
import { SIGNALCARE_WEB_RESEARCH_CAPABILITY } from "@/lib/agent-capabilities";
import { evaluateAgentPolicy } from "@/lib/agent-policy";
import { prisma } from "@/lib/prisma";
import {
  containsProhibitedSignalCarePositioning,
  signalCareApprovedOfferIds,
  signalCareApprovedOfferSchema,
  signalCareCommercialProfileInstructions
} from "@/lib/signalcare-commercial-profile";
import {
  evaluateSignalCareOutreachReadiness,
  parseSignalCareDecisionTarget
} from "@/server/agent/signalcare-outreach-policy";
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

export const signalCareResearchContextSchema = z.discriminatedUnion(
  "researchMode",
  [
    z
      .object({
        researchMode: z.literal("DISCOVER_PROSPECTS"),
        targetProspect: z.null(),
        instructions: z.string().max(4000)
      })
      .strict(),
    z
      .object({
        researchMode: z.literal("QUALIFY_EXISTING_PROSPECT"),
        targetProspect: z.string().min(1).max(300),
        instructions: z.string().max(4000)
      })
      .strict()
  ]
);

export type SignalCareResearchContext = z.infer<
  typeof signalCareResearchContextSchema
>;

export function serializeSignalCareResearchContext(input: {
  researchMode: SignalCareResearchContext["researchMode"];
  targetProspect?: string | null;
  instructions?: string;
}) {
  return JSON.stringify(
    signalCareResearchContextSchema.parse({
      researchMode: input.researchMode,
      targetProspect:
        input.researchMode === "QUALIFY_EXISTING_PROSPECT"
          ? input.targetProspect
          : null,
      instructions: input.instructions ?? ""
    })
  );
}

export function parseSignalCareResearchContext(
  value: string | null | undefined
): SignalCareResearchContext {
  if (!value) {
    return {
      researchMode: "DISCOVER_PROSPECTS",
      targetProspect: null,
      instructions: "Legacy bounded prospect discovery."
    };
  }
  try {
    return signalCareResearchContextSchema.parse(JSON.parse(value));
  } catch {
    throw new Error("SignalCare research operationalContext is invalid.");
  }
}

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
    suggestedEntryOffer: signalCareApprovedOfferSchema,
    evidenceConfidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
    sourceUrls: z.array(sourceUrlSchema).min(1).max(10),
    recommendedNextAction: z.string().min(1).max(1000)
  })
  .strict()
  .superRefine((value, context) => {
    if (
      containsProhibitedSignalCarePositioning([
        value.signalCareFit,
        value.hypothesis,
        value.recommendedNextAction
      ])
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["signalCareFit"],
        message:
          "Candidate uses prohibited, non-canonical SignalCare commercial positioning."
      });
    }
  });

export const signalCareResearchResultSchema = z
  .object({
    candidates: z
      .array(signalCareResearchCandidateSchema)
      .max(hardProspectLimit),
    searchSummary: z.string().min(1).max(4000)
  })
  .strict();

export const signalCareQualificationSchema = z
  .object({
    organizationName: z.string().min(1).max(300),
    likelyStakeholderRole: z.string().min(1).max(500),
    verifiedPublicFacts: z.array(verifiedFactSchema).min(1).max(12),
    verifiedFitEvidence: z.array(verifiedFactSchema).min(1).max(8),
    hypothesis: z.string().min(1).max(1500),
    recommendedEntryOffer: signalCareApprovedOfferSchema,
    conversationAngle: z.string().max(1500).nullable(),
    draftOutreachLanguage: z.string().max(3000).nullable(),
    evidenceAgainstPursuit: z.string().min(1).max(1500),
    confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
    recommendation: z.enum(["ADVANCE", "NEED_MORE_RESEARCH", "PASS"]),
    sourceUrls: z.array(sourceUrlSchema).min(1).max(15),
    qualificationSummary: z.string().min(1).max(3000),
    nextResearchStep: z.string().max(1000).nullable()
  })
  .strict()
  .superRefine((value, context) => {
    if (
      containsProhibitedSignalCarePositioning([
        value.hypothesis,
        value.conversationAngle,
        value.draftOutreachLanguage,
        value.qualificationSummary
      ])
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recommendedEntryOffer"],
        message:
          "Qualification uses prohibited, non-canonical SignalCare commercial positioning."
      });
    }
    if (
      value.recommendation === "ADVANCE" &&
      (!value.conversationAngle || !value.draftOutreachLanguage)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["draftOutreachLanguage"],
        message:
          "ADVANCE requires an internal conversation angle and draft outreach language."
      });
    }
  });

export type SignalCareResearchCandidate = z.infer<
  typeof signalCareResearchCandidateSchema
>;
export type SignalCareResearchResult = z.infer<
  typeof signalCareResearchResultSchema
>;
export type SignalCareQualification = z.infer<
  typeof signalCareQualificationSchema
>;
export type SignalCareQualificationResult = {
  qualification: SignalCareQualification;
  providerSourceUrls: string[];
};

export type SignalCareResearchDiagnostics = {
  rawCandidateCount: number;
  providerSourceCount: number;
  candidatesAccepted: number;
  candidatesRejectedLowConfidence: number;
  candidatesRejectedNoProviderSource: number;
  factsRejectedNoProviderSource: number;
};

export type SignalCareResearchDiscoveryResult = SignalCareResearchResult & {
  diagnostics?: SignalCareResearchDiagnostics;
};

export interface SignalCareResearchClient {
  discover(input: {
    objective: string;
    existingOrganizations: string[];
    existingDomains: string[];
    maxProspects: number;
  }): Promise<SignalCareResearchDiscoveryResult>;
  qualify?(input: {
    objective: string;
    organizationName: string;
    currentStatus: string;
    currentNextAction: string;
    existingEvidence: Record<string, unknown>;
  }): Promise<SignalCareQualificationResult>;
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
    suggestedEntryOffer: {
      type: "string",
      enum: signalCareApprovedOfferIds
    },
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

const factJsonSchema = {
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
} as const;

const qualificationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "organizationName",
    "likelyStakeholderRole",
    "verifiedPublicFacts",
    "verifiedFitEvidence",
    "hypothesis",
    "recommendedEntryOffer",
    "conversationAngle",
    "draftOutreachLanguage",
    "evidenceAgainstPursuit",
    "confidence",
    "recommendation",
    "sourceUrls",
    "qualificationSummary",
    "nextResearchStep"
  ],
  properties: {
    organizationName: { type: "string" },
    likelyStakeholderRole: { type: "string" },
    verifiedPublicFacts: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: factJsonSchema
    },
    verifiedFitEvidence: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: factJsonSchema
    },
    hypothesis: { type: "string" },
    recommendedEntryOffer: {
      type: "string",
      enum: signalCareApprovedOfferIds
    },
    conversationAngle: { type: ["string", "null"] },
    draftOutreachLanguage: { type: ["string", "null"] },
    evidenceAgainstPursuit: { type: "string" },
    confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
    recommendation: {
      type: "string",
      enum: ["ADVANCE", "NEED_MORE_RESEARCH", "PASS"]
    },
    sourceUrls: {
      type: "array",
      minItems: 1,
      maxItems: 15,
      items: { type: "string" }
    },
    qualificationSummary: { type: "string" },
    nextResearchStep: { type: ["string", "null"] }
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

const trackingQueryParameters = new Set([
  "_hsenc",
  "_hsmi",
  "dclid",
  "fbclid",
  "gad_campaignid",
  "gad_source",
  "gbraid",
  "gclid",
  "igshid",
  "li_fat_id",
  "mc_cid",
  "mc_eid",
  "msclkid",
  "oly_anon_id",
  "oly_enc_id",
  "rb_clickid",
  "srsltid",
  "ttclid",
  "twclid",
  "wbraid",
  "wickedid",
  "yclid"
]);

export function canonicalizeSignalCareSourceUrl(value: string) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("SignalCare provenance must use HTTP or HTTPS.");
  }
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  const query = Array.from(url.searchParams.entries())
    .filter(([key]) => {
      const normalizedKey = key.toLowerCase();
      return (
        !normalizedKey.startsWith("utm_") &&
        !trackingQueryParameters.has(normalizedKey)
      );
    })
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey === rightKey
        ? leftValue.localeCompare(rightValue)
        : leftKey.localeCompare(rightKey)
    );
  const search = new URLSearchParams(query).toString();
  const pathname = url.pathname.replace(/\/+$/, "");
  const port = url.port ? `:${url.port}` : "";
  url.hash = "";
  return `${hostname}${port}${pathname}${search ? `?${search}` : ""}`;
}

export function normalizeProspectDomain(value: string) {
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return new URL(withProtocol).hostname.toLowerCase().replace(/^www\./, "");
}

export type SignalCareProviderSource = {
  canonicalUrl: string;
  hostname: string;
  providerUrl: string;
};

function responseSourceUrls(response: Record<string, unknown>) {
  const urls = new Map<string, SignalCareProviderSource>();
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
          const providerUrl = record[key];
          const canonicalUrl = canonicalizeSignalCareSourceUrl(providerUrl);
          if (!urls.has(canonicalUrl)) {
            urls.set(canonicalUrl, {
              canonicalUrl,
              hostname: normalizeProspectDomain(providerUrl),
              providerUrl
            });
          }
        } catch {
          // Invalid provider provenance is ignored and can never validate a candidate.
        }
      }
    }
    Object.values(record).forEach(visit);
  };
  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output as Array<Record<string, unknown>>) {
    if (item.type === "web_search_call") {
      const action =
        item.action && typeof item.action === "object"
          ? (item.action as Record<string, unknown>)
          : {};
      visit(action.sources);
      visit(item.results);
    }
    if (item.type === "message") {
      const content = Array.isArray(item.content) ? item.content : [];
      for (const part of content as Array<Record<string, unknown>>) {
        visit(part.annotations);
      }
    }
  }
  return Array.from(urls.values());
}

function providerSourceIndex(provenance: SignalCareProviderSource[]) {
  return new Map(provenance.map((source) => [source.canonicalUrl, source]));
}

function matchProviderSource(
  value: string,
  provenance: Map<string, SignalCareProviderSource>
) {
  try {
    return provenance.get(canonicalizeSignalCareSourceUrl(value)) ?? null;
  } catch {
    return null;
  }
}

function uniqueProviderUrls(sources: SignalCareProviderSource[]) {
  return Array.from(new Set(sources.map((source) => source.providerUrl)));
}

export function retainCitedSignalCareEvidence(
  result: SignalCareResearchResult,
  providerSources: SignalCareProviderSource[]
) {
  const provenance = providerSourceIndex(providerSources);
  const diagnostics: SignalCareResearchDiagnostics = {
    rawCandidateCount: result.candidates.length,
    providerSourceCount: providerSources.length,
    candidatesAccepted: 0,
    candidatesRejectedLowConfidence: 0,
    candidatesRejectedNoProviderSource: 0,
    factsRejectedNoProviderSource: 0
  };
  const candidates = result.candidates.flatMap((candidate) => {
    const citedSources = uniqueProviderUrls(
      candidate.sourceUrls.flatMap((url) => {
        const match = matchProviderSource(url, provenance);
        return match ? [match] : [];
      })
    );
    const verifiedPublicFacts = candidate.verifiedPublicFacts.flatMap(
      (fact) => {
        const sourceUrls = uniqueProviderUrls(
          fact.sourceUrls.flatMap((url) => {
            const match = matchProviderSource(url, provenance);
            return match ? [match] : [];
          })
        );
        if (sourceUrls.length === 0) {
          diagnostics.factsRejectedNoProviderSource += 1;
        }
        return sourceUrls.length > 0 ? [{ ...fact, sourceUrls }] : [];
      }
    );
    if (candidate.evidenceConfidence === "LOW") {
      diagnostics.candidatesRejectedLowConfidence += 1;
      return [];
    }
    let officialWebsiteVerified = false;
    try {
      const officialHostname = normalizeProspectDomain(
        candidate.officialWebsite
      );
      officialWebsiteVerified = providerSources.some(
        (source) => source.hostname === officialHostname
      );
    } catch {
      officialWebsiteVerified = false;
    }
    if (
      !officialWebsiteVerified ||
      citedSources.length === 0 ||
      verifiedPublicFacts.length === 0
    ) {
      diagnostics.candidatesRejectedNoProviderSource += 1;
      return [];
    }
    diagnostics.candidatesAccepted += 1;
    return [{ ...candidate, sourceUrls: citedSources, verifiedPublicFacts }];
  });
  return {
    ...signalCareResearchResultSchema.parse({
      candidates,
      searchSummary: result.searchSummary
    }),
    diagnostics
  };
}

function retainCitedFacts(
  facts: Array<{ fact: string; sourceUrls: string[] }>,
  provenance: Map<string, SignalCareProviderSource>
) {
  return facts.flatMap((fact) => {
    const sourceUrls = uniqueProviderUrls(
      fact.sourceUrls.flatMap((url) => {
        const match = matchProviderSource(url, provenance);
        return match ? [match] : [];
      })
    );
    return sourceUrls.length > 0 ? [{ ...fact, sourceUrls }] : [];
  });
}

export function retainCitedSignalCareQualification(
  result: SignalCareQualification,
  providerSources: SignalCareProviderSource[]
) {
  const provenance = providerSourceIndex(providerSources);
  const sourceUrls = uniqueProviderUrls(
    result.sourceUrls.flatMap((url) => {
      const match = matchProviderSource(url, provenance);
      return match ? [match] : [];
    })
  );
  const verifiedPublicFacts = retainCitedFacts(
    result.verifiedPublicFacts,
    provenance
  );
  const verifiedFitEvidence = retainCitedFacts(
    result.verifiedFitEvidence,
    provenance
  );
  if (
    sourceUrls.length === 0 ||
    verifiedPublicFacts.length === 0 ||
    verifiedFitEvidence.length === 0
  ) {
    throw new Error(
      `SignalCare qualification returned inadequate provider provenance. providerSourceCount=${providerSources.length}, verifiedFactsAccepted=${verifiedPublicFacts.length}, fitEvidenceAccepted=${verifiedFitEvidence.length}.`
    );
  }
  return signalCareQualificationSchema.parse({
    ...result,
    sourceUrls,
    verifiedPublicFacts,
    verifiedFitEvidence
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
        include: ["web_search_call.action.sources", "web_search_call.results"],
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: `Find a small evidence-backed SignalCare prospect shortlist using public web sources only. Return only MEDIUM or HIGH-confidence candidates, and do not include a candidate merely to reach the requested count. Every verified fact must be grounded in public web-search evidence, and each source URL must identify the actual page used for that fact. Prefer official organization, locations, providers, careers, and credible business pages. Clearly separate VERIFIED FACTS from HYPOTHESES. Never claim revenue leakage or operational problems without public evidence. Do not contact anyone, submit forms, change pricing, make commitments, or propose more candidates than requested. Exclude organizations already supplied. Prefer plausible customers rather than speculative partners. ${signalCareCommercialProfileInstructions()} Return operational evidence only.`
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
    let parsed: SignalCareResearchResult;
    try {
      parsed = signalCareResearchResultSchema.parse(
        JSON.parse(responseText(raw))
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `SignalCare research model-output validation failed: ${detail}`
      );
    }
    return retainCitedSignalCareEvidence(parsed, responseSourceUrls(raw));
  }

  async qualify(input: {
    objective: string;
    organizationName: string;
    currentStatus: string;
    currentNextAction: string;
    existingEvidence: Record<string, unknown>;
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
        include: ["web_search_call.action.sources", "web_search_call.results"],
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: `Qualify exactly one existing SignalCare prospect using public web evidence only. Read the supplied existing public evidence first, then resolve the highest-value gaps: organization size and footprint, services and operational complexity, public growth signals, likely stakeholder ROLE (never private personal information), public scheduling/reporting/operations signals, best-fit approved SignalCare offer, precise conversation hypothesis, reasons to pursue, and evidence against pursuing. Clearly separate VERIFIED FACTS from HYPOTHESES. Every verified and fit fact must cite the actual public page used. Prefer official organization pages. Internal draft outreach language is allowed, but do not send messages, contact anyone, submit forms, modify external systems, make commitments, or claim revenue leakage or operational problems without evidence. ${signalCareCommercialProfileInstructions()} Treat a technology vendor or speculative partnership as PASS unless public evidence shows the organization plausibly needs and could buy an approved service. Choose ADVANCE only when the evidence supports an outreach-ready internal package; otherwise choose NEED_MORE_RESEARCH or PASS.`
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
            name: "signalcare_prospect_qualification",
            strict: true,
            schema: qualificationJsonSchema
          }
        }
      })
    });
    if (!response.ok) {
      throw new Error(
        `SignalCare qualification request failed (${response.status}): ${(await response.text()).slice(0, 1000)}`
      );
    }
    const raw = (await response.json()) as Record<string, unknown>;
    let parsed: SignalCareQualification;
    try {
      parsed = signalCareQualificationSchema.parse(
        JSON.parse(responseText(raw))
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `SignalCare qualification model-output validation failed: ${detail}`
      );
    }
    if (
      parsed.organizationName.trim().toLowerCase() !==
      input.organizationName.trim().toLowerCase()
    ) {
      throw new Error(
        "SignalCare qualification returned a different organization than the bounded target."
      );
    }
    const providerSources = responseSourceUrls(raw);
    return {
      qualification: retainCitedSignalCareQualification(parsed, providerSources),
      providerSourceUrls: uniqueProviderUrls(providerSources)
    };
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

function isSignalCareProspectShortlistDescription(
  work: Pick<AgentWorkItem, "title" | "objective">
) {
  const description = `${work.title} ${work.objective}`.toLowerCase();
  return (
    work.title.trim().toLowerCase() ===
      "build an evidence-backed qualified prospect shortlist for signalcare" ||
    (description.includes("evidence-backed") &&
      description.includes("prospect") &&
      description.includes("shortlist"))
  );
}

export function isLegacySignalCareProspectResearch(
  work: LegacyResearchWork,
  profile: string | null | undefined
) {
  if (profile !== "SIGNALCARE_GM") return false;
  if (!["QUEUED", "RETRY"].includes(work.state)) return false;
  if (work.requiredCapability === SIGNALCARE_WEB_RESEARCH_CAPABILITY)
    return false;
  return isSignalCareProspectShortlistDescription(work);
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

const priorProvenanceValidationFailure =
  "Hosted research returned no candidates with adequate cited evidence";
const provenanceRecoveryVersion = "canonical-provenance-v2";

function isPriorProvenanceValidationFailure(blocker: string | null) {
  return blocker
    ?.toLowerCase()
    .includes(priorProvenanceValidationFailure.toLowerCase());
}

function emptyResearchDiagnostics(): SignalCareResearchDiagnostics {
  return {
    rawCandidateCount: 0,
    providerSourceCount: 0,
    candidatesAccepted: 0,
    candidatesRejectedLowConfidence: 0,
    candidatesRejectedNoProviderSource: 0,
    factsRejectedNoProviderSource: 0
  };
}

function researchDiagnosticsSummary(
  diagnostics: SignalCareResearchDiagnostics
) {
  return Object.entries(diagnostics)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}

export async function recoverFailedSignalCareProspectResearch(
  config: Pick<AgentProjectConfig, "userId" | "projectId" | "profile">,
  db: PrismaClient = prisma
) {
  if (config.profile !== "SIGNALCARE_GM") return [];

  const [existingQueue, persistedResearchCount, activeResearch] =
    await Promise.all([
      db.queueItem.findMany({
        where: {
          userId: config.userId,
          lane: { in: ["signalcare", "pipeline"] },
          status: { notIn: ["done", "killed"] }
        },
        select: { status: true, nextAction: true }
      }),
      db.pipelineAction.count({
        where: { userId: config.userId, type: "prospect_research" }
      }),
      db.agentWorkItem.findFirst({
        where: {
          userId: config.userId,
          projectId: config.projectId,
          requiredCapability: SIGNALCARE_WEB_RESEARCH_CAPABILITY,
          state: {
            in: [
              "QUEUED",
              "PLANNING",
              "RUNNING",
              "VERIFYING",
              "RETRY",
              "AWAITING_EXECUTION"
            ]
          }
        }
      })
    ]);
  if (
    activeResearch ||
    persistedResearchCount > 0 ||
    existingQueue.some(isUsefulExistingProspect)
  ) {
    return [];
  }

  const failedItems = await db.agentWorkItem.findMany({
    where: {
      userId: config.userId,
      projectId: config.projectId,
      requiredCapability: SIGNALCARE_WEB_RESEARCH_CAPABILITY,
      state: "FAILED"
    },
    orderBy: { completedAt: "desc" }
  });
  const failed = failedItems.find(
    (item) =>
      isPriorProvenanceValidationFailure(item.blocker) &&
      isSignalCareProspectShortlistDescription(item)
  );
  if (!failed) return [];

  const idempotencyKey = `${provenanceRecoveryVersion}:${failed.id}`;
  const existingRecovery = await db.agentWorkItem.findUnique({
    where: {
      projectId_idempotencyKey: {
        projectId: config.projectId,
        idempotencyKey
      }
    }
  });
  if (existingRecovery) return [];

  const replacement = await db.agentWorkItem.create({
    data: {
      userId: failed.userId,
      projectId: failed.projectId,
      parentWorkItemId: failed.id,
      idempotencyKey,
      title: failed.title,
      objective: failed.objective,
      expectedValue: failed.expectedValue,
      acceptanceCriteria: failed.acceptanceCriteria,
      agentRole: failed.agentRole,
      actionCategory: failed.actionCategory,
      requiredCapability: failed.requiredCapability,
      sandboxPolicy: failed.sandboxPolicy,
      networkPolicy: failed.networkPolicy,
      operationalContext: failed.operationalContext,
      priority: failed.priority,
      maxAttempts: 1,
      workspaceIdentifier: null,
      repositoryIdentifier: failed.repositoryIdentifier,
      blocker: null,
      nextEligibleRunAt: null
    }
  });
  await recordAgentEvent(
    {
      userId: config.userId,
      projectId: config.projectId,
      workItemId: replacement.id,
      idempotencyKey: `signalcare-research-recovered:${failed.id}:${provenanceRecoveryVersion}`,
      type: "RETRY_CREATED",
      summary:
        "Created one bounded replacement attempt for the prior SignalCare provenance-validation failure.",
      metadata: {
        supersedesFailedWorkItemId: failed.id,
        recoveryVersion: provenanceRecoveryVersion,
        maximumNewAttempts: 1
      }
    },
    db
  );
  return [replacement.id];
}

const qualificationReviewRecoveryVersion = "signalcare-qualification-review-v1";
const unsafeLegacyOutreachTargets: Record<string, string> = {
  cmtevqx9y0011qk0pf8pk56sz: "Caption Care"
};

export async function recoverPrematureSignalCareOutreachDecisions(
  userId: string,
  db: PrismaClient = prisma,
  now = new Date()
) {
  const configs = await db.agentProjectConfig.findMany({
    where: { userId, profile: "SIGNALCARE_GM" }
  });
  const projectIds = configs.map((config) => config.projectId);
  if (projectIds.length === 0) return [];
  const pending = await db.agentDecision.findMany({
    where: {
      userId,
      projectId: { in: projectIds },
      category: "SEND_EMAIL_OR_MESSAGE",
      status: "PENDING"
    },
    include: { actionRequest: true, originatingWorkItem: true }
  });
  const cancelled: string[] = [];
  for (const decision of pending) {
    const target =
      parseSignalCareDecisionTarget(decision.actionRequest?.boundedPayload) ??
      (unsafeLegacyOutreachTargets[decision.id]
        ? {
            type: "SIGNALCARE_PROSPECT" as const,
            name: unsafeLegacyOutreachTargets[decision.id]
          }
        : null);
    const readiness = target
      ? await evaluateSignalCareOutreachReadiness(
          userId,
          decision.projectId,
          target,
          db
        )
      : null;
    if (readiness?.ready) continue;
    const reasons = readiness?.reasons ?? [
      "Legacy SignalCare outreach decision has no typed target prospect."
    ];
    const updated = await db.$transaction(async (tx) => {
      const claimed = await tx.agentDecision.updateMany({
        where: { id: decision.id, userId, status: "PENDING" },
        data: {
          status: "CANCELLED",
          resultingAction:
            "Premature outreach escalation cancelled; no authorization or external execution occurred.",
          resolvedAt: now
        }
      });
      if (claimed.count !== 1) return false;
      if (decision.actionRequest) {
        await tx.agentActionRequest.updateMany({
          where: { id: decision.actionRequest.id, userId },
          data: {
            state: "CANCELLED",
            cancelledAt: now,
            failure:
              "Cancelled because deterministic SignalCare outreach-readiness requirements were not met."
          }
        });
      }
      if (decision.originatingWorkItem?.state === "NEEDS_RYAN") {
        await tx.agentWorkItem.updateMany({
          where: {
            id: decision.originatingWorkItem.id,
            userId,
            state: "NEEDS_RYAN"
          },
          data: {
            state: "PARKED",
            blocker:
              "Premature SignalCare outreach escalation cancelled for requalification.",
            completedAt: now
          }
        });
      }
      if (target && readiness?.queueStatus !== "passed") {
        const queueItems = await tx.queueItem.findMany({
          where: { userId, lane: { in: ["signalcare", "pipeline"] } }
        });
        const queueItem = queueItems.find(
          (item) =>
            item.recipient.trim().toLowerCase() ===
            target.name.trim().toLowerCase()
        );
        if (queueItem) {
          await tx.queueItem.update({
            where: { id: queueItem.id },
            data: {
              status: "queued",
              nextAction:
                "Requalify against canonical SignalCare commercial profile before outreach.",
              resolvedAt: null
            }
          });
        }
      }
      await tx.agentProjectConfig.update({
        where: { projectId: decision.projectId },
        data: { nextAgentReviewAt: now }
      });
      await tx.agentEvent.upsert({
        where: {
          idempotencyKey: `premature-outreach-cancelled:${decision.id}`
        },
        update: {},
        create: {
          userId,
          projectId: decision.projectId,
          workItemId: decision.originatingWorkItemId,
          decisionId: decision.id,
          idempotencyKey: `premature-outreach-cancelled:${decision.id}`,
          type: "PREMATURE_OWNER_ESCALATION_CANCELLED",
          summary:
            "Premature SignalCare outreach escalation cancelled; the prospect must be requalified against the canonical commercial profile.",
          metadata: JSON.stringify({
            targetProspect: target?.name ?? null,
            reasons,
            externalOutreachPerformed: false,
            authorizationRecorded: false
          })
        }
      });
      return true;
    });
    if (updated) cancelled.push(decision.id);
  }
  return cancelled;
}

export async function scheduleSignalCareQualificationReviewOnce(
  userId: string,
  db: PrismaClient = prisma,
  now = new Date()
) {
  const configs = await db.agentProjectConfig.findMany({
    where: {
      userId,
      profile: "SIGNALCARE_GM",
      enabled: true,
      pausedAt: null
    }
  });
  const scheduled: string[] = [];
  for (const config of configs) {
    const idempotencyKey = `${qualificationReviewRecoveryVersion}:${config.projectId}`;
    const [priorSchedule, prospectCount, qualificationCount, activeResearch] =
      await Promise.all([
        db.agentEvent.findUnique({ where: { idempotencyKey } }),
        db.queueItem.count({
          where: {
            userId,
            lane: { in: ["signalcare", "pipeline"] },
            status: { notIn: ["done", "killed", "passed"] }
          }
        }),
        db.pipelineAction.count({
          where: { userId, type: "prospect_qualification" }
        }),
        db.agentWorkItem.count({
          where: {
            userId,
            projectId: config.projectId,
            requiredCapability: SIGNALCARE_WEB_RESEARCH_CAPABILITY,
            state: {
              in: [
                "QUEUED",
                "PLANNING",
                "RUNNING",
                "VERIFYING",
                "RETRY",
                "AWAITING_EXECUTION"
              ]
            }
          }
        })
      ]);
    if (
      priorSchedule ||
      prospectCount === 0 ||
      qualificationCount > 0 ||
      activeResearch > 0
    ) {
      continue;
    }
    await db.agentProjectConfig.update({
      where: { id: config.id },
      data: { nextAgentReviewAt: now }
    });
    await recordAgentEvent(
      {
        userId,
        projectId: config.projectId,
        idempotencyKey,
        type: "PM_REVIEW_SCHEDULED",
        summary:
          "SignalCare was made due once to evaluate existing prospects for bounded qualification.",
        metadata: {
          recoveryVersion: qualificationReviewRecoveryVersion,
          prospectCount
        }
      },
      db
    );
    scheduled.push(config.projectId);
  }
  return scheduled;
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

function parseOperationalEvidence(note: string | null) {
  if (!note) return {};
  try {
    const parsed = JSON.parse(note) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function qualificationPipelineState(
  qualification: SignalCareQualification,
  providerSourceUrls: string[]
) {
  if (qualification.recommendation === "PASS") return "passed" as const;
  if (
    qualification.recommendation === "ADVANCE" &&
    qualification.confidence !== "LOW" &&
    qualification.conversationAngle &&
    qualification.draftOutreachLanguage &&
    qualification.verifiedFitEvidence.length > 0 &&
    qualification.sourceUrls.length > 0 &&
    providerSourceUrls.length > 0
  ) {
    return "outreach_ready" as const;
  }
  return "qualified" as const;
}

async function persistQualification(
  input: {
    userId: string;
    workItemId: string;
    queueItemId: string;
    qualification: SignalCareQualification;
    providerSourceUrls: string[];
  },
  db: PrismaClient,
  now: Date
) {
  const status = qualificationPipelineState(
    input.qualification,
    input.providerSourceUrls
  );
  const nextAction =
    status === "outreach_ready"
      ? "Request Ryan approval for this exact evidence-backed outreach package."
      : status === "passed"
        ? `Pass — ${input.qualification.qualificationSummary}`
        : (input.qualification.nextResearchStep ??
          "Resolve the remaining evidence gap before outreach approval.");
  await db.queueItem.update({
    where: { id: input.queueItemId },
    data: {
      status,
      nextAction,
      resolvedAt: status === "passed" ? now : null
    }
  });

  const priorQualification = await db.pipelineAction.findFirst({
    where: {
      userId: input.userId,
      type: "prospect_qualification",
      withWhom: input.qualification.organizationName
    },
    orderBy: { date: "desc" }
  });
  const priorEvidence = parseOperationalEvidence(
    priorQualification?.note ?? null
  );
  if (priorEvidence.workItemId !== input.workItemId) {
    await db.pipelineAction.create({
      data: {
        userId: input.userId,
        date: now,
        type: "prospect_qualification",
        withWhom: input.qualification.organizationName,
        note: JSON.stringify({
          kind: "signalcare_prospect_qualification_v1",
          workItemId: input.workItemId,
          pipelineStatus: status,
          ...input.qualification,
          verifiedFacts: input.qualification.verifiedPublicFacts,
          evidenceConfidence: input.qualification.confidence,
          providerBackedPublicSources: true,
          providerSourceUrls: input.providerSourceUrls,
          externalOutreachPerformed: false
        })
      }
    });
  }
  return { status, nextAction };
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
  const researchContext = parseSignalCareResearchContext(
    work.operationalContext
  );

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
        researchContext.researchMode === "QUALIFY_EXISTING_PROSPECT"
          ? `SignalCare qualification for ${researchContext.targetProspect} dispatched to bounded hosted public-web research.`
          : "SignalCare prospect discovery dispatched to the bounded hosted web-research executor."
    },
    db
  );

  let researchDiagnostics = emptyResearchDiagnostics();
  let failureStage = "provider_request";
  try {
    const existingQueue = await db.queueItem.findMany({
      where: {
        userId: input.userId,
        lane: { in: ["signalcare", "pipeline"] },
        status: { notIn: ["done", "killed", "passed"] }
      }
    });
    const existingActions = await db.pipelineAction.findMany({
      where: { userId: input.userId },
      orderBy: { date: "desc" }
    });
    if (researchContext.researchMode === "QUALIFY_EXISTING_PROSPECT") {
      const target = existingQueue.find(
        (item) =>
          item.recipient.trim().toLowerCase() ===
          researchContext.targetProspect.trim().toLowerCase()
      );
      if (!target) {
        throw new Error(
          "SignalCare qualification target is not an existing active prospect."
        );
      }
      if (!client.qualify) {
        throw new Error(
          "SignalCare research client does not support bounded qualification."
        );
      }
      const existingEvidenceAction = existingActions.find(
        (action) =>
          action.withWhom?.trim().toLowerCase() ===
          target.recipient.trim().toLowerCase()
      );
      const qualificationResult = await client.qualify({
          objective: input.objective,
          organizationName: target.recipient,
          currentStatus: target.status,
          currentNextAction: target.nextAction,
          existingEvidence: parseOperationalEvidence(
            existingEvidenceAction?.note ?? null
          )
        });
      const providerSourceUrls = z
        .array(sourceUrlSchema)
        .min(1)
        .parse(qualificationResult.providerSourceUrls);
      const qualification = retainCitedSignalCareQualification(
        signalCareQualificationSchema.parse(qualificationResult.qualification),
        providerSourceUrls.map((url) => ({
          canonicalUrl: canonicalizeSignalCareSourceUrl(url),
          hostname: normalizeProspectDomain(url),
          providerUrl: url
        }))
      );
      if (
        qualification.organizationName.trim().toLowerCase() !==
        target.recipient.trim().toLowerCase()
      ) {
        throw new Error(
          "SignalCare qualification returned a different organization than the existing target."
        );
      }
      failureStage = "qualification_persistence";
      const progression = await persistQualification(
        {
          userId: input.userId,
          workItemId: work.id,
          queueItemId: target.id,
          qualification,
          providerSourceUrls
        },
        db,
        now
      );
      await db.agentRun.update({
        where: { id: run.id },
        data: {
          status: "SUCCEEDED",
          operationalResultSummary: qualification.qualificationSummary,
          evidence: JSON.stringify({
            organizationName: qualification.organizationName,
            pipelineStatus: progression.status,
            verifiedPublicFacts: qualification.verifiedPublicFacts,
            verifiedFitEvidence: qualification.verifiedFitEvidence,
            sourceUrls: qualification.sourceUrls,
            providerSourceUrls,
            providerBackedPublicSources: true,
            externalOutreachPerformed: false
          }),
          structuredOutcome: JSON.stringify({
            researchMode: researchContext.researchMode,
            pipelineStatus: progression.status,
            qualification,
            providerSourceUrls,
            providerBackedPublicSources: true,
            externalOutreachPerformed: false
          }),
          completedAt: now
        }
      });
      work = await transitionAgentWorkItem(
        input.userId,
        work.id,
        "VERIFYING",
        {
          resultSummary: qualification.qualificationSummary,
          evidenceSummary: `${qualification.sourceUrls.length} provider source(s) support the qualification package.`
        },
        db
      );
      const qaRun = await db.agentRun.upsert({
        where: {
          idempotencyKey: `signalcare-research-qa:${work.id}:${attempt}`
        },
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
          evidence: `${qualification.verifiedPublicFacts.length} verified fact(s), ${qualification.verifiedFitEvidence.length} fit fact(s), and ${qualification.sourceUrls.length} provider source(s) passed bounded qualification checks.`,
          structuredOutcome: JSON.stringify({
            outcome: "PASS",
            pipelineStatus: progression.status,
            externalOutreachPerformed: false
          }),
          completedAt: now
        }
      });
      await transitionAgentWorkItem(
        input.userId,
        work.id,
        "DONE",
        {
          blocker: null,
          resultSummary: qualification.qualificationSummary,
          evidenceSummary: `Existing prospect updated to ${progression.status}; no external outreach occurred.`
        },
        db
      );
      await recordAgentEvent(
        {
          userId: input.userId,
          projectId: input.projectId,
          workItemId: work.id,
          runId: qaRun.id,
          idempotencyKey: `signalcare-qualification-completed:${work.id}:${attempt}`,
          type: "QA_PASSED",
          summary: `${qualification.organizationName} qualification completed with pipeline status ${progression.status}.`,
          metadata: {
            movementKind:
              progression.status === "outreach_ready"
                ? "SIGNALCARE_OUTREACH_PACKAGE_READY"
                : progression.status === "passed"
                  ? "SIGNALCARE_PROSPECT_PASSED"
                  : "SIGNALCARE_PROSPECT_QUALIFIED",
            targetProspect: qualification.organizationName,
            pipelineStatus: progression.status,
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
        created: [],
        qualifiedProspect: qualification.organizationName,
        pipelineStatus: progression.status,
        skippedBecauseProspectsExist: false
      };
    }
    const existingDomains = existingActions.flatMap((action) => {
      if (action.type !== "prospect_research") return [];
      const domain = parseEvidenceDomain(action.note);
      return domain ? [domain] : [];
    });
    const maxProspects = getSignalCareResearchLimit();
    const sufficientExistingProspects = existingQueue;
    const discovery: SignalCareResearchDiscoveryResult =
      sufficientExistingProspects.length > 0
        ? {
            candidates: [],
            searchSummary: `${sufficientExistingProspects.length} SignalCare prospect(s) already exist; repeated discovery was skipped.`
          }
        : await client.discover({
            objective: input.objective,
            existingOrganizations: existingQueue.map((item) => item.recipient),
            existingDomains,
            maxProspects
          });
    failureStage = "result_validation";
    const { diagnostics: providerDiagnostics, ...research } = discovery;
    const validated = signalCareResearchResultSchema.parse(research);
    const boundedCandidates = validated.candidates
      .filter((candidate) => candidate.evidenceConfidence !== "LOW")
      .slice(0, maxProspects);
    researchDiagnostics = providerDiagnostics ?? {
      rawCandidateCount: validated.candidates.length,
      providerSourceCount: 0,
      candidatesAccepted: boundedCandidates.length,
      candidatesRejectedLowConfidence: validated.candidates.filter(
        (candidate) => candidate.evidenceConfidence === "LOW"
      ).length,
      candidatesRejectedNoProviderSource: 0,
      factsRejectedNoProviderSource: 0
    };
    if (
      sufficientExistingProspects.length === 0 &&
      boundedCandidates.length === 0
    ) {
      failureStage = "evidence_validation";
      throw new Error(
        `${priorProvenanceValidationFailure}. ${researchDiagnosticsSummary(researchDiagnostics)}.`
      );
    }
    failureStage = "candidate_persistence";
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
          sufficientExistingProspects.length > 0
            ? validated.searchSummary
            : `Created ${created.length} evidence-backed SignalCare prospect(s).`,
        evidence: JSON.stringify({
          created,
          candidateCount: boundedCandidates.length,
          summary: validated.searchSummary,
          validationDiagnostics: researchDiagnostics
        }),
        structuredOutcome: JSON.stringify({
          ...validated,
          created,
          validationDiagnostics: researchDiagnostics
        }),
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
          sufficientExistingProspects.length > 0
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
          sufficientExistingProspects.length > 0
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
      skippedBecauseProspectsExist: sufficientExistingProspects.length > 0
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.startsWith("SignalCare research model-output validation failed")
    ) {
      failureStage = "model_output_validation";
    }
    await db.agentRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        error: message,
        evidence: JSON.stringify({
          failureStage,
          validationDiagnostics: researchDiagnostics
        }),
        structuredOutcome: JSON.stringify({
          outcome: "FAILED",
          failureStage,
          validationDiagnostics: researchDiagnostics
        }),
        completedAt: now
      }
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
