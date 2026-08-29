import { execFileSync } from "node:child_process";
import { closeSync, existsSync, openSync, rmSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";
import { SIGNALCARE_WEB_RESEARCH_CAPABILITY } from "@/lib/agent-capabilities";
import { markAgentWorkIntegrated } from "@/server/agent/integration-service";
import {
  ModelProjectManagerAgent,
  pmOutputSchema,
  type StructuredModelClient
} from "@/server/agent/model-agents";
import type { OrchestrationServices } from "@/server/agent/orchestration-service";
import { runAgentOrchestrationCycle } from "@/server/agent/orchestration-service";
import { executeProjectTool } from "@/server/agent/project-tools";
import { claimRunnerWork } from "@/server/agent/runner-service";
import {
  createOwnerDecision,
  resolveOwnerDecision
} from "@/server/agent/work-service";
import {
  canonicalizeSignalCareSourceUrl,
  executeSignalCareHostedResearch,
  getSignalCareResearchLimit,
  normalizeProspectDomain,
  OpenAiSignalCareResearchClient,
  recoverPrematureSignalCareOutreachDecisions,
  recoverFailedSignalCareProspectResearch,
  reclassifySignalCareProspectResearch,
  retainCitedSignalCareQualification,
  retainCitedSignalCareEvidence,
  scheduleSignalCareQualificationReviewOnce,
  serializeSignalCareResearchContext,
  signalCareQualificationSchema,
  signalCareResearchCandidateSchema,
  type SignalCareQualification,
  type SignalCareResearchCandidate,
  type SignalCareResearchClient,
  type SignalCareProviderSource
} from "@/server/agent/signalcare-research-service";

const databasePath = path.join(
  process.cwd(),
  `.signalcare-research-${process.pid}.db`
);
const databaseUrl = `file:${databasePath.replaceAll("\\", "/")}`;
let db: PrismaClient;
let userId: string;
let signalProjectId: string;
let cchcsProjectId: string;

const environmentKeys = [
  "FEATURE_AGENT_MODELS",
  "FEATURE_SIGNALCARE_WEB_RESEARCH",
  "FEATURE_RUNNER_EXECUTION",
  "AGENT_SIGNALCARE_RESEARCH_MAX_PROSPECTS",
  "AGENT_MAX_MODEL_INVOCATIONS_PER_CYCLE",
  "AGENT_MAX_MODEL_RUNS_PER_PROJECT_DAY",
  "OPENAI_API_KEY"
] as const;
const originalEnvironment = Object.fromEntries(
  environmentKeys.map((key) => [key, process.env[key]])
);

function candidate(
  index: number,
  overrides: Partial<SignalCareResearchCandidate> = {}
): SignalCareResearchCandidate {
  const domain = `example-dental-${index}.com`;
  const source = `https://${domain}/locations`;
  return {
    organizationName: `Example Dental Group ${index}`,
    officialWebsite: `https://${domain}`,
    domain,
    organizationType: "Multi-location dental organization",
    locationCount: index + 2,
    geography: "United States",
    verifiedPublicFacts: [
      {
        fact: `The official locations page lists ${index + 2} locations.`,
        sourceUrls: [source]
      }
    ],
    signalCareFit:
      "Multiple public locations suggest operational coordination worth qualifying.",
    hypothesis:
      "Centralized reporting may be useful, but no operational problem is asserted.",
    suggestedEntryOffer: "DENTAL_REVENUE_LEAKAGE_DIAGNOSTIC",
    evidenceConfidence: "HIGH",
    sourceUrls: [source],
    recommendedNextAction:
      "Verify the operating contact and prepare an outreach package.",
    ...overrides
  };
}

function fakeResearchClient(
  candidates: SignalCareResearchCandidate[],
  discover = vi.fn()
): SignalCareResearchClient & { discover: ReturnType<typeof vi.fn> } {
  discover.mockResolvedValue({
    candidates,
    searchSummary: "Bounded public research completed with official sources."
  });
  return { discover };
}

function qualification(
  organizationName: string,
  overrides: Partial<SignalCareQualification> = {}
): SignalCareQualification {
  const source = "https://existing-dental.example/locations";
  return {
    organizationName,
    likelyStakeholderRole: "Operations leader",
    verifiedPublicFacts: [
      { fact: "The official site lists four locations.", sourceUrls: [source] }
    ],
    verifiedFitEvidence: [
      {
        fact: "The official services page lists multi-site scheduling services.",
        sourceUrls: [source]
      }
    ],
    hypothesis:
      "Cross-location reporting may be a useful conversation topic; no current problem is asserted.",
    recommendedEntryOffer: "DENTAL_REVENUE_LEAKAGE_DIAGNOSTIC",
    conversationAngle: "Compare scheduling visibility across locations.",
    draftOutreachLanguage:
      "Would a short conversation about multi-location scheduling visibility be useful?",
    evidenceAgainstPursuit: "No public evidence confirms an urgent problem.",
    confidence: "HIGH",
    recommendation: "ADVANCE",
    sourceUrls: [source],
    qualificationSummary:
      "Public evidence supports an internal outreach-ready package.",
    nextResearchStep: null,
    ...overrides
  };
}

function modelOutput(
  overrides: Record<string, unknown> = {}
) {
  return {
    disposition: "WAIT",
    currentBottleneck: "No valuable action is currently available.",
    evidence: "The bounded project snapshot contains no actionable gap.",
    title: "Wait for useful evidence",
    objective: "Avoid make-work.",
    expectedValue: "Preserve portfolio attention.",
    acceptanceCriteria: "No duplicate work is created.",
    agentRole: "SIGNALCARE_GM",
    actionCategory: "RESEARCH_READ_ONLY",
    priority: "MEDIUM",
    maxAttempts: 1,
    requiredCapability: "REPOSITORY_READ",
    sandboxPolicy: "READ_ONLY",
    networkPolicy: "OFF",
    operationalContext: "Wait for a material change.",
    researchMode: null,
    targetProspect: null,
    nextReviewMinutes: 90,
    ownerNeeded: false,
    ownerDecision: null,
    ...overrides
  };
}

function modelClient(output: Record<string, unknown>): StructuredModelClient {
  return {
    async generate<T>(input: { validator: { parse(value: unknown): T } }) {
      return input.validator.parse(output);
    }
  } as StructuredModelClient;
}

async function createReadyProspect(name = "Existing Dental") {
  const packageData = qualification(name);
  const queueItem = await db.queueItem.create({
    data: {
      userId,
      title: `${name} outreach package`,
      lane: "signalcare",
      recipient: name,
      status: "outreach_ready",
      nextAction: "Request Ryan approval for exact outreach package."
    }
  });
  const action = await db.pipelineAction.create({
    data: {
      userId,
      date: new Date(),
      type: "prospect_qualification",
      withWhom: name,
      note: JSON.stringify({
        kind: "signalcare_prospect_qualification_v1",
        pipelineStatus: "outreach_ready",
        ...packageData,
        verifiedFacts: packageData.verifiedPublicFacts,
        evidenceConfidence: packageData.confidence,
        providerBackedPublicSources: true,
        providerSourceUrls: packageData.sourceUrls,
        externalOutreachPerformed: false
      })
    }
  });
  return { queueItem, action, packageData };
}

function providerSource(url: string): SignalCareProviderSource {
  return {
    canonicalUrl: canonicalizeSignalCareSourceUrl(url),
    hostname: normalizeProspectDomain(url),
    providerUrl: url
  };
}

function waitingServices(
  researchClient: SignalCareResearchClient = fakeResearchClient([candidate(1)])
) {
  const chooseNextWork = vi.fn(async () => ({
    disposition: "WAIT" as const,
    title: "Wait instead of inventing work",
    objective: "Do not create make-work.",
    expectedValue: "Preserve focus.",
    acceptanceCriteria: "No new work is created.",
    agentRole: "SIGNALCARE_GM",
    actionCategory: "RESEARCH_READ_ONLY" as const,
    priority: "MEDIUM" as const,
    maxAttempts: 1,
    plannedBottleneck: "No valuable new action exists.",
    requiredCapability: "REPOSITORY_READ",
    sandboxPolicy: "READ_ONLY" as const,
    networkPolicy: "OFF" as const
  }));
  const services: OrchestrationServices = {
    projectManager: { chooseNextWork },
    worker: {
      async execute() {
        throw new Error(
          "Persisted LIVE_INTERNAL work must not use the mock worker."
        );
      }
    },
    verifier: {
      async verify() {
        throw new Error("Persisted LIVE_INTERNAL work must not use mock QA.");
      }
    },
    signalCareResearchClient: researchClient
  };
  return { services, chooseNextWork };
}

function modelServices(
  plan: Awaited<ReturnType<OrchestrationServices["projectManager"]["chooseNextWork"]>>,
  researchClient: SignalCareResearchClient = fakeResearchClient([candidate(1)])
) {
  const chooseNextWork = vi.fn(async () => plan);
  const services: OrchestrationServices = {
    projectManager: { adapterKind: "MODEL", chooseNextWork },
    worker: {
      async execute() {
        throw new Error("Model PM test work must remain bounded.");
      }
    },
    verifier: {
      async verify() {
        throw new Error("Model PM test work must remain bounded.");
      }
    },
    signalCareResearchClient: researchClient
  };
  return { services, chooseNextWork };
}

async function createWork(
  key: string,
  projectId = signalProjectId,
  data: Partial<{
    title: string;
    objective: string;
    requiredCapability: string;
    workspaceIdentifier: string | null;
    operationalContext: string;
  }> = {}
) {
  return db.agentWorkItem.create({
    data: {
      userId,
      projectId,
      idempotencyKey: key,
      title:
        data.title ??
        "Build an evidence-backed qualified prospect shortlist for SignalCare",
      objective:
        data.objective ??
        "Discover qualified SignalCare prospects using verified public evidence.",
      expectedValue: "Create a credible path to customer conversations.",
      acceptanceCriteria:
        "At most five deduplicated candidates have verified facts and source URLs.",
      agentRole: "SIGNALCARE_RESEARCHER",
      actionCategory: "RESEARCH_READ_ONLY",
      requiredCapability:
        data.requiredCapability ?? SIGNALCARE_WEB_RESEARCH_CAPABILITY,
      sandboxPolicy: "READ_ONLY",
      networkPolicy: "ALLOWLIST",
      workspaceIdentifier:
        data.workspaceIdentifier === undefined
          ? null
          : data.workspaceIdentifier,
      operationalContext: data.operationalContext,
      priority: "HIGH",
      maxAttempts: 2
    }
  });
}

beforeAll(async () => {
  closeSync(openSync(databasePath, "w"));
  const prismaCli = path.join(
    process.cwd(),
    "node_modules",
    "prisma",
    "build",
    "index.js"
  );
  execFileSync(
    process.execPath,
    [
      prismaCli,
      "db",
      "push",
      "--skip-generate",
      "--schema",
      path.join(process.cwd(), "prisma", "schema.prisma")
    ],
    { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe" }
  );
  db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const user = await db.user.create({
    data: { email: "signalcare-research@example.com", passwordHash: "test" }
  });
  userId = user.id;
  const domain = await db.executionDomain.create({
    data: { userId, name: "Work", slug: "work" }
  });
  const signalProject = await db.executionProject.create({
    data: { userId, domainId: domain.id, name: "SignalCare" }
  });
  signalProjectId = signalProject.id;
  await db.agentProjectConfig.create({
    data: {
      userId,
      projectId: signalProjectId,
      profile: "SIGNALCARE_GM",
      operatingMode: "LIVE_INTERNAL",
      objective: "Generate profitable SignalCare customer engagements.",
      projectManagerInstructions: "Prioritize customer acquisition.",
      autonomyPolicy: "Allow bounded internal research.",
      escalationPolicy: "External outreach requires Ryan.",
      workspaceIdentifier: "signalcare-repo",
      nextAgentReviewAt: new Date("2026-08-29T12:00:00.000Z")
    }
  });
  const cchcsProject = await db.executionProject.create({
    data: { userId, domainId: domain.id, name: "CCHCS" }
  });
  cchcsProjectId = cchcsProject.id;
  await db.agentProjectConfig.create({
    data: {
      userId,
      projectId: cchcsProjectId,
      profile: "CCHCS_PM",
      operatingMode: "LIVE_INTERNAL",
      objective: "Advance PHI-free commitments.",
      projectManagerInstructions: "Stay PHI-free.",
      autonomyPolicy: "PHI-free only.",
      escalationPolicy: "Escalate sensitive work."
    }
  });
}, 60_000);

beforeEach(async () => {
  process.env.FEATURE_AGENT_MODELS = "true";
  process.env.FEATURE_SIGNALCARE_WEB_RESEARCH = "true";
  process.env.FEATURE_RUNNER_EXECUTION = "true";
  process.env.OPENAI_API_KEY = "test-key";
  delete process.env.AGENT_SIGNALCARE_RESEARCH_MAX_PROSPECTS;
  delete process.env.AGENT_MAX_MODEL_INVOCATIONS_PER_CYCLE;
  delete process.env.AGENT_MAX_MODEL_RUNS_PER_PROJECT_DAY;
  await db.agentActionRequest.deleteMany({ where: { userId } });
  await db.agentDecision.deleteMany({ where: { userId } });
  await db.agentEvent.deleteMany({ where: { userId } });
  await db.agentRun.deleteMany({ where: { userId } });
  await db.agentWorkItem.deleteMany({ where: { userId } });
  await db.pipelineAction.deleteMany({ where: { userId } });
  await db.queueItem.deleteMany({ where: { userId } });
  await db.agentRunner.deleteMany({ where: { userId } });
  await db.agentProjectConfig.update({
    where: { projectId: signalProjectId },
    data: {
      enabled: true,
      pausedAt: null,
      operatingMode: "LIVE_INTERNAL",
      leaseToken: null,
      leaseExpiresAt: null,
      nextAgentReviewAt: new Date("2026-08-29T12:00:00.000Z")
    }
  });
}, 30_000);

afterAll(async () => {
  for (const key of environmentKeys) {
    const value = originalEnvironment[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await db?.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const target = `${databasePath}${suffix}`;
    if (existsSync(target)) rmSync(target);
  }
});

describe("SignalCare hosted public-web research", () => {
  it("turns an empty pipeline into a bounded five-prospect shortlist", async () => {
    const work = await createWork("bounded-discovery");
    const client = fakeResearchClient(
      Array.from({ length: 7 }, (_, index) => candidate(index + 1))
    );

    const result = await executeSignalCareHostedResearch(
      {
        userId,
        projectId: signalProjectId,
        workItemId: work.id,
        objective: work.objective
      },
      client,
      db
    );

    expect(result.outcome).toBe("COMPLETED");
    expect(result.created).toHaveLength(5);
    expect(client.discover).toHaveBeenCalledWith(
      expect.objectContaining({ maxProspects: 5 })
    );
    expect(await db.queueItem.count({ where: { userId } })).toBe(5);
    expect(await db.pipelineAction.count({ where: { userId } })).toBe(5);
  });

  it("hard-caps configured discovery at ten prospects", () => {
    process.env.AGENT_SIGNALCARE_RESEARCH_MAX_PROSPECTS = "999";
    expect(getSignalCareResearchLimit()).toBe(10);
  });

  it("requires candidate sources and verified fact provenance", () => {
    expect(
      signalCareResearchCandidateSchema.safeParse({
        ...candidate(1),
        sourceUrls: [],
        verifiedPublicFacts: []
      }).success
    ).toBe(false);
  });

  it("matches exact provider URLs and persists the provider-returned URL", () => {
    const modelCandidate = candidate(1);
    const providerUrl = modelCandidate.sourceUrls[0];
    const result = retainCitedSignalCareEvidence(
      { candidates: [modelCandidate], searchSummary: "Exact source." },
      [providerSource(providerUrl)]
    );

    expect(result.candidates[0]?.sourceUrls).toEqual([providerUrl]);
    expect(result.candidates[0]?.verifiedPublicFacts[0]?.sourceUrls).toEqual([
      providerUrl
    ]);
    expect(result.diagnostics.candidatesAccepted).toBe(1);
  });

  it("matches clean model URLs to provider URLs with tracking parameters", () => {
    const modelCandidate = candidate(1);
    const providerUrl = `${modelCandidate.sourceUrls[0]}?utm_source=chatgpt.com&fbclid=abc&gclid=def`;
    const result = retainCitedSignalCareEvidence(
      { candidates: [modelCandidate], searchSummary: "Tracked source." },
      [providerSource(providerUrl)]
    );

    expect(result.candidates[0]?.sourceUrls).toEqual([providerUrl]);
    expect(result.candidates[0]?.verifiedPublicFacts[0]?.sourceUrls).toEqual([
      providerUrl
    ]);
  });

  it("keeps meaningful query parameters significant", () => {
    const modelCandidate = candidate(1, {
      sourceUrls: ["https://example-dental-1.com/locations?state=NC"],
      verifiedPublicFacts: [
        {
          fact: "The locations page lists North Carolina offices.",
          sourceUrls: ["https://example-dental-1.com/locations?state=NC"]
        }
      ]
    });
    const result = retainCitedSignalCareEvidence(
      { candidates: [modelCandidate], searchSummary: "Meaningful query." },
      [providerSource("https://example-dental-1.com/locations?state=SC")]
    );

    expect(result.candidates).toEqual([]);
    expect(result.diagnostics.factsRejectedNoProviderSource).toBe(1);
  });

  it("normalizes fragments, www, and HTTP/HTTPS without lowercasing paths", () => {
    expect(
      canonicalizeSignalCareSourceUrl(
        "http://www.Example-Dental-1.com/Locations/#team"
      )
    ).toBe("example-dental-1.com/Locations");
    expect(
      canonicalizeSignalCareSourceUrl("https://example-dental-1.com/Locations")
    ).toBe("example-dental-1.com/Locations");
    expect(
      canonicalizeSignalCareSourceUrl("https://example-dental-1.com/locations")
    ).not.toBe("example-dental-1.com/Locations");
  });

  it("does not validate third-party facts by same-domain matching", () => {
    const modelCandidate = candidate(1, {
      sourceUrls: ["https://directory.example.org/profile/dental-one"],
      verifiedPublicFacts: [
        {
          fact: "A third-party directory lists the organization.",
          sourceUrls: ["https://directory.example.org/profile/dental-one"]
        }
      ]
    });
    const result = retainCitedSignalCareEvidence(
      { candidates: [modelCandidate], searchSummary: "Directory source." },
      [
        providerSource("https://example-dental-1.com/locations"),
        providerSource("https://directory.example.org/profile/dental-two")
      ]
    );

    expect(result.candidates).toEqual([]);
    expect(result.diagnostics.factsRejectedNoProviderSource).toBe(1);
  });

  it("validates an official root website against a sourced official page", () => {
    const modelCandidate = candidate(1);
    const result = retainCitedSignalCareEvidence(
      { candidates: [modelCandidate], searchSummary: "Official page." },
      [providerSource("https://www.example-dental-1.com/locations#offices")]
    );

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.officialWebsite).toBe(
      "https://example-dental-1.com"
    );
  });

  it("rejects fabricated and low-confidence candidates", () => {
    const fabricated = candidate(1);
    const lowConfidence = candidate(2, { evidenceConfidence: "LOW" });
    const result = retainCitedSignalCareEvidence(
      {
        candidates: [fabricated, lowConfidence],
        searchSummary: "Fail-closed candidates."
      },
      [providerSource(lowConfidence.sourceUrls[0])]
    );

    expect(result.candidates).toEqual([]);
    expect(result.diagnostics).toMatchObject({
      candidatesRejectedLowConfidence: 1,
      candidatesRejectedNoProviderSource: 1
    });
  });

  it("uses all Responses web-search provenance locations", async () => {
    const cited = candidate(1);
    const citedFromResults = candidate(2);
    const citedFromAnnotation = candidate(3);
    const fabricated = candidate(4);
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [
            {
              type: "web_search_call",
              status: "completed",
              action: {
                sources: cited.sourceUrls.map((url) => ({ url }))
              },
              results: citedFromResults.sourceUrls.map((url) => ({ url }))
            },
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    candidates: [
                      cited,
                      citedFromResults,
                      citedFromAnnotation,
                      fabricated
                    ],
                    searchSummary: "Official sources checked."
                  }),
                  annotations: citedFromAnnotation.sourceUrls.map((url) => ({
                    type: "url_citation",
                    url
                  }))
                }
              ]
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const client = new OpenAiSignalCareResearchClient(
      fetcher as unknown as typeof fetch,
      "test-research-model"
    );
    const result = await client.discover({
      objective: "Find qualified prospects",
      existingOrganizations: [],
      existingDomains: [],
      maxProspects: 5
    });

    expect(result.candidates.map((item) => item.organizationName)).toEqual([
      cited.organizationName,
      citedFromResults.organizationName,
      citedFromAnnotation.organizationName
    ]);
    const request = JSON.parse(
      (fetcher.mock.calls[0]?.[1] as RequestInit).body as string
    ) as Record<string, unknown>;
    expect(request).toMatchObject({
      model: "test-research-model",
      tools: [{ type: "web_search", search_context_size: "medium" }],
      tool_choice: "required",
      include: ["web_search_call.action.sources", "web_search_call.results"]
    });
  });

  it("records validation counts when no candidate has adequate provenance", async () => {
    const work = await createWork("zero-candidate-diagnostics");
    const diagnostics = {
      rawCandidateCount: 3,
      providerSourceCount: 2,
      candidatesAccepted: 0,
      candidatesRejectedLowConfidence: 1,
      candidatesRejectedNoProviderSource: 2,
      factsRejectedNoProviderSource: 4
    };
    const client: SignalCareResearchClient = {
      async discover() {
        return {
          candidates: [],
          searchSummary: "No candidate passed provenance checks.",
          diagnostics
        };
      }
    };

    const result = await executeSignalCareHostedResearch(
      {
        userId,
        projectId: signalProjectId,
        workItemId: work.id,
        objective: work.objective
      },
      client,
      db
    );

    expect(result.outcome).toBe("RETRY");
    expect(result.error).toContain("rawCandidateCount=3");
    const run = await db.agentRun.findFirstOrThrow({
      where: { workItemId: work.id, runType: "HOSTED_WEB_RESEARCH" }
    });
    expect(JSON.parse(run.evidence ?? "{}")).toEqual({
      failureStage: "evidence_validation",
      validationDiagnostics: diagnostics
    });
  });

  it("skips repeated discovery when an active prospect already exists", async () => {
    await db.queueItem.create({
      data: {
        userId,
        title: "Qualify Existing Dental",
        lane: "signalcare",
        recipient: "Existing Dental",
        nextAction: "Prepare outreach package"
      }
    });
    const work = await createWork("existing-prospect");
    const client = fakeResearchClient([candidate(1)]);

    const result = await executeSignalCareHostedResearch(
      {
        userId,
        projectId: signalProjectId,
        workItemId: work.id,
        objective: work.objective
      },
      client,
      db
    );

    expect(result.skippedBecauseProspectsExist).toBe(true);
    expect(client.discover).not.toHaveBeenCalled();
    expect(await db.queueItem.count({ where: { userId } })).toBe(1);
  });

  it("deduplicates candidates by organization and domain", async () => {
    const work = await createWork("deduplicate");
    const first = candidate(1);
    const duplicate = candidate(2, {
      organizationName: "A different rendering of the same organization",
      officialWebsite: first.officialWebsite,
      domain: first.domain,
      sourceUrls: first.sourceUrls,
      verifiedPublicFacts: first.verifiedPublicFacts
    });
    const result = await executeSignalCareHostedResearch(
      {
        userId,
        projectId: signalProjectId,
        workItemId: work.id,
        objective: work.objective
      },
      fakeResearchClient([first, duplicate]),
      db
    );
    expect(result.created).toHaveLength(1);
    expect(await db.queueItem.count({ where: { userId } })).toBe(1);
  });

  it("denies hosted public research to CCHCS", async () => {
    const work = await createWork("cchcs-denied", cchcsProjectId);
    await expect(
      executeSignalCareHostedResearch(
        {
          userId,
          projectId: cchcsProjectId,
          workItemId: work.id,
          objective: work.objective
        },
        fakeResearchClient([candidate(1)]),
        db
      )
    ).rejects.toThrow("SignalCare STANDARD profile");
  });

  it("persists internal research only and cannot send outreach", async () => {
    expect(
      signalCareResearchCandidateSchema.safeParse({
        ...candidate(1),
        sendEmail: true
      }).success
    ).toBe(false);
    const work = await createWork("internal-only");
    await executeSignalCareHostedResearch(
      {
        userId,
        projectId: signalProjectId,
        workItemId: work.id,
        objective: work.objective
      },
      fakeResearchClient([candidate(1)]),
      db
    );
    expect(await db.agentActionRequest.count({ where: { userId } })).toBe(0);
    expect(await db.agentDecision.count({ where: { userId } })).toBe(0);
    expect(
      await db.pipelineAction.count({
        where: { userId, type: { not: "prospect_research" } }
      })
    ).toBe(0);
  });

  it("never routes hosted public research to the Windows runner", async () => {
    await createWork("hosted-not-local");
    const runner = await db.agentRunner.create({
      data: { userId, keyId: "runner-signalcare-test", name: "Test runner" }
    });
    await expect(
      claimRunnerWork(
        runner,
        { capabilities: [SIGNALCARE_WEB_RESEARCH_CAPABILITY], version: "test" },
        db
      )
    ).rejects.toThrow("not registered for the local runner");
    await expect(
      claimRunnerWork(
        runner,
        { capabilities: ["REPOSITORY_READ"], version: "test" },
        db
      )
    ).resolves.toBeNull();
  });

  it("safely reclassifies the existing production shortlist work", async () => {
    const work = await createWork("legacy-reclassification", signalProjectId, {
      requiredCapability: "REPOSITORY_READ",
      workspaceIdentifier: "signalcare-repo"
    });
    const config = await db.agentProjectConfig.findUniqueOrThrow({
      where: { projectId: signalProjectId }
    });
    expect(await reclassifySignalCareProspectResearch(config, db)).toEqual([
      work.id
    ]);
    const updated = await db.agentWorkItem.findUniqueOrThrow({
      where: { id: work.id }
    });
    expect(updated.requiredCapability).toBe(SIGNALCARE_WEB_RESEARCH_CAPABILITY);
    expect(updated.workspaceIdentifier).toBeNull();
    expect(updated.networkPolicy).toBe("ALLOWLIST");
  });

  it("creates one bounded replacement for the prior provenance failure", async () => {
    const failed = await db.agentWorkItem.create({
      data: {
        userId,
        projectId: signalProjectId,
        idempotencyKey: "failed-prior-provenance",
        title:
          "Build an evidence-backed qualified prospect shortlist for SignalCare",
        objective: "Discover qualified prospects from public evidence.",
        expectedValue: "Create acquisition opportunities.",
        acceptanceCriteria: "Persist only evidence-backed candidates.",
        agentRole: "SIGNALCARE_RESEARCHER",
        actionCategory: "RESEARCH_READ_ONLY",
        requiredCapability: SIGNALCARE_WEB_RESEARCH_CAPABILITY,
        sandboxPolicy: "READ_ONLY",
        networkPolicy: "ALLOWLIST",
        state: "FAILED",
        attemptCount: 2,
        maxAttempts: 2,
        blocker:
          "Hosted research returned no candidates with adequate cited evidence."
      }
    });
    const config = await db.agentProjectConfig.findUniqueOrThrow({
      where: { projectId: signalProjectId }
    });

    const recovered = await recoverFailedSignalCareProspectResearch(config, db);
    expect(recovered).toHaveLength(1);
    const replacement = await db.agentWorkItem.findUniqueOrThrow({
      where: { id: recovered[0] }
    });
    expect(replacement).toMatchObject({
      parentWorkItemId: failed.id,
      state: "QUEUED",
      attemptCount: 0,
      maxAttempts: 1,
      requiredCapability: SIGNALCARE_WEB_RESEARCH_CAPABILITY
    });

    expect(await recoverFailedSignalCareProspectResearch(config, db)).toEqual(
      []
    );
    expect(
      await db.agentWorkItem.count({ where: { projectId: signalProjectId } })
    ).toBe(2);
  });

  it("does not revive arbitrary failed work", async () => {
    await db.agentWorkItem.create({
      data: {
        userId,
        projectId: signalProjectId,
        idempotencyKey: "unrelated-failed-work",
        title: "Unrelated repository task",
        objective: "Do something unrelated.",
        expectedValue: "Unrelated value.",
        acceptanceCriteria: "Unrelated result.",
        agentRole: "CODE_WORKER",
        actionCategory: "REVERSIBLE_REPOSITORY_WORK",
        requiredCapability: "CODEX_IMPLEMENTATION",
        state: "FAILED",
        blocker:
          "Hosted research returned no candidates with adequate cited evidence."
      }
    });
    const config = await db.agentProjectConfig.findUniqueOrThrow({
      where: { projectId: signalProjectId }
    });

    expect(await recoverFailedSignalCareProspectResearch(config, db)).toEqual(
      []
    );
    expect(
      await db.agentWorkItem.count({ where: { projectId: signalProjectId } })
    ).toBe(1);
  });

  it("does not recover failed discovery after a prospect was persisted", async () => {
    await db.agentWorkItem.create({
      data: {
        userId,
        projectId: signalProjectId,
        idempotencyKey: "failed-with-persisted-prospect",
        title:
          "Build an evidence-backed qualified prospect shortlist for SignalCare",
        objective: "Discover qualified prospects from public evidence.",
        expectedValue: "Create acquisition opportunities.",
        acceptanceCriteria: "Persist only evidence-backed candidates.",
        agentRole: "SIGNALCARE_RESEARCHER",
        actionCategory: "RESEARCH_READ_ONLY",
        requiredCapability: SIGNALCARE_WEB_RESEARCH_CAPABILITY,
        state: "FAILED",
        blocker:
          "Hosted research returned no candidates with adequate cited evidence."
      }
    });
    const prior = candidate(1);
    await db.pipelineAction.create({
      data: {
        userId,
        date: new Date(),
        type: "prospect_research",
        withWhom: prior.organizationName,
        note: JSON.stringify({ domain: prior.domain })
      }
    });
    const config = await db.agentProjectConfig.findUniqueOrThrow({
      where: { projectId: signalProjectId }
    });

    expect(await recoverFailedSignalCareProspectResearch(config, db)).toEqual(
      []
    );
    expect(
      await db.agentWorkItem.count({ where: { projectId: signalProjectId } })
    ).toBe(1);
  });

  it("executes existing hosted work before a PM WAIT can strand or duplicate it", async () => {
    const now = new Date("2026-08-29T12:00:00.000Z");
    const existing = await createWork(
      "existing-hosted-order",
      signalProjectId,
      {
        requiredCapability: "REPOSITORY_READ",
        workspaceIdentifier: "signalcare-repo"
      }
    );
    const client = fakeResearchClient([candidate(1)]);
    const { services, chooseNextWork } = waitingServices(client);

    const cycle = await runAgentOrchestrationCycle(now, {
      userId,
      projectIds: [signalProjectId],
      db,
      services
    });

    expect(cycle.projects[0]?.outcome).toBe("COMPLETED");
    expect(cycle.projects[0]?.workItemId).toBe(existing.id);
    expect(chooseNextWork).not.toHaveBeenCalled();
    expect(client.discover).toHaveBeenCalledOnce();
    expect(await db.agentWorkItem.count({ where: { userId } })).toBe(1);
    const completed = await db.agentWorkItem.findUniqueOrThrow({
      where: { id: existing.id }
    });
    expect(completed.requiredCapability).toBe(
      SIGNALCARE_WEB_RESEARCH_CAPABILITY
    );
    expect(completed.state).toBe("DONE");
    const config = await db.agentProjectConfig.findUniqueOrThrow({
      where: { projectId: signalProjectId }
    });
    expect(config.nextAgentReviewAt?.getTime()).toBe(now.getTime());
  });

  it("leaves existing hosted work queued when hosted research is disabled", async () => {
    process.env.FEATURE_SIGNALCARE_WEB_RESEARCH = "false";
    const existing = await createWork("existing-hosted-disabled");
    const client = fakeResearchClient([candidate(1)]);
    const { services, chooseNextWork } = waitingServices(client);

    const cycle = await runAgentOrchestrationCycle(
      new Date("2026-08-29T12:00:00.000Z"),
      { userId, projectIds: [signalProjectId], db, services }
    );

    expect(cycle.projects[0]?.outcome).toBe("WAITING");
    expect(chooseNextWork).not.toHaveBeenCalled();
    expect(client.discover).not.toHaveBeenCalled();
    const waiting = await db.agentWorkItem.findUniqueOrThrow({
      where: { id: existing.id }
    });
    expect(waiting.state).toBe("QUEUED");
    expect(waiting.blocker).toContain("safely waiting");
  });

  it("queues existing local repository work before a PM WAIT can strand it", async () => {
    const existing = await db.agentWorkItem.create({
      data: {
        userId,
        projectId: signalProjectId,
        idempotencyKey: "existing-local-order",
        title: "Implement existing bounded repository work",
        objective: "Use the persisted repository objective.",
        expectedValue: "Advance an existing internal blocker.",
        acceptanceCriteria: "Persisted tests pass.",
        agentRole: "CODE_WORKER",
        actionCategory: "REVERSIBLE_REPOSITORY_WORK",
        requiredCapability: "CODEX_IMPLEMENTATION",
        sandboxPolicy: "WORKSPACE_WRITE",
        networkPolicy: "OFF",
        workspaceIdentifier: "signalcare-repo",
        priority: "HIGH"
      }
    });
    const { services, chooseNextWork } = waitingServices();

    const cycle = await runAgentOrchestrationCycle(
      new Date("2026-08-29T12:00:00.000Z"),
      { userId, projectIds: [signalProjectId], db, services }
    );

    expect(cycle.projects[0]?.outcome).toBe("QUEUED_FOR_RUNNER");
    expect(cycle.projects[0]?.workItemId).toBe(existing.id);
    expect(chooseNextWork).not.toHaveBeenCalled();
    expect(await db.agentWorkItem.count({ where: { userId } })).toBe(1);
  });

  it("keeps dependent persisted work blocked until integration releases it", async () => {
    const base = await db.agentWorkItem.create({
      data: {
        userId,
        projectId: signalProjectId,
        idempotencyKey: "orchestration-dependency-base",
        title: "Verified unintegrated base",
        objective: "Provide a canonical dependency.",
        expectedValue: "Enable safe downstream work.",
        acceptanceCriteria: "Integration is explicit.",
        agentRole: "CODE_WORKER",
        actionCategory: "REVERSIBLE_REPOSITORY_WORK",
        requiredCapability: "CODEX_IMPLEMENTATION",
        workspaceIdentifier: "signalcare-repo",
        state: "READY_FOR_REVIEW",
        integrationStatus: "PENDING_REVIEW"
      }
    });
    const dependent = await db.agentWorkItem.create({
      data: {
        userId,
        projectId: signalProjectId,
        idempotencyKey: "orchestration-dependent",
        title: "Dependent repository work",
        objective: "Use only integrated canonical work.",
        expectedValue: "Advance safely after integration.",
        acceptanceCriteria: "Dependency is integrated first.",
        agentRole: "CODE_WORKER",
        actionCategory: "REVERSIBLE_REPOSITORY_WORK",
        requiredCapability: "CODEX_IMPLEMENTATION",
        workspaceIdentifier: "signalcare-repo",
        dependsOnWorkItemId: base.id
      }
    });
    const { services, chooseNextWork } = waitingServices();
    const firstAt = new Date("2026-08-29T12:00:00.000Z");
    const blocked = await runAgentOrchestrationCycle(firstAt, {
      userId,
      projectIds: [signalProjectId],
      db,
      services
    });
    expect(blocked.projects[0]?.outcome).toBe("WAITING");
    expect(chooseNextWork).toHaveBeenCalledOnce();
    expect(
      (
        await db.agentWorkItem.findUniqueOrThrow({
          where: { id: dependent.id }
        })
      ).state
    ).toBe("QUEUED");

    await markAgentWorkIntegrated(userId, base.id, "canonical-sha", db);
    await db.agentProjectConfig.update({
      where: { projectId: signalProjectId },
      data: {
        nextAgentReviewAt: firstAt,
        leaseToken: null,
        leaseExpiresAt: null
      }
    });
    chooseNextWork.mockClear();
    const released = await runAgentOrchestrationCycle(firstAt, {
      userId,
      projectIds: [signalProjectId],
      db,
      services
    });
    expect(released.projects[0]?.outcome).toBe("QUEUED_FOR_RUNNER");
    expect(released.projects[0]?.workItemId).toBe(dependent.id);
    expect(chooseNextWork).not.toHaveBeenCalled();
  });

  it("makes discovered prospects visible to the existing pipeline snapshot", async () => {
    const work = await createWork("pipeline-visibility");
    await executeSignalCareHostedResearch(
      {
        userId,
        projectId: signalProjectId,
        workItemId: work.id,
        objective: work.objective
      },
      fakeResearchClient([candidate(1)]),
      db
    );
    const snapshot = (await executeProjectTool(
      { userId, projectId: signalProjectId, profile: "SIGNALCARE_GM" },
      "signalcare.pipeline.snapshot",
      {},
      db
    )) as {
      prospects: Array<{
        name: string;
        domain: string | null;
        sourceUrls: string[];
      }>;
    };
    expect(snapshot.prospects).toEqual([
      expect.objectContaining({
        name: "Example Dental Group 1",
        domain: "example-dental-1.com",
        sourceUrls: ["https://example-dental-1.com/locations"]
      })
    ]);
  });

  it("automatically reevaluates after discovery and uses the new prospect truth", async () => {
    const observedProspectCounts: number[] = [];
    const services: OrchestrationServices = {
      projectManager: {
        async chooseNextWork(context) {
          const snapshot = context.toolEvidence?.find(
            (entry) => entry.toolId === "signalcare.pipeline.snapshot"
          )?.output as { prospects: unknown[] };
          observedProspectCounts.push(snapshot.prospects.length);
          if (snapshot.prospects.length > 0) {
            return {
              disposition: "WAIT",
              title: "Work the qualified prospect",
              objective: "Use the newly discovered evidence.",
              expectedValue: "Advance acquisition without repeated discovery.",
              acceptanceCriteria: "No duplicate discovery is created.",
              agentRole: "SIGNALCARE_GM",
              actionCategory: "RESEARCH_READ_ONLY",
              priority: "HIGH",
              maxAttempts: 1,
              plannedBottleneck:
                "Prepare the highest-value prospect for outreach review.",
              requiredCapability: "REPOSITORY_READ",
              sandboxPolicy: "READ_ONLY",
              networkPolicy: "OFF"
            };
          }
          return {
            disposition: "CREATE_WORK",
            title:
              "Build an evidence-backed qualified prospect shortlist for SignalCare",
            objective: "Discover qualified prospects from public evidence.",
            expectedValue: "Create acquisition opportunities.",
            acceptanceCriteria:
              "At most five sourced candidates enter the pipeline.",
            agentRole: "SIGNALCARE_RESEARCHER",
            actionCategory: "RESEARCH_READ_ONLY",
            priority: "HIGH",
            maxAttempts: 2,
            plannedBottleneck: "No qualified prospects present.",
            requiredCapability: SIGNALCARE_WEB_RESEARCH_CAPABILITY,
            sandboxPolicy: "READ_ONLY",
            networkPolicy: "ALLOWLIST"
          };
        }
      },
      worker: {
        async execute() {
          throw new Error("Local worker must not execute hosted research.");
        }
      },
      verifier: {
        async verify() {
          throw new Error("Hosted research uses deterministic evidence QA.");
        }
      },
      signalCareResearchClient: fakeResearchClient([candidate(1)])
    };
    const firstAt = new Date("2026-08-29T12:00:00.000Z");
    const first = await runAgentOrchestrationCycle(firstAt, {
      userId,
      projectIds: [signalProjectId],
      db,
      services
    });
    expect(first.projects[0]?.outcome).toBe("COMPLETED");

    const second = await runAgentOrchestrationCycle(
      new Date(firstAt.getTime() + 1),
      { userId, projectIds: [signalProjectId], db, services }
    );
    expect(second.projects[0]?.outcome).toBe("WAITING");
    expect(observedProspectCounts).toEqual([0, 1]);
    expect(await db.agentWorkItem.count({ where: { userId } })).toBe(1);
  });

  it.each(["CREATE_WORK", "WAIT", "PARK"] as const)(
    "durably records a model PM %s decision",
    async (disposition) => {
      const now = new Date("2026-08-29T13:00:00.000Z");
      const plan = {
        ...modelOutput({ disposition }),
        disposition,
        plannedBottleneck: "Pipeline evidence was reviewed."
      } as Awaited<
        ReturnType<OrchestrationServices["projectManager"]["chooseNextWork"]>
      >;
      const { services } = modelServices(plan);

      await runAgentOrchestrationCycle(now, {
        userId,
        projectIds: [signalProjectId],
        db,
        services
      });

      const event = await db.agentEvent.findFirstOrThrow({
        where: { projectId: signalProjectId, type: "PM_DECISION_RECORDED" }
      });
      expect(JSON.parse(event.metadata ?? "{}")).toMatchObject({
        disposition,
        currentBottleneck: "Pipeline evidence was reviewed.",
        evidence: "The bounded project snapshot contains no actionable gap.",
        nextReviewMinutes: 90,
        ownerNeeded: false
      });
    }
  );

  it("counts a WAIT review toward the daily model invocation limit", async () => {
    const now = new Date();
    const { services } = modelServices({
      ...modelOutput(),
      disposition: "WAIT",
      plannedBottleneck: "Wait for new evidence."
    } as Awaited<
      ReturnType<OrchestrationServices["projectManager"]["chooseNextWork"]>
    >);
    await runAgentOrchestrationCycle(now, {
      userId,
      projectIds: [signalProjectId],
      db,
      services
    });
    process.env.AGENT_MAX_MODEL_RUNS_PER_PROJECT_DAY = "1";
    await db.agentProjectConfig.update({
      where: { projectId: signalProjectId },
      data: {
        nextAgentReviewAt: now,
        leaseToken: null,
        leaseExpiresAt: null
      }
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await runAgentOrchestrationCycle(new Date(now.getTime() + 1), {
      userId,
      projectIds: [signalProjectId],
      db
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("preserves PM control fields and rejects inconsistent owner proposals", async () => {
    const ownerDecision = {
      category: "SEND_EMAIL_OR_MESSAGE",
      question: "Approve first outreach to Existing Dental?",
      context: "Use only the bounded internal outreach package.",
      recommendedChoice: "APPROVE",
      availableChoices: ["APPROVE", "NEEDS_MORE_RESEARCH", "PASS"],
      expectedUpside: "Open a qualified customer conversation.",
      risk: "External communication represents Ryan.",
      targetEntity: {
        type: "SIGNALCARE_PROSPECT",
        name: "Existing Dental"
      }
    };
    const output = modelOutput({
      ownerNeeded: true,
      ownerDecision,
      evidence: "The prospect is outreach-ready.",
      nextReviewMinutes: 180
    });
    const agent = new ModelProjectManagerAgent(modelClient(output));
    const plan = await agent.chooseNextWork({
      profile: "SIGNALCARE_GM",
      projectId: signalProjectId,
      projectName: "SignalCare",
      objective: "Generate profitable customer engagements.",
      primaryKpi: null,
      currentBottleneck: "First outreach approval",
      instructions: "Advance real acquisition work.",
      autonomyPolicy: "Internal work only.",
      escalationPolicy: "External outreach needs Ryan.",
      existingWorkTitles: [],
      toolEvidence: []
    });
    expect(plan).toMatchObject({
      evidence: "The prospect is outreach-ready.",
      nextReviewMinutes: 180,
      ownerNeeded: true,
      ownerDecision
    });
    expect(
      pmOutputSchema.safeParse({
        ...output,
        ownerNeeded: true,
        ownerDecision: null
      }).success
    ).toBe(false);
    expect(
      pmOutputSchema.safeParse({
        ...output,
        ownerNeeded: false,
        ownerDecision
      }).success
    ).toBe(false);
    expect(
      pmOutputSchema.safeParse({
        ...output,
        ownerDecision: { ...ownerDecision, targetEntity: null }
      }).success
    ).toBe(false);
  });

  it("suppresses repeated discovery but permits bounded qualification of an existing prospect", async () => {
    const toolEvidence = [
      {
        toolId: "signalcare.pipeline.snapshot",
        summary: "Current pipeline",
        output: {
          prospects: [{ name: "Existing Dental", stage: "queued" }],
          openOwnerDecisions: 0
        }
      }
    ];
    const context = {
      profile: "SIGNALCARE_GM",
      projectId: signalProjectId,
      projectName: "SignalCare",
      objective: "Generate profitable customer engagements.",
      primaryKpi: null,
      currentBottleneck: null,
      instructions: "Advance acquisition.",
      autonomyPolicy: "Internal work only.",
      escalationPolicy: "External outreach needs Ryan.",
      existingWorkTitles: [],
      toolEvidence
    };
    const discovery = new ModelProjectManagerAgent(
      modelClient(
        modelOutput({
          disposition: "CREATE_WORK",
          requiredCapability: SIGNALCARE_WEB_RESEARCH_CAPABILITY,
          researchMode: "DISCOVER_PROSPECTS"
        })
      )
    );
    expect(await discovery.chooseNextWork(context)).toMatchObject({
      disposition: "WAIT",
      researchMode: "DISCOVER_PROSPECTS"
    });

    const qualify = new ModelProjectManagerAgent(
      modelClient(
        modelOutput({
          disposition: "CREATE_WORK",
          requiredCapability: SIGNALCARE_WEB_RESEARCH_CAPABILITY,
          researchMode: "QUALIFY_EXISTING_PROSPECT",
          targetProspect: "Existing Dental"
        })
      )
    );
    expect(await qualify.chooseNextWork(context)).toMatchObject({
      disposition: "CREATE_WORK",
      researchMode: "QUALIFY_EXISTING_PROSPECT",
      targetProspect: "Existing Dental"
    });
  });

  it("requires an existing prospect target and provider-backed qualification provenance", async () => {
    const work = await createWork("missing-qualification-target", signalProjectId, {
      operationalContext: serializeSignalCareResearchContext({
        researchMode: "QUALIFY_EXISTING_PROSPECT",
        targetProspect: "Missing Dental"
      })
    });
    const qualify = vi.fn().mockResolvedValue({
      qualification: qualification("Missing Dental"),
      providerSourceUrls: qualification("Missing Dental").sourceUrls
    });
    const result = await executeSignalCareHostedResearch(
      {
        userId,
        projectId: signalProjectId,
        workItemId: work.id,
        objective: work.objective
      },
      { discover: vi.fn(), qualify },
      db
    );
    expect(result.outcome).toBe("RETRY");
    expect(qualify).not.toHaveBeenCalled();

    const unbacked = qualification("Existing Dental");
    expect(() =>
      retainCitedSignalCareQualification(unbacked, [])
    ).toThrow("inadequate provider provenance");
  });

  it.each([
    ["ADVANCE", "HIGH", "outreach_ready"],
    ["PASS", "MEDIUM", "passed"]
  ] as const)(
    "updates one existing prospect after %s qualification",
    async (recommendation, confidence, expectedStatus) => {
      const now = new Date("2026-08-29T13:30:00.000Z");
      const prospect = await db.queueItem.create({
        data: {
          userId,
          title: "Qualify Existing Dental",
          lane: "signalcare",
          recipient: "Existing Dental",
          nextAction: "Resolve evidence gaps"
        }
      });
      await db.pipelineAction.create({
        data: {
          userId,
          date: new Date(),
          type: "prospect_research",
          withWhom: "Existing Dental",
          note: JSON.stringify({
            verifiedFacts: qualification("Existing Dental").verifiedPublicFacts,
            sourceUrls: qualification("Existing Dental").sourceUrls
          })
        }
      });
      const work = await createWork(`qualification-${recommendation}`, signalProjectId, {
        operationalContext: serializeSignalCareResearchContext({
          researchMode: "QUALIFY_EXISTING_PROSPECT",
          targetProspect: "Existing Dental"
        })
      });
      const result = await executeSignalCareHostedResearch(
        {
          userId,
          projectId: signalProjectId,
          workItemId: work.id,
          objective: work.objective
        },
        {
          discover: vi.fn(),
          qualify: vi.fn().mockResolvedValue({
            qualification: qualification("Existing Dental", {
              recommendation,
              confidence,
              ...(recommendation === "PASS"
                ? {
                    conversationAngle: null,
                    draftOutreachLanguage: null,
                    nextResearchStep: null
                  }
                : {})
            }),
            providerSourceUrls: qualification("Existing Dental").sourceUrls
          })
        },
        db,
        now
      );
      expect(result.outcome).toBe("COMPLETED");
      expect(result.pipelineStatus).toBe(expectedStatus);
      expect(await db.queueItem.count({ where: { userId } })).toBe(1);
      expect(
        await db.queueItem.findUniqueOrThrow({ where: { id: prospect.id } })
      ).toMatchObject({ status: expectedStatus });
      const action = await db.pipelineAction.findFirstOrThrow({
        where: { userId, type: "prospect_qualification" }
      });
      expect(JSON.parse(action.note ?? "{}")).toMatchObject({
        workItemId: work.id,
        externalOutreachPerformed: false
      });
      const config = await db.agentProjectConfig.findUniqueOrThrow({
        where: { projectId: signalProjectId }
      });
      expect(config.nextAgentReviewAt?.getTime()).toBe(
        now.getTime()
      );
    }
  );

  it("turns an outreach-ready prospect into NEED RYAN without communicating externally", async () => {
    await createReadyProspect();
    const ownerDecision = {
      category: "SEND_EMAIL_OR_MESSAGE" as const,
      question: "Approve first outreach to Existing Dental?",
      context: "Evidence-backed package and exact internal draft are ready.",
      recommendedChoice: "APPROVE",
      availableChoices: ["APPROVE", "NEEDS_MORE_RESEARCH", "PASS"],
      expectedUpside: "Open a qualified customer conversation.",
      risk: "External communication represents Ryan.",
      targetEntity: {
        type: "SIGNALCARE_PROSPECT",
        name: "Existing Dental"
      }
    };
    const { services } = modelServices({
      ...modelOutput({
        ownerNeeded: true,
        ownerDecision,
        actionCategory: "SEND_EMAIL_OR_MESSAGE",
        title: "Authorize exact Existing Dental outreach",
        objective: "Obtain transaction-specific owner authorization."
      }),
      disposition: "WAIT",
      plannedBottleneck: "Owner authorization is the next controlled step."
    } as Awaited<
      ReturnType<OrchestrationServices["projectManager"]["chooseNextWork"]>
    >);

    const result = await runAgentOrchestrationCycle(
      new Date("2026-08-29T14:00:00.000Z"),
      { userId, projectIds: [signalProjectId], db, services }
    );

    expect(result.projects[0]?.outcome).toBe("NEEDS_RYAN");
    expect(await db.agentDecision.count({ where: { userId } })).toBe(1);
    const persistedDecision = await db.agentDecision.findFirstOrThrow({
      where: { userId }
    });
    expect(persistedDecision.question).toBe(
      "Approve first outreach to Existing Dental?"
    );
    expect(JSON.parse(persistedDecision.availableChoices)).toEqual([
      "APPROVE",
      "NEEDS_MORE_RESEARCH",
      "PASS"
    ]);
    expect(await db.agentActionRequest.count({ where: { userId } })).toBe(1);
    const actionRequest = await db.agentActionRequest.findFirstOrThrow({
      where: { userId }
    });
    expect(actionRequest).toMatchObject({ state: "AWAITING_OWNER_APPROVAL" });
    expect(
      await db.pipelineAction.count({
        where: { userId, type: { in: ["email", "sms", "outreach_sent"] } }
      })
    ).toBe(0);

    await resolveOwnerDecision(userId, result.projects[0]!.decisionId!, "APPROVE", db);
    expect(
      await db.agentActionRequest.findUniqueOrThrow({
        where: { id: actionRequest.id }
      })
    ).toMatchObject({ state: "AWAITING_EXECUTION", executedAt: null });
    expect(
      await db.agentWorkItem.findUniqueOrThrow({
        where: { id: result.projects[0]!.workItemId! }
      })
    ).toMatchObject({ state: "AWAITING_EXECUTION", completedAt: null });
  });

  it("returns NEEDS_MORE_RESEARCH outreach decisions to bounded work", async () => {
    await createReadyProspect();
    const ownerDecision = {
      category: "SEND_EMAIL_OR_MESSAGE" as const,
      question: "Approve first outreach to Existing Dental?",
      context: "Evidence-backed package is ready for owner review.",
      recommendedChoice: "APPROVE",
      availableChoices: ["APPROVE", "NEEDS_MORE_RESEARCH", "PASS"],
      expectedUpside: "Open a qualified customer conversation.",
      risk: "External communication represents Ryan.",
      targetEntity: {
        type: "SIGNALCARE_PROSPECT",
        name: "Existing Dental"
      }
    };
    const { services } = modelServices({
      ...modelOutput({ ownerNeeded: true, ownerDecision }),
      disposition: "WAIT",
      plannedBottleneck: "Owner controls external outreach."
    } as Awaited<
      ReturnType<OrchestrationServices["projectManager"]["chooseNextWork"]>
    >);
    const result = await runAgentOrchestrationCycle(
      new Date("2026-08-29T14:30:00.000Z"),
      { userId, projectIds: [signalProjectId], db, services }
    );

    await resolveOwnerDecision(
      userId,
      result.projects[0]!.decisionId!,
      "NEEDS_MORE_RESEARCH",
      db
    );
    expect(
      await db.agentWorkItem.findUniqueOrThrow({
        where: { id: result.projects[0]!.workItemId! }
      })
    ).toMatchObject({ state: "QUEUED" });
    expect(
      await db.agentActionRequest.findFirstOrThrow({ where: { userId } })
    ).toMatchObject({ state: "PROPOSED", decisionId: null });
  });

  it("does not create NEED RYAN when ownerNeeded is false", async () => {
    const { services } = modelServices({
      ...modelOutput(),
      disposition: "WAIT",
      plannedBottleneck: "No owner-controlled action is needed."
    } as Awaited<
      ReturnType<OrchestrationServices["projectManager"]["chooseNextWork"]>
    >);
    await runAgentOrchestrationCycle(
      new Date("2026-08-29T15:00:00.000Z"),
      { userId, projectIds: [signalProjectId], db, services }
    );
    expect(await db.agentDecision.count({ where: { userId } })).toBe(0);
  });

  it("honors bounded nextReviewMinutes for WAIT", async () => {
    const now = new Date("2026-08-29T16:00:00.000Z");
    const { services } = modelServices({
      ...modelOutput({ nextReviewMinutes: 120 }),
      disposition: "WAIT",
      plannedBottleneck: "Wait for a useful change."
    } as Awaited<
      ReturnType<OrchestrationServices["projectManager"]["chooseNextWork"]>
    >);
    await runAgentOrchestrationCycle(now, {
      userId,
      projectIds: [signalProjectId],
      db,
      services
    });
    const config = await db.agentProjectConfig.findUniqueOrThrow({
      where: { projectId: signalProjectId }
    });
    expect(config.nextAgentReviewAt?.toISOString()).toBe(
      "2026-08-29T18:00:00.000Z"
    );
  });

  it("schedules the existing production prospect for one immediate qualification review", async () => {
    await db.queueItem.create({
      data: {
        userId,
        title: "Existing prospect",
        lane: "signalcare",
        recipient: "Existing Dental",
        nextAction: "Qualify existing public evidence"
      }
    });
    const now = new Date("2026-08-29T17:00:00.000Z");
    expect(await scheduleSignalCareQualificationReviewOnce(userId, db, now)).toEqual([
      signalProjectId
    ]);
    expect(await scheduleSignalCareQualificationReviewOnce(userId, db, now)).toEqual([]);
    expect(await db.queueItem.count({ where: { userId } })).toBe(1);
    expect(
      (
        await db.agentProjectConfig.findUniqueOrThrow({
          where: { projectId: signalProjectId }
        })
      ).nextAgentReviewAt?.toISOString()
    ).toBe(now.toISOString());
  });

  it("converts a premature queued-prospect outreach escalation into qualification", async () => {
    await db.queueItem.create({
      data: {
        userId,
        title: "Qualify Caption Care",
        lane: "signalcare",
        recipient: "Caption Care",
        status: "queued",
        nextAction: "Requalify against the canonical commercial profile."
      }
    });
    await db.pipelineAction.create({
      data: {
        userId,
        date: new Date(),
        type: "prospect_research",
        withWhom: "Caption Care",
        note: JSON.stringify({
          suggestedEntryOffer: "HEALTHCARE_OPERATIONAL_VISIBILITY_WORKFLOW_DIAGNOSTIC",
          verifiedFacts: qualification("Caption Care").verifiedPublicFacts,
          sourceUrls: qualification("Caption Care").sourceUrls
        })
      }
    });
    const ownerDecision = {
      category: "SEND_EMAIL_OR_MESSAGE" as const,
      question: "Approve outreach to Caption Care?",
      context: "The model proposed outreach before qualification.",
      recommendedChoice: "APPROVE",
      availableChoices: ["APPROVE", "NEEDS_MORE_RESEARCH", "PASS"],
      expectedUpside: "Potential conversation.",
      risk: "Positioning is not yet verified.",
      targetEntity: {
        type: "SIGNALCARE_PROSPECT" as const,
        name: "Caption Care"
      }
    };
    const qualify = vi.fn().mockResolvedValue({
      qualification: qualification("Caption Care", {
        recommendation: "PASS",
        confidence: "MEDIUM",
        conversationAngle: null,
        draftOutreachLanguage: null,
        evidenceAgainstPursuit:
          "Caption Care is a technology vendor and public evidence does not establish buyer fit.",
        qualificationSummary:
          "Caption Care is not currently a plausible customer for an approved SignalCare offer."
      }),
      providerSourceUrls: qualification("Caption Care").sourceUrls
    });
    const { services } = modelServices(
      {
        ...modelOutput({
          ownerNeeded: true,
          ownerDecision,
          actionCategory: "SEND_EMAIL_OR_MESSAGE"
        }),
        disposition: "WAIT",
        plannedBottleneck: "Caption Care has not been qualified."
      } as Awaited<
        ReturnType<OrchestrationServices["projectManager"]["chooseNextWork"]>
      >,
      { discover: vi.fn(), qualify }
    );

    const result = await runAgentOrchestrationCycle(
      new Date("2026-08-29T18:00:00.000Z"),
      { userId, projectIds: [signalProjectId], db, services }
    );

    expect(result.projects[0]?.outcome).toBe("COMPLETED");
    expect(qualify).toHaveBeenCalledOnce();
    expect(await db.agentDecision.count({ where: { userId } })).toBe(0);
    expect(await db.agentActionRequest.count({ where: { userId } })).toBe(0);
    expect(
      await db.queueItem.findFirstOrThrow({
        where: { userId, recipient: "Caption Care" }
      })
    ).toMatchObject({ status: "passed" });
    expect(
      await db.agentEvent.count({
        where: {
          userId,
          type: "PREMATURE_OWNER_ESCALATION_SUPPRESSED"
        }
      })
    ).toBe(1);
  });

  it.each([
    ["draftOutreachLanguage", null, "Internal draft outreach language is missing"],
    ["providerBackedPublicSources", false, "Provider-backed public source provenance is missing"]
  ] as const)(
    "blocks outreach when qualification %s is incomplete",
    async (field, value, expectedReason) => {
      const { packageData } = await createReadyProspect();
      const action = await db.pipelineAction.findFirstOrThrow({
        where: { userId, type: "prospect_qualification" }
      });
      const evidence = {
        ...JSON.parse(action.note ?? "{}"),
        [field]: value
      };
      await db.pipelineAction.update({
        where: { id: action.id },
        data: { note: JSON.stringify(evidence) }
      });
      const work = await createWork(`incomplete-${field}`);
      await db.agentWorkItem.update({
        where: { id: work.id },
        data: { state: "PLANNING" }
      });
      await expect(
        createOwnerDecision(
          {
            userId,
            projectId: signalProjectId,
            workItemId: work.id,
            idempotencyKey: `incomplete-decision-${field}`,
            profile: "SIGNALCARE_GM",
            plan: {
              category: "SEND_EMAIL_OR_MESSAGE",
              question: "Approve first outreach to Existing Dental?",
              context: packageData.qualificationSummary,
              recommendedChoice: "APPROVE",
              availableChoices: ["APPROVE", "NEEDS_MORE_RESEARCH", "PASS"],
              expectedUpside: "Potential customer conversation.",
              risk: "External representation.",
              targetEntity: {
                type: "SIGNALCARE_PROSPECT",
                name: "Existing Dental"
              }
            }
          },
          db
        )
      ).rejects.toThrow(expectedReason);
      expect(await db.agentDecision.count({ where: { userId } })).toBe(0);
      expect(await db.agentActionRequest.count({ where: { userId } })).toBe(0);
    }
  );

  it("cancels the known Caption Care escalation idempotently and schedules requalification", async () => {
    const now = new Date("2026-08-29T19:00:00.000Z");
    const queue = await db.queueItem.create({
      data: {
        userId,
        title: "Caption Care outreach",
        lane: "signalcare",
        recipient: "Caption Care",
        status: "queued",
        nextAction: "Reach out to Caption Care"
      }
    });
    const work = await db.agentWorkItem.create({
      data: {
        userId,
        projectId: signalProjectId,
        idempotencyKey: "unsafe-caption-care-work",
        title: "Authorize Caption Care outreach",
        objective: "Authorize premature outreach.",
        expectedValue: "Unverified.",
        acceptanceCriteria: "Owner decides.",
        agentRole: "SIGNALCARE_GM",
        actionCategory: "SEND_EMAIL_OR_MESSAGE",
        requiredCapability: "REPOSITORY_READ",
        state: "NEEDS_RYAN"
      }
    });
    const decision = await db.agentDecision.create({
      data: {
        id: "cmtevqx9y0011qk0pf8pk56sz",
        userId,
        projectId: signalProjectId,
        originatingWorkItemId: work.id,
        idempotencyKey: "unsafe-caption-care-decision",
        category: "SEND_EMAIL_OR_MESSAGE",
        question: "Authorize sending outreach after a draft is prepared?",
        context: "Incorrect monitoring-platform positioning.",
        recommendedChoice: "Authorize outreach",
        availableChoices: JSON.stringify([
          "Authorize outreach",
          "Do not authorize outreach; retain the prospect in queue."
        ]),
        risk: "Premature and incorrectly positioned outreach."
      }
    });
    const action = await db.agentActionRequest.create({
      data: {
        userId,
        projectId: signalProjectId,
        workItemId: work.id,
        decisionId: decision.id,
        idempotencyKey: "unsafe-caption-care-action",
        actionFingerprint: "unsafe-caption-care-fingerprint",
        category: "SEND_EMAIL_OR_MESSAGE",
        capability: "SEND_EMAIL_OR_MESSAGE",
        state: "AWAITING_OWNER_APPROVAL",
        boundedPayload: JSON.stringify({ legacy: true }),
        authorizationBounds: JSON.stringify({ oneTime: true })
      }
    });

    expect(
      await recoverPrematureSignalCareOutreachDecisions(userId, db, now)
    ).toEqual([decision.id]);
    expect(
      await recoverPrematureSignalCareOutreachDecisions(userId, db, now)
    ).toEqual([]);
    expect(
      await db.agentDecision.findUniqueOrThrow({ where: { id: decision.id } })
    ).toMatchObject({ status: "CANCELLED" });
    expect(
      await db.agentActionRequest.findUniqueOrThrow({ where: { id: action.id } })
    ).toMatchObject({ state: "CANCELLED", authorizedAt: null, executedAt: null });
    expect(
      await db.agentWorkItem.findUniqueOrThrow({ where: { id: work.id } })
    ).toMatchObject({ state: "PARKED" });
    expect(
      await db.queueItem.findUniqueOrThrow({ where: { id: queue.id } })
    ).toMatchObject({
      status: "queued",
      nextAction:
        "Requalify against canonical SignalCare commercial profile before outreach."
    });
    expect(
      (
        await db.agentProjectConfig.findUniqueOrThrow({
          where: { projectId: signalProjectId }
        })
      ).nextAgentReviewAt?.toISOString()
    ).toBe(now.toISOString());
    expect(
      await db.agentEvent.count({
        where: {
          userId,
          type: "PREMATURE_OWNER_ESCALATION_CANCELLED"
        }
      })
    ).toBe(1);
  });

  it.each([
    "Do not authorize outreach; retain the prospect in queue.",
    "Some unknown prose"
  ])("fails closed for unmapped owner choice: %s", async (choice) => {
    const work = await createWork(`unsafe-choice-work-${choice}`);
    await db.agentWorkItem.update({
      where: { id: work.id },
      data: { state: "NEEDS_RYAN" }
    });
    const decision = await db.agentDecision.create({
      data: {
        userId,
        projectId: signalProjectId,
        originatingWorkItemId: work.id,
        idempotencyKey: `unsafe-choice-decision-${choice}`,
        category: "SEND_EMAIL_OR_MESSAGE",
        question: "Unsafe legacy decision",
        context: "Legacy prose choices.",
        availableChoices: JSON.stringify([choice]),
        risk: "Unknown choice must fail closed."
      }
    });
    const action = await db.agentActionRequest.create({
      data: {
        userId,
        projectId: signalProjectId,
        workItemId: work.id,
        decisionId: decision.id,
        idempotencyKey: `unsafe-choice-action-${choice}`,
        actionFingerprint: `unsafe-choice-fingerprint-${choice}`,
        category: "SEND_EMAIL_OR_MESSAGE",
        capability: "SEND_EMAIL_OR_MESSAGE",
        state: "AWAITING_OWNER_APPROVAL",
        boundedPayload: JSON.stringify({ legacy: true }),
        authorizationBounds: JSON.stringify({ oneTime: true })
      }
    });
    await expect(
      resolveOwnerDecision(userId, decision.id, choice, db)
    ).rejects.toThrow("no safe deterministic resolution mapping");
    expect(
      await db.agentDecision.findUniqueOrThrow({ where: { id: decision.id } })
    ).toMatchObject({ status: "PENDING", selectedChoice: null });
    expect(
      await db.agentWorkItem.findUniqueOrThrow({ where: { id: work.id } })
    ).toMatchObject({ state: "NEEDS_RYAN" });
    expect(
      await db.agentActionRequest.findUniqueOrThrow({ where: { id: action.id } })
    ).toMatchObject({ state: "AWAITING_OWNER_APPROVAL", authorizedAt: null });
  });

  it("maps PASS explicitly to PARKED", async () => {
    await createReadyProspect();
    const work = await createWork("pass-choice-work");
    await db.agentWorkItem.update({
      where: { id: work.id },
      data: { state: "PLANNING" }
    });
    const decision = await createOwnerDecision(
      {
        userId,
        projectId: signalProjectId,
        workItemId: work.id,
        idempotencyKey: "pass-choice-decision",
        profile: "SIGNALCARE_GM",
        plan: {
          category: "SEND_EMAIL_OR_MESSAGE",
          question: "Approve first outreach to Existing Dental?",
          context: "Complete evidence-backed package.",
          recommendedChoice: "APPROVE",
          availableChoices: ["APPROVE", "NEEDS_MORE_RESEARCH", "PASS"],
          expectedUpside: "Potential customer conversation.",
          risk: "External representation.",
          targetEntity: {
            type: "SIGNALCARE_PROSPECT",
            name: "Existing Dental"
          }
        }
      },
      db
    );
    await db.agentWorkItem.update({
      where: { id: work.id },
      data: { state: "NEEDS_RYAN" }
    });
    await resolveOwnerDecision(userId, decision.id, "PASS", db);
    expect(
      await db.agentWorkItem.findUniqueOrThrow({ where: { id: work.id } })
    ).toMatchObject({ state: "PARKED" });
  });

  it("rejects invented SignalCare offers and monitoring-platform positioning", () => {
    expect(
      signalCareResearchCandidateSchema.safeParse({
        ...candidate(1),
        suggestedEntryOffer: "POST_PROCEDURE_MONITORING_PLATFORM"
      }).success
    ).toBe(false);
    expect(
      signalCareResearchCandidateSchema.safeParse({
        ...candidate(1),
        signalCareFit:
          "SignalCare's post-procedure patient monitoring platform would integrate with this vendor."
      }).success
    ).toBe(false);
    expect(
      signalCareQualificationSchema.safeParse({
        ...qualification("Caption Care"),
        recommendedEntryOffer: "post-procedure monitoring platform"
      }).success
    ).toBe(false);
  });

  it("exposes research, qualification, and deterministic readiness separately", async () => {
    await createReadyProspect();
    const snapshot = (await executeProjectTool(
      { userId, projectId: signalProjectId, profile: "SIGNALCARE_GM" },
      "signalcare.pipeline.snapshot",
      {},
      db
    )) as {
      prospects: Array<Record<string, unknown>>;
    };
    expect(snapshot.prospects[0]).toMatchObject({
      stage: "outreach_ready",
      hasProspectResearch: false,
      hasProspectQualification: true,
      qualificationRecommendation: "ADVANCE",
      approvedEntryOffer: "DENTAL_REVENUE_LEAKAGE_DIAGNOSTIC",
      providerBackedProvenance: true,
      hasInternalDraft: true,
      outreachReadinessComplete: true,
      externalOutreachPerformed: false
    });
  });
});
