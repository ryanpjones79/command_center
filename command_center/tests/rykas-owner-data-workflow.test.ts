import { execFileSync } from "node:child_process";
import { closeSync, existsSync, openSync, rmSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  rykasTruthReconciliationDecision,
  type RykasTruthReconciliation
} from "@/lib/rykas-owner-data-contract";
import { DeterministicProjectManagerAgent } from "@/server/agent/mock-agents";
import {
  BROKEN_RYKAS_OWNER_DATA_DECISION_ID,
  createOwnerDecision,
  recoverBrokenRykasOwnerDataDecision,
  resolveOwnerDecision
} from "@/server/agent/work-service";

const databasePath = path.join(
  process.cwd(),
  `.rykas-owner-data-${process.pid}.db`
);
const databaseUrl = `file:${databasePath.replaceAll("\\", "/")}`;
let db: PrismaClient;
let userId: string;
let projectId: string;

const ownerData: RykasTruthReconciliation = {
  kind: "RYKAS_TRUTH_RECONCILIATION",
  truthArea: "PO_AND_CAPITAL",
  observedAt: "2026-08-29T20:00:00.000Z",
  sourceUpdatedAt: "2026-08-26T00:00:00.000Z",
  poTruthCurrent: false,
  poLedgerStatus: "NOT VERIFIED",
  poCertificationState: "NOT VERIFIED",
  poCertifiedAt: "2026-08-21T19:00:00.000Z",
  openCommitments: 0,
  safeInventoryCapital: null,
  requiredOwnerAction: "ACTION REQUIRED — Confirm PO ledger status."
};

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
    data: { email: "rykas-owner-data@example.com", passwordHash: "test" }
  });
  userId = user.id;
  const domain = await db.executionDomain.create({
    data: { userId, name: "Rykas", slug: "rykas", isDefault: true }
  });
  const project = await db.executionProject.create({
    data: { userId, domainId: domain.id, name: "Rykas" }
  });
  projectId = project.id;
  await db.agentProjectConfig.create({
    data: {
      userId,
      projectId,
      profile: "RYKAS_GM",
      operatingMode: "LIVE_INTERNAL",
      enabled: true,
      objective: "Increase realized Rykas profit safely.",
      projectManagerInstructions: "Use authoritative Rykas truth.",
      autonomyPolicy: "Read-only internal work.",
      escalationPolicy: "Purchases require separate owner authorization.",
      workspaceIdentifier: "rykas-repo",
      maxConcurrentWorkItems: 1
    }
  });
}, 60_000);

afterAll(async () => {
  await db?.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const target = `${databasePath}${suffix}`;
    if (existsSync(target)) rmSync(target);
  }
});

async function ownerWork(key: string) {
  return db.agentWorkItem.create({
    data: {
      userId,
      projectId,
      idempotencyKey: key,
      title: "Rykas buying blocked",
      objective: "Resolve an owner-data dependency.",
      expectedValue: "Restore authoritative buying-budget truth.",
      acceptanceCriteria: "Only Rykas truth can clear the blocker.",
      agentRole: "RYKAS_GM",
      actionCategory: "RESEARCH_READ_ONLY",
      requiredCapability: "REPOSITORY_READ",
      sandboxPolicy: "READ_ONLY",
      networkPolicy: "OFF",
      state: "NEEDS_RYAN",
      maxAttempts: 1
    }
  });
}

async function createReconciliationDecision(key: string) {
  const work = await ownerWork(`work:${key}`);
  const decision = await createOwnerDecision(
    {
      userId,
      projectId,
      workItemId: work.id,
      idempotencyKey: `decision:${key}`,
      profile: "RYKAS_GM",
      plan: rykasTruthReconciliationDecision(ownerData)
    },
    db
  );
  return { work, decision };
}

describe("Rykas owner-data reconciliation", () => {
  it("rejects unsupported production choices before persistence", async () => {
    const before = await db.agentDecision.count();
    await expect(
      createOwnerDecision(
        {
          userId,
          projectId,
          idempotencyKey: "unsupported-production-choices",
          profile: "RYKAS_GM",
          plan: {
            category: "PURCHASE_INVENTORY",
            question: "Can you certify the current PO ledger status?",
            context: "Broken production proposal",
            recommendedChoice: "PO ledger is current and certified",
            availableChoices: [
              "PO ledger is current and certified",
              "PO ledger requires reconciliation",
              "Available inventory capital is unknown"
            ],
            expectedUpside: "Unblock sourcing.",
            risk: "Unsupported choices cannot resolve safely.",
            createsActionRequest: false
          }
        },
        db
      )
    ).rejects.toThrow("safe deterministic resolution mapping");
    expect(await db.agentDecision.count()).toBe(before);
  });

  it("creates an informational owner-data decision with no action request", async () => {
    const { decision } = await createReconciliationDecision("no-action");
    expect(decision.category).toBe("RESEARCH_READ_ONLY");
    expect(
      await db.agentActionRequest.count({ where: { decisionId: decision.id } })
    ).toBe(0);
    expect(
      await db.agentActionRequest.count({
        where: { category: "PURCHASE_INVENTORY" }
      })
    ).toBe(0);
  });

  it("UPDATED_AND_RECHECK queues one fresh bounded authoritative read without certifying truth", async () => {
    const { work, decision } = await createReconciliationDecision("recheck");
    const resolved = await resolveOwnerDecision(
      userId,
      decision.id,
      "UPDATED_AND_RECHECK",
      db
    );
    const updatedWork = await db.agentWorkItem.findUniqueOrThrow({
      where: { id: work.id }
    });
    const config = await db.agentProjectConfig.findUniqueOrThrow({
      where: { projectId }
    });
    expect(resolved.selectedChoice).toBe("UPDATED_AND_RECHECK");
    expect(resolved.resultingAction).toContain("did not certify PO truth");
    expect(updatedWork).toMatchObject({
      state: "QUEUED",
      requiredCapability: "RYKAS_OPERATIONS_READ",
      sandboxPolicy: "READ_ONLY",
      networkPolicy: "LOCALHOST_ONLY",
      workspaceIdentifier: "rykas-repo"
    });
    expect(JSON.parse(updatedWork.operationalContext!)).toEqual({
      version: 1,
      operation: "OPERATIONS_SNAPSHOT",
      input: { limit: 10 }
    });
    expect(config.nextAgentReviewAt).not.toBeNull();
    expect(JSON.parse(resolved.context)).toMatchObject({
      poTruthCurrent: false,
      safeInventoryCapital: null,
      poLedgerStatus: "NOT VERIFIED",
      poCertificationState: "NOT VERIFIED"
    });
    expect(
      await db.agentActionRequest.count({ where: { decisionId: decision.id } })
    ).toBe(0);
    await db.agentWorkItem.update({
      where: { id: work.id },
      data: { state: "PARKED" }
    });
  });

  it.each([
    "REQUIRES_RECONCILIATION",
    "CAPITAL_UNKNOWN"
  ] as const)("%s parks without a hot loop or purchase", async (choice) => {
    const before = new Date();
    const { work, decision } = await createReconciliationDecision(
      choice.toLowerCase()
    );
    await resolveOwnerDecision(userId, decision.id, choice, db);
    const [updatedWork, config] = await Promise.all([
      db.agentWorkItem.findUniqueOrThrow({ where: { id: work.id } }),
      db.agentProjectConfig.findUniqueOrThrow({ where: { projectId } })
    ]);
    expect(updatedWork.state).toBe("PARKED");
    expect(updatedWork.nextEligibleRunAt).toBeNull();
    expect(config.nextAgentReviewAt!.getTime()).toBeGreaterThan(
      before.getTime() + 6 * 24 * 60 * 60 * 1000
    );
    expect(
      await db.agentActionRequest.count({ where: { decisionId: decision.id } })
    ).toBe(0);
  });

  it("keeps stale or null-capital rereads blocked instead of treating the click as evidence", async () => {
    const plan = await new DeterministicProjectManagerAgent().chooseNextWork({
      profile: "RYKAS_GM",
      projectId,
      projectName: "Rykas",
      objective: "Increase realized Rykas profit safely.",
      primaryKpi: null,
      currentBottleneck: "PO truth stale",
      instructions: "Use authoritative Rykas truth.",
      autonomyPolicy: "Read-only.",
      escalationPolicy: "Owner data is not purchase authorization.",
      existingWorkTitles: [],
      operatingMode: "LIVE_INTERNAL",
      toolEvidence: [
        {
          toolId: "rykas.operations.snapshot",
          summary: "Fresh read completed but capital remains blocked.",
          output: {
            realTruth: {
              observedAt: ownerData.observedAt,
              sourceUpdatedAt: ownerData.sourceUpdatedAt,
              stale: true,
              purchaseExecuted: false,
              data: {
                capital: {
                  reliable: false,
                  poTruthCurrent: false,
                  poLedgerStatus: "NOT VERIFIED",
                  poCertificationState: "NOT VERIFIED",
                  poCertifiedAt: ownerData.poCertifiedAt,
                  openCommitments: 0,
                  safeInventoryCapital: null,
                  reason: "Critical owner cash or PO data is missing/stale."
                },
                purchaseCandidates: []
              }
            }
          }
        }
      ]
    });
    expect(plan.ownerDecision?.ownerDataRequest).toMatchObject({
      poTruthCurrent: false,
      safeInventoryCapital: null
    });
    expect(plan.ownerDecision?.category).toBe("RESEARCH_READ_ONLY");
    expect(plan.ownerDecision?.createsActionRequest).toBe(false);
  });

  it("cancels the exact broken production decision idempotently and schedules review", async () => {
    const work = await ownerWork("broken-production-work");
    const decision = await db.agentDecision.create({
      data: {
        id: BROKEN_RYKAS_OWNER_DATA_DECISION_ID,
        userId,
        projectId,
        originatingWorkItemId: work.id,
        idempotencyKey: "broken-production-decision",
        category: "PURCHASE_INVENTORY",
        question: "Can you certify the current PO ledger status?",
        context: "Broken production decision",
        recommendedChoice: "PO ledger is current and certified",
        availableChoices: JSON.stringify([
          "PO ledger is current and certified",
          "PO ledger requires reconciliation",
          "Available inventory capital is unknown"
        ]),
        risk: "Dead owner workflow"
      }
    });
    await db.agentActionRequest.create({
      data: {
        userId,
        projectId,
        workItemId: work.id,
        decisionId: decision.id,
        idempotencyKey: "action:broken-production-decision",
        actionFingerprint: "broken-production-decision-fingerprint",
        category: "PURCHASE_INVENTORY",
        capability: "PURCHASE",
        state: "AWAITING_OWNER_APPROVAL",
        boundedPayload: "{}",
        authorizationBounds: "{}"
      }
    });

    expect(
      await recoverBrokenRykasOwnerDataDecision(userId, db)
    ).toMatchObject({ recovered: true });
    expect(
      await recoverBrokenRykasOwnerDataDecision(userId, db)
    ).toMatchObject({ recovered: false, reason: "ALREADY_RECOVERED" });
    const [recoveredDecision, recoveredWork, action, config] =
      await Promise.all([
        db.agentDecision.findUniqueOrThrow({ where: { id: decision.id } }),
        db.agentWorkItem.findUniqueOrThrow({ where: { id: work.id } }),
        db.agentActionRequest.findUniqueOrThrow({
          where: { idempotencyKey: "action:broken-production-decision" }
        }),
        db.agentProjectConfig.findUniqueOrThrow({ where: { projectId } })
      ]);
    expect(recoveredDecision).toMatchObject({
      status: "CANCELLED",
      selectedChoice: null
    });
    expect(recoveredWork.state).toBe("PARKED");
    expect(action).toMatchObject({
      state: "CANCELLED",
      decisionId: null,
      authorizedAt: null,
      executedAt: null
    });
    expect(config.nextAgentReviewAt).not.toBeNull();
    expect(
      await db.agentEvent.count({
        where: {
          idempotencyKey: `rykas-broken-decision-recovered:${decision.id}`
        }
      })
    ).toBe(1);
    expect(
      await db.agentActionRequest.count({
        where: { executedAt: { not: null } }
      })
    ).toBe(0);
  });
});
