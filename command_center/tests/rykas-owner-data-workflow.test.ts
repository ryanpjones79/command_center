import { execFileSync } from "node:child_process";
import { closeSync, existsSync, openSync, rmSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  extractRykasTruthReconciliation,
  rykasTruthReconciliationDecision,
  type RykasTruthReconciliation
} from "@/lib/rykas-owner-data-contract";
import { rykasTruthResultSchema } from "@/lib/rykas-truth-contract";
import { DeterministicProjectManagerAgent } from "@/server/agent/mock-agents";
import {
  BROKEN_RYKAS_OWNER_DATA_DECISION_ID,
  createOwnerDecision,
  reconcilePendingRykasOwnerDecisions,
  recoverBrokenRykasOwnerDataDecision,
  recoverPrematurelyResolvedRykasOwnerUpdates,
  resolveOwnerDecision,
  retryRykasOwnerFinancialUpdate,
  submitRykasOwnerFinancialUpdate
} from "@/server/agent/work-service";
import { claimRunnerWork, submitRunnerResult } from "@/server/agent/runner-service";
import { financialSnapshotV11Fixture } from "../../ryanos-agent-runner/tests/fixtures/financial-snapshot-v1-1";

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

beforeEach(async () => {
  if (!db) return;
  await db.agentDecision.updateMany({
    where: { userId, status: "PENDING" },
    data: {
      status: "CANCELLED",
      resultingAction: "Test isolation cleanup.",
      resolvedAt: new Date()
    }
  });
  await db.agentWorkItem.updateMany({
    where: { userId, state: "NEEDS_RYAN" },
    data: { state: "PARKED", completedAt: new Date() }
  });
});

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

function currentDebtMinimumTruth(observedAt: string) {
  const financialSnapshot = JSON.parse(
    JSON.stringify(financialSnapshotV11Fixture)
  );
  financialSnapshot.asOf = observedAt;
  financialSnapshot.missingInputs = ["DEBT"];
  financialSnapshot.capitalPlan.asOf = observedAt;
  financialSnapshot.capitalPlan.missingInputs = ["DEBT"];
  financialSnapshot.capitalPlan.blockers = [
    "One active debt lacks minimum-payment truth."
  ];
  financialSnapshot.checklist = financialSnapshot.checklist.map(
    (item: { inputKey: string; status: string; observedAt: string | null; reason: string | null }) =>
    item.inputKey === "AMAZON_SALES_INVENTORY"
      ? {
          ...item,
          status: "CURRENT" as const,
          observedAt,
          reason: null
        }
      : item
  );
  return rykasTruthResultSchema.parse({
    schemaVersion: "RYKAS_TRUTH_READ_V1",
    operation: "OPERATIONS_SNAPSHOT",
    readOnly: true,
    purchaseAuthorized: false,
    purchaseExecuted: false,
    observedAt,
    authoritativeSource:
      "Rykas SQL Server database rykas via loopback Command Center marts",
    sourceUpdatedAt: observedAt,
    freshness: "STALE",
    stale: true,
    data: {
      actionSummary: [],
      capital: {
        reliable: false,
        status: "BLOCKED",
        reason: "Legacy PO detail is not verified.",
        actionRequired: "Confirm legacy PO truth.",
        asOf: observedAt,
        openCommitments: 0,
        purchaseOrderRows: 0,
        openPurchaseOrderLines: 0,
        poLedgerStatus: "NOT VERIFIED",
        poCertificationState: "NOT VERIFIED",
        poCertifiedAt: null,
        poTruthCurrent: false,
        safeInventoryCapital: null
      },
      opportunities: [],
      purchaseCandidates: [],
      blockers: [],
      detail: null,
      financialSnapshot,
      capitalPlan: null,
      replenishmentCandidates: null,
      capitalReleaseCandidates: null,
      saleEventEvaluation: null
    }
  });
}

async function persistFinancialSnapshot(key: string, observedAt: string) {
  const truth = currentDebtMinimumTruth(observedAt);
  const work = await db.agentWorkItem.create({
    data: {
      userId,
      projectId,
      idempotencyKey: `financial-snapshot-work:${key}`,
      title: "Read authoritative Rykas financial snapshot",
      objective: "Read current Rykas financial truth.",
      expectedValue: "Canonical financial evidence.",
      acceptanceCriteria: "Schema-valid FINANCIAL_SNAPSHOT.",
      agentRole: "RYKAS_CFO_CAPITAL_STEWARD",
      actionCategory: "RESEARCH_READ_ONLY",
      requiredCapability: "RYKAS_OPERATIONS_READ",
      sandboxPolicy: "READ_ONLY",
      networkPolicy: "LOCALHOST_ONLY",
      operationalContext: JSON.stringify({
        version: 1,
        operation: "FINANCIAL_SNAPSHOT",
        input: {}
      }),
      state: "DONE",
      completedAt: new Date(observedAt)
    }
  });
  const run = await db.agentRun.create({
    data: {
      userId,
      projectId,
      workItemId: work.id,
      idempotencyKey: `financial-snapshot-run:${key}`,
      role: "RYKAS_CFO_CAPITAL_STEWARD",
      runType: "EXECUTION",
      status: "SUCCEEDED",
      providerIdentifier: "rykas-local-truth",
      structuredOutcome: JSON.stringify(truth),
      completedAt: new Date(observedAt)
    }
  });
  return { truth, work, run };
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

  it("gives the current V1.1 snapshot precedence over stale legacy PO and capital fields", () => {
    const truth = currentDebtMinimumTruth("2026-09-01T12:00:00.000Z");
    const request = extractRykasTruthReconciliation([
      {
        toolId: "rykas.operations.snapshot",
        output: { realTruth: truth }
      }
    ]);

    expect(request).toMatchObject({
      truthArea: "DEBT_MINIMUM",
      openCommitments: 22161,
      safeInventoryCapital: null,
      requestedFields: ["DEBT:13:minimumPayment"],
      missingDebtMinimums: [
        {
          debtId: 13,
          displayName: "Synthetic acceptance debt",
          currentBalance: 469143
        }
      ],
      currentFinancialFacts: {
        settledCash: 30000,
        protectedCommitments: 22161,
        knownInventoryAtCost: 42885.38,
        totalDebt: 469143
      }
    });
    expect(request?.requiredOwnerAction).toContain(
      "Synthetic acceptance debt"
    );
    expect(request?.requiredOwnerAction).not.toMatch(/PO|cash|inventory/i);
  });

  it("does not create owner reconciliation from legacy null safe capital or unverified PO detail", () => {
    const truth = currentDebtMinimumTruth("2026-09-01T13:00:00.000Z");
    const raw = JSON.parse(JSON.stringify(truth));
    raw.data.financialSnapshot.missingInputs = ["AMAZON_SALES_INVENTORY"];
    raw.data.financialSnapshot.capitalPlan.missingInputs = [
      "AMAZON_SALES_INVENTORY"
    ];
    raw.data.financialSnapshot.checklist = raw.data.financialSnapshot.checklist.map(
      (item: { inputKey: string; status: string; reason: string | null }) =>
        item.inputKey === "DEBT"
          ? { ...item, status: "CURRENT", reason: null }
          : item
    );
    const currentSystemOnlyTruth = rykasTruthResultSchema.parse(raw);

    expect(
      extractRykasTruthReconciliation([
        {
          toolId: "rykas.operations.snapshot",
          output: { realTruth: currentSystemOnlyTruth }
        }
      ])
    ).toBeNull();
  });

  it("does not reopen a failed historical save when newer authoritative truth supersedes its owner request", async () => {
    const { work, decision } = await createReconciliationDecision(
      "historical-save-superseded"
    );
    const payload = {
      version: 1 as const,
      observedAt: "2026-08-30T12:00:00.000Z",
      businessCash: { label: "Synthetic cash", amount: 30000 },
      debts: null,
      obligations: {
        status: "CURRENT_NONE" as const,
        items: [],
        note: null
      },
      ownerCertifiedOpenCommitments: {
        totalOpenCommitments: 22161,
        note: null
      },
      localInventorySnapshots: null,
      ownerPolicy: null,
      poCertification: null
    };
    await submitRykasOwnerFinancialUpdate(userId, decision.id, payload, db);
    await db.agentWorkItem.update({
      where: { id: work.id },
      data: {
        state: "FAILED",
        blocker: "Historical loopback failure.",
        completedAt: new Date("2026-08-30T13:00:00.000Z")
      }
    });
    await db.agentDecision.update({
      where: { id: decision.id },
      data: {
        status: "RESOLVED",
        selectedChoice: "UPDATED_AND_RECHECK",
        resultingAction: "Legacy premature resolution",
        resolvedAt: new Date("2026-08-30T13:00:00.000Z")
      }
    });
    const latest = await persistFinancialSnapshot(
      "historical-save-superseded",
      "2026-09-01T14:00:00.000Z"
    );
    const structuredOutcomeBefore = latest.run.structuredOutcome;

    expect(
      await recoverPrematurelyResolvedRykasOwnerUpdates(userId, db)
    ).toMatchObject({ recovered: 0, superseded: 1 });
    expect(
      await db.agentDecision.findUniqueOrThrow({ where: { id: decision.id } })
    ).toMatchObject({
      status: "CANCELLED",
      selectedChoice: "UPDATED_AND_RECHECK"
    });
    expect(
      await db.agentEvent.count({
        where: {
          idempotencyKey: `rykas-owner-decision-superseded:${decision.id}`
        }
      })
    ).toBe(1);
    expect(
      (
        await db.agentRun.findUniqueOrThrow({ where: { id: latest.run.id } })
      ).structuredOutcome
    ).toBe(structuredOutcomeBefore);
    expect(
      await db.agentActionRequest.count({ where: { decisionId: decision.id } })
    ).toBe(0);
  });

  it("supersedes obsolete pending cards from newer truth with an idempotent audit event", async () => {
    const { work, decision } = await createReconciliationDecision(
      "obsolete-pending"
    );
    await persistFinancialSnapshot(
      "obsolete-pending",
      "2026-09-02T14:00:00.000Z"
    );

    expect(
      await reconcilePendingRykasOwnerDecisions(userId, db)
    ).toEqual({ superseded: 1 });
    expect(
      await reconcilePendingRykasOwnerDecisions(userId, db)
    ).toEqual({ superseded: 0 });
    expect(
      await db.agentDecision.findUniqueOrThrow({ where: { id: decision.id } })
    ).toMatchObject({ status: "CANCELLED", selectedChoice: null });
    expect(
      await db.agentWorkItem.findUniqueOrThrow({ where: { id: work.id } })
    ).toMatchObject({ state: "PARKED" });
    expect(
      await db.agentEvent.count({
        where: {
          idempotencyKey: `rykas-owner-decision-superseded:${decision.id}`
        }
      })
    ).toBe(1);
  });

  it("reuses one equivalent narrow debt request across PM cycles without an action request", async () => {
    const truth = currentDebtMinimumTruth("2026-09-03T14:00:00.000Z");
    const narrowRequest = extractRykasTruthReconciliation([
      {
        toolId: "rykas.operations.snapshot",
        output: { realTruth: truth }
      }
    ])!;
    const firstWork = await ownerWork("work:narrow-dedupe-1");
    const first = await createOwnerDecision(
      {
        userId,
        projectId,
        workItemId: firstWork.id,
        idempotencyKey: "decision:narrow-dedupe-1",
        profile: "RYKAS_GM",
        plan: rykasTruthReconciliationDecision(narrowRequest)
      },
      db
    );
    const secondWork = await ownerWork("work:narrow-dedupe-2");
    const second = await createOwnerDecision(
      {
        userId,
        projectId,
        workItemId: secondWork.id,
        idempotencyKey: "decision:narrow-dedupe-2",
        profile: "RYKAS_GM",
        plan: rykasTruthReconciliationDecision(narrowRequest)
      },
      db
    );

    expect(second.id).toBe(first.id);
    expect(
      await db.agentDecision.count({
        where: { userId, projectId, status: "PENDING" }
      })
    ).toBe(1);
    expect(
      await db.agentWorkItem.findUniqueOrThrow({
        where: { id: secondWork.id }
      })
    ).toMatchObject({ state: "PARKED" });
    expect(
      await db.agentActionRequest.count({ where: { decisionId: first.id } })
    ).toBe(0);
  });
});
