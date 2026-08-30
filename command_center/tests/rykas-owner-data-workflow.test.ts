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
  recoverPrematurelyResolvedRykasOwnerUpdates,
  resolveOwnerDecision,
  retryRykasOwnerFinancialUpdate,
  submitRykasOwnerFinancialUpdate
} from "@/server/agent/work-service";
import { claimRunnerWork, submitRunnerResult } from "@/server/agent/runner-service";

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
  it("reopens the already-resolved production failure and retries without owner re-entry", async () => {
    const { work, decision } = await createReconciliationDecision("premature-resolution-recovery");
    const payload = { version: 1 as const, observedAt: "2026-08-29T12:00:00.000Z", businessCash: { label: "Synthetic cash", amount: 30000 }, debts: null, obligations: { status: "CURRENT_NONE" as const, items: [], note: null }, ownerCertifiedOpenCommitments: { totalOpenCommitments: 22161, note: null }, localInventorySnapshots: null, ownerPolicy: null, poCertification: null };
    await submitRykasOwnerFinancialUpdate(userId, decision.id, payload, db);
    const exactContext = (await db.agentWorkItem.findUniqueOrThrow({ where: { id: work.id } })).operationalContext;
    await db.agentWorkItem.update({ where: { id: work.id }, data: { state: "FAILED", blocker: "Rykas truth unavailable (503).", completedAt: new Date() } });
    await db.agentDecision.update({ where: { id: decision.id }, data: { status: "RESOLVED", selectedChoice: "UPDATED_AND_RECHECK", resultingAction: "Legacy premature resolution", resolvedAt: new Date() } });

    expect((await recoverPrematurelyResolvedRykasOwnerUpdates(userId, db)).recovered).toBe(1);
    expect(await db.agentDecision.findUniqueOrThrow({ where: { id: decision.id } })).toMatchObject({ status: "PENDING", selectedChoice: null });
    expect((await db.agentWorkItem.findUniqueOrThrow({ where: { id: work.id } })).operationalContext).toBe(exactContext);
    await retryRykasOwnerFinancialUpdate(userId, decision.id, db);
    expect(await db.agentWorkItem.findUniqueOrThrow({ where: { id: work.id } })).toMatchObject({ state: "RETRY", operationalContext: exactContext });
    expect(await db.agentActionRequest.count({ where: { decisionId: decision.id } })).toBe(0);
    await db.agentWorkItem.update({ where: { id: work.id }, data: { state: "PARKED", nextEligibleRunAt: null } });
  });

  it("keeps the decision pending across failure, retries the exact payload, and resolves only after SAVED", async () => {
    const { work, decision } = await createReconciliationDecision("reliable-owner-save");
    const debts = Array.from({ length: 13 }, (_, index) => ({
      displayName: `Synthetic debt ${index + 1}`, debtType: "OTHER", pricingType: index === 0 ? "FIXED_FEE" : "APR",
      currentBalance: 1000 + index, apr: index === 0 ? null : 0.2, minimumPayment: 25,
      nextDueDate: null, promotionalRateEnd: null, ownerPriority: index + 1,
      remainingFinancingFee: index === 0 ? 100 : null, remainingTotalRepayment: null,
      paymentCadence: "MONTHLY", requiredPeriodicPayment: 25, notes: null
    }));
    const payload = {
      version: 1 as const, observedAt: "2026-08-29T12:00:00.000Z",
      businessCash: { label: "Synthetic cash", amount: 30000 },
      debts: { status: "CURRENT_ROWS_LOADED" as const, items: debts, note: null },
      obligations: { status: "CURRENT_NONE" as const, items: [], note: null },
      ownerCertifiedOpenCommitments: { totalOpenCommitments: 22161, note: "Synthetic aggregate" },
      localInventorySnapshots: { status: "NOT_AVAILABLE" as const, items: [], note: "Synthetic" },
      ownerPolicy: { minimumOperatingReserve: 7000, minimumDebtPaymentBuffer: 1000, desiredMonthlyExtraDebtPayment: 0, percentOfExcessCashToDebt: 0, maximumDiscretionaryInventoryPercent: 0, maximumBrandConcentrationPercent: null, coreReplenishmentPriority: "CORE_FIRST", speculativeTestBudgetCap: 0, debtStrategy: "OWNER_DEFINED_ORDER" as const, notes: null },
      poCertification: null
    };
    await submitRykasOwnerFinancialUpdate(userId, decision.id, payload, db);
    const queued = await db.agentWorkItem.findUniqueOrThrow({ where: { id: work.id } });
    const exactContext = queued.operationalContext;
    expect(queued).toMatchObject({ state: "QUEUED", requiredCapability: "RYKAS_OWNER_DATA_UPDATE" });
    expect((await db.agentDecision.findUniqueOrThrow({ where: { id: decision.id } })).status).toBe("PENDING");
    expect(await db.agentActionRequest.count({ where: { decisionId: decision.id } })).toBe(0);

    const runner = await db.agentRunner.create({ data: { userId, keyId: `rykas-owner-reliability-${process.pid}`, name: "Rykas owner reliability runner" } });
    const previousFeature = process.env.FEATURE_RUNNER_EXECUTION;
    process.env.FEATURE_RUNNER_EXECUTION = "true";
    try {
      const firstClaim = await claimRunnerWork(runner, { capabilities: ["RYKAS_OWNER_DATA_UPDATE"], version: "test" }, db);
      expect(firstClaim?.operationalContext).toBe(exactContext);
      await submitRunnerResult(runner, work.id, firstClaim!.claimToken, {
        status: "FAILED", summary: "Rykas truth unavailable (503).", filesChanged: [], testsRun: [], testResults: "",
        unresolvedIssues: ["Service unavailable"], evidence: "No SAVED receipt was received.", acceptanceCriteriaSatisfied: false,
        recommendedQaAction: "REPAIR", qaFeedback: "Rykas truth unavailable (503).", providerIdentifier: "rykas-local-owner-data"
      }, db);
      expect((await db.agentDecision.findUniqueOrThrow({ where: { id: decision.id } })).status).toBe("PENDING");
      expect((await db.agentWorkItem.findUniqueOrThrow({ where: { id: work.id } }))).toMatchObject({ state: "RETRY", operationalContext: exactContext });

      await retryRykasOwnerFinancialUpdate(userId, decision.id, db);
      const retried = await db.agentWorkItem.findUniqueOrThrow({ where: { id: work.id } });
      expect(retried.operationalContext).toBe(exactContext);
      expect(retried.attemptCount).toBe(1);
      const secondClaim = await claimRunnerWork(runner, { capabilities: ["RYKAS_OWNER_DATA_UPDATE"], version: "test" }, db);
      expect(secondClaim?.operationalContext).toBe(exactContext);
      await submitRunnerResult(runner, work.id, secondClaim!.claimToken, {
        status: "SUCCEEDED", summary: "Rykas confirmed SAVED.", filesChanged: [], testsRun: [], testResults: "schema valid",
        unresolvedIssues: [], evidence: "Deterministic owner-data receipt.", acceptanceCriteriaSatisfied: true,
        recommendedQaAction: "PASS", providerIdentifier: "rykas-local-owner-data",
        rykasOwnerFinancialUpdateResult: { schemaVersion: "RYKAS_OWNER_FINANCIAL_TRUTH_UPDATE_V1", status: "SAVED", writes: { businessCash: 1, debts: 13, obligations: 0, ownerPolicy: 1, poCertification: 0, ownerCertifiedOpenCommitments: 1, localInventorySnapshots: 1 }, observedAt: payload.observedAt, purchaseAuthorized: false, purchaseExecuted: false, debtPaymentAuthorized: false, debtPaymentExecuted: false, financialCommitmentCreated: false }
      }, db);
      const savedDecision = await db.agentDecision.findUniqueOrThrow({ where: { id: decision.id } });
      expect(savedDecision).toMatchObject({ status: "RESOLVED", selectedChoice: "UPDATED_AND_RECHECK" });
      expect((await db.agentWorkItem.findUniqueOrThrow({ where: { id: work.id } })).state).toBe("DONE");
      expect(await db.agentWorkItem.count({ where: { idempotencyKey: `rykas-financial-recheck:${work.id}` } })).toBe(1);
      expect(await db.agentActionRequest.count({ where: { decisionId: decision.id } })).toBe(0);
    } finally {
      process.env.FEATURE_RUNNER_EXECUTION = previousFeature;
    }
  });

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
