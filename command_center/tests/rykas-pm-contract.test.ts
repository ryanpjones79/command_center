import { describe, expect, it } from "vitest";
import { RYKAS_READ_CAPABILITY } from "@/lib/rykas-truth-contract";
import {
  ModelProjectManagerAgent,
  pmOutputSchema,
  type StructuredModelClient
} from "@/server/agent/model-agents";

const snapshotRequest = {
  version: 1 as const,
  operation: "OPERATIONS_SNAPSHOT" as const,
  input: { limit: 10 }
};
const opportunitiesRequest = {
  version: 1 as const,
  operation: "SOURCING_OPPORTUNITIES" as const,
  input: { view: "OWNER_ACTION_NEEDED" as const, limit: 5 }
};

function output(overrides: Record<string, unknown> = {}) {
  return {
    disposition: "CREATE_WORK",
    currentBottleneck: "Current operating truth needs review.",
    evidence: "The next decision requires a bounded authoritative read.",
    title: "Read current Rykas operations",
    objective: "Read current Rykas truth without changing Rykas.",
    expectedValue: "Give the GM current decision evidence.",
    acceptanceCriteria: "A bounded schema-valid read-only result is returned.",
    agentRole: "RYKAS_TRUTH_READER",
    actionCategory: "RESEARCH_READ_ONLY",
    priority: "HIGH",
    maxAttempts: 2,
    requiredCapability: RYKAS_READ_CAPABILITY,
    sandboxPolicy: "READ_ONLY",
    networkPolicy: "OFF",
    operationalContext: "Review the current Rykas operating snapshot.",
    rykasReadRequest: snapshotRequest,
    researchMode: null,
    targetProspect: null,
    nextReviewMinutes: 15,
    ownerNeeded: false,
    ownerDecision: null,
    ...overrides
  };
}

function client(value: Record<string, unknown>): StructuredModelClient {
  return {
    async generate<T>(input: { validator: { parse(raw: unknown): T } }) {
      return input.validator.parse(value);
    }
  } as StructuredModelClient;
}

function context(profile: string) {
  return {
    profile,
    projectId: "project-1",
    projectName: "Rykas",
    objective: "Increase realized net profit and inventory turns.",
    primaryKpi: null,
    currentBottleneck: "Operating truth needs review.",
    instructions: "Use bounded real-truth reads.",
    autonomyPolicy: "Read-only internal work.",
    escalationPolicy: "Purchases require Ryan.",
    existingWorkTitles: [],
    toolEvidence: []
  };
}

describe("typed Rykas PM read request", () => {
  it("requires the typed field and accepts the canonical snapshot and opportunity requests", () => {
    expect(pmOutputSchema.safeParse(output()).success).toBe(true);
    expect(
      pmOutputSchema.safeParse(
        output({ rykasReadRequest: opportunitiesRequest })
      ).success
    ).toBe(true);
    expect(
      pmOutputSchema.safeParse(output({ rykasReadRequest: null })).success
    ).toBe(false);
  });

  it("rejects invented wrappers, missing fields, and extra keys", () => {
    const invalid = [
      {
        schemaVersion: "RYKAS_TRUTH_READ_V1",
        readOnly: true,
        operation: "OPERATIONS_SNAPSHOT"
      },
      { operation: "OPERATIONS_SNAPSHOT", input: { limit: 10 } },
      { version: 1, operation: "OPERATIONS_SNAPSHOT" },
      {
        version: 1,
        operation: "OPERATIONS_SNAPSHOT",
        input: { limit: 10 },
        readOnly: true
      },
      {
        version: 1,
        operation: "OPERATIONS_SNAPSHOT",
        input: { limit: 10, sql: "SELECT *" }
      }
    ];
    for (const rykasReadRequest of invalid) {
      expect(
        pmOutputSchema.safeParse(output({ rykasReadRequest })).success
      ).toBe(false);
    }
  });

  it("requires null for non-Rykas capabilities", () => {
    expect(
      pmOutputSchema.safeParse(
        output({
          requiredCapability: "REPOSITORY_READ",
          rykasReadRequest: null
        })
      ).success
    ).toBe(true);
    expect(
      pmOutputSchema.safeParse(
        output({ requiredCapability: "REPOSITORY_READ" })
      ).success
    ).toBe(false);
  });

  it("denies Rykas requests from SignalCare and CCHCS profiles", async () => {
    for (const profile of ["SIGNALCARE_GM", "CCHCS_PM"]) {
      await expect(
        new ModelProjectManagerAgent(client(output())).chooseNextWork(
          context(profile)
        )
      ).rejects.toThrow("only for RYKAS_GM");
    }
  });

  it("serializes only the validated typed object into canonical operationalContext", async () => {
    const plan = await new ModelProjectManagerAgent(
      client(
        output({
          operationalContext:
            "This freeform note is not the authoritative wire request.",
          rykasReadRequest: opportunitiesRequest
        })
      )
    ).chooseNextWork(context("RYKAS_GM"));

    expect(plan.rykasReadRequest).toEqual(opportunitiesRequest);
    expect(plan.operationalContext).toBe(
      JSON.stringify(opportunitiesRequest)
    );
    expect(JSON.parse(plan.operationalContext ?? "null")).toEqual(
      opportunitiesRequest
    );
    expect(plan.operationalContext).not.toContain("schemaVersion");
    expect(plan.operationalContext).not.toContain("readOnly");
    expect(plan.ownerNeeded).toBe(false);
  });
});
