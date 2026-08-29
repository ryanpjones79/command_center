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
import type { OrchestrationServices } from "@/server/agent/orchestration-service";
import { runAgentOrchestrationCycle } from "@/server/agent/orchestration-service";
import { executeProjectTool } from "@/server/agent/project-tools";
import { claimRunnerWork } from "@/server/agent/runner-service";
import {
  executeSignalCareHostedResearch,
  getSignalCareResearchLimit,
  OpenAiSignalCareResearchClient,
  reclassifySignalCareProspectResearch,
  signalCareResearchCandidateSchema,
  type SignalCareResearchCandidate,
  type SignalCareResearchClient
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
    suggestedEntryOffer: "Operational analytics diagnostic",
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

async function createWork(
  key: string,
  projectId = signalProjectId,
  data: Partial<{
    title: string;
    objective: string;
    requiredCapability: string;
    workspaceIdentifier: string | null;
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

  it("uses Responses API web_search and retains only provider-cited sources", async () => {
    const cited = candidate(1);
    const fabricated = candidate(2);
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [
            {
              type: "web_search_call",
              status: "completed",
              action: {
                sources: cited.sourceUrls.map((url) => ({ url }))
              }
            },
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    candidates: [cited, fabricated],
                    searchSummary: "Official sources checked."
                  }),
                  annotations: cited.sourceUrls.map((url) => ({
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
      cited.organizationName
    ]);
    const request = JSON.parse(
      (fetcher.mock.calls[0]?.[1] as RequestInit).body as string
    ) as Record<string, unknown>;
    expect(request).toMatchObject({
      model: "test-research-model",
      tools: [{ type: "web_search", search_context_size: "medium" }],
      tool_choice: "required",
      include: ["web_search_call.action.sources"]
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
});
