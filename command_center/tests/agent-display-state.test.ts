import { describe, expect, it } from "vitest";
import type { AgentProjectDisplayInput } from "@/server/agent/display-state";
import {
  containsOwnerDecisionLanguage,
  deriveAgentPortfolioDisplay,
  deriveAgentProjectDisplayState
} from "@/server/agent/display-state";
import {
  buildAgentDecisionPresentation,
  decisionPrimaryText
} from "@/lib/agent-decision-display";
import { serializeRykasTruthReconciliation } from "@/lib/rykas-owner-data-contract";
import { financialSnapshotV11Fixture } from "../../ryanos-agent-runner/tests/fixtures/financial-snapshot-v1-1";

const now = new Date("2026-08-29T18:00:00.000Z");

function baseInput(
  overrides: Partial<AgentProjectDisplayInput> = {}
): AgentProjectDisplayInput {
  return {
    projectId: "project-1",
    profile: "GENERIC_PM",
    enabled: true,
    pausedAt: null,
    health: "ON_TRACK",
    currentBottleneck: null,
    maxConcurrentWorkItems: 2,
    lastAgentReviewAt: new Date("2026-08-29T17:00:00.000Z"),
    nextAgentReviewAt: new Date("2026-08-29T19:00:00.000Z"),
    project: {
      name: "Example",
      agentWorkItems: [],
      agentDecisions: [],
      agentEvents: []
    },
    ...overrides
  };
}

function workItem(
  overrides: Partial<
    AgentProjectDisplayInput["project"]["agentWorkItems"][number]
  > = {}
) {
  const at = new Date("2026-08-29T17:00:00.000Z");
  return {
    id: "work-1",
    title: "Bounded work",
    state: "DONE" as const,
    requiredCapability: "REPOSITORY_READ",
    operationalContext: null,
    blocker: null,
    resultSummary: "Bounded work completed.",
    attemptCount: 1,
    maxAttempts: 2,
    createdAt: at,
    updatedAt: at,
    completedAt: at,
    runs: [],
    ...overrides
  };
}

function signalCareInput(): AgentProjectDisplayInput {
  const context = JSON.stringify({
    researchMode: "QUALIFY_EXISTING_PROSPECT",
    targetProspect: "Heritage Provider Network",
    instructions: "Resolve public provenance."
  });
  return baseInput({
    projectId: "signalcare",
    profile: "SIGNALCARE_GM",
    health: "BLOCKED",
    currentBottleneck: "Qualified prospect needs owner-approved outreach",
    project: {
      name: "SignalCare",
      agentDecisions: [],
      agentEvents: [],
      agentWorkItems: [
        workItem({
          id: "heritage-1",
          title: "Qualify Heritage Provider Network",
          state: "FAILED",
          requiredCapability: "SIGNALCARE_PUBLIC_WEB_RESEARCH",
          operationalContext: context,
          blocker:
            "SignalCare qualification returned inadequate provider provenance.",
          resultSummary: null,
          updatedAt: new Date("2026-08-29T16:00:00.000Z"),
          completedAt: new Date("2026-08-29T16:00:00.000Z")
        }),
        workItem({
          id: "heritage-2",
          title: "Follow up Heritage Provider Network qualification",
          state: "FAILED",
          requiredCapability: "SIGNALCARE_PUBLIC_WEB_RESEARCH",
          operationalContext: context,
          blocker:
            "SignalCare qualification returned inadequate provider provenance.",
          resultSummary: null,
          updatedAt: new Date("2026-08-29T17:00:00.000Z"),
          completedAt: new Date("2026-08-29T17:00:00.000Z")
        })
      ]
    }
  });
}

function rykasTruth(capitalOverrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "RYKAS_TRUTH_READ_V1",
    operation: "OPERATIONS_SNAPSHOT",
    readOnly: true,
    purchaseAuthorized: false,
    purchaseExecuted: false,
    observedAt: "2026-08-29T17:30:00.000Z",
    authoritativeSource: "Rykas read-only local truth adapter",
    sourceUpdatedAt: "2026-08-29T17:25:00.000Z",
    freshness: "CURRENT",
    stale: false,
    data: {
      actionSummary: [],
      capital: {
        reliable: false,
        status: "BLOCKED",
        reason: "PO truth stale",
        actionRequired: "Update authoritative PO/capital truth.",
        asOf: "2026-08-29",
        openCommitments: 0,
        purchaseOrderRows: 0,
        openPurchaseOrderLines: 0,
        poLedgerStatus: "NOT VERIFIED",
        poCertificationState: "NOT VERIFIED",
        poCertifiedAt: "2026-08-20T00:00:00.000Z",
        poTruthCurrent: false,
        safeInventoryCapital: null,
        ...capitalOverrides
      },
      opportunities: [],
      purchaseCandidates: [],
      blockers: [],
      detail: null
    }
  };
}

function rykasInput(
  capitalOverrides: Record<string, unknown> = {}
): AgentProjectDisplayInput {
  const completedAt = new Date("2026-08-29T17:30:00.000Z");
  return baseInput({
    projectId: "rykas",
    profile: "RYKAS_GM",
    health: "ON_TRACK",
    currentBottleneck: "A bounded outbound Rykas truth read was queued.",
    project: {
      name: "Rykas",
      agentDecisions: [],
      agentEvents: [],
      agentWorkItems: [
        workItem({
          id: "rykas-read",
          title: "Read bounded Rykas truth: OPERATIONS_SNAPSHOT",
          requiredCapability: "RYKAS_OPERATIONS_READ",
          resultSummary: "Adapter completed.",
          updatedAt: completedAt,
          completedAt,
          runs: [
            {
              id: "run-rykas",
              runType: "RYKAS_TRUTH_READ",
              status: "SUCCEEDED",
              operationalResultSummary: "Adapter completed.",
              structuredOutcome: JSON.stringify(rykasTruth(capitalOverrides)),
              startedAt: new Date("2026-08-29T17:29:00.000Z"),
              completedAt
            }
          ]
        })
      ]
    }
  });
}

function rykasV11Input(snapshot: unknown = financialSnapshotV11Fixture) {
  const input = rykasInput();
  const outcome = rykasTruth();
  (outcome.data as Record<string, unknown>).financialSnapshot = snapshot;
  input.project.agentWorkItems[0]!.runs[0]!.structuredOutcome = JSON.stringify(outcome);
  return input;
}

describe("canonical Agent HQ display state", () => {
  it("reconciles current V1.1 owner truth and reports only genuine blockers", () => {
    const state = deriveAgentProjectDisplayState(rykasV11Input(), now);
    expect(state.displayBottleneck).toContain("Amazon source data needs refresh");
    expect(state.displayBottleneck).toContain("minimum-payment truth");
    expect(state.displayBottleneck).not.toMatch(/BUSINESS_CASH|OBLIGATIONS|OWNER_POLICY|PO_COMMITMENTS/);
    expect(state.supportingState).toMatchObject({
      financialHealth: "BLOCKED", settledCash: 30000, protectedCommitments: 22161,
      knownInventoryAtCost: 42885.38, totalDebt: 469143,
      currentBlockers: ["Amazon source data needs refresh.", "One active debt lacks minimum-payment truth."]
    });
  });

  it("treats unknown local inventory as partial/watch without blocking core replenishment", () => {
    const snapshot = {
      ...financialSnapshotV11Fixture,
      status: "READY",
      missingInputs: [],
      capitalPlan: { ...financialSnapshotV11Fixture.capitalPlan, status: "READY", missingInputs: [], blockers: [], grossCash: 30000, committedCapital: 22161, openObligations: 0, minimumDebtObligations: 0, debtPaymentBuffer: 0, operatingReserve: 0, coreReplenishmentReserve: 0, coreReplenishmentShortfall: 0, plannedExtraDebtReduction: 0, preliminaryFreeCapital: 7839, safeBuyingCapacity: 0, coreReplenishmentBudget: 0, growthInventoryBudget: 0, opportunisticSaleBudget: 0, speculativeTestBudget: 0, remainingBuffer: 7839 },
      financialHealth: { status: "PARTIAL", reasons: ["Local inventory capital is unknown or stale; discretionary inventory confidence is reduced, but core replenishment is not blocked solely for this reason."] },
      weeklyCapitalPlan: { ...financialSnapshotV11Fixture.weeklyCapitalPlan, status: "READY", coreReplenishment: 0, growthInventory: 0, saleEventInventory: 0, debtReduction: 0, holdAsReserve: 7839 },
      capitalPosition: { ...financialSnapshotV11Fixture.capitalPosition, safeBuyingCapacity: 0 }
    };
    const state = deriveAgentProjectDisplayState(rykasV11Input(snapshot), now);
    expect(state.supportingState?.kind).toBe("RYKAS_TRUTH");
    expect(
      state.supportingState?.kind === "RYKAS_TRUTH"
        ? state.supportingState.financialHealth
        : null
    ).toBe("PARTIAL");
    expect(state.displayBottleneck).toContain("core replenishment is not blocked solely");
    expect(state.displayBottleneck).not.toContain("owner");
  });
  it("cannot display an owner-decision blocker when pending owner decisions are zero", () => {
    const state = deriveAgentProjectDisplayState(
      baseInput({
        health: "BLOCKED",
        currentBottleneck:
          "SignalCare is blocked on an unrecorded owner outreach decision."
      }),
      now
    );
    expect(state.pendingOwnerDecisionCount).toBe(0);
    expect(state.ownerAttentionRequired).toBe(false);
    expect(containsOwnerDecisionLanguage(state.displayBottleneck)).toBe(false);
    expect(state.displayHealth).not.toBe("BLOCKED");
  });

  it("shows Heritage as evidence-exhausted, not outreach-ready or NEED RYAN", () => {
    const state = deriveAgentProjectDisplayState(signalCareInput(), now);
    expect(state).toMatchObject({
      displayHealth: "NEEDS_ATTENTION",
      displayBottleneck:
        "Public evidence remains inadequate after two bounded qualification attempts for Heritage Provider Network.",
      displayLatestOutcome:
        "Qualification follow-up exhausted; Heritage Provider Network is not outreach-ready.",
      ownerAttentionRequired: false,
      pendingOwnerDecisionCount: 0
    });
    expect(state.displayBottleneck).not.toContain("owner-approved outreach");
  });

  it("lets a terminal insufficient-evidence pass and new discovery supersede exhausted qualification", () => {
    const input = signalCareInput();
    input.health = "ON_TRACK";
    input.currentBottleneck =
      "SignalCare needs the next evidence-backed prospect for bounded qualification.";
    input.project.agentEvents.push({
      id: "heritage-terminal",
      type: "SIGNALCARE_QUALIFICATION_EXHAUSTED",
      summary:
        "Heritage Provider Network marked PASS_INSUFFICIENT_EVIDENCE after two bounded qualification attempts; SignalCare immediately evaluated the next acquisition work without an owner decision or outreach.",
      metadata: JSON.stringify({
        outcome: "PASS_INSUFFICIENT_EVIDENCE",
        targetProspect: "Heritage Provider Network"
      }),
      createdAt: new Date("2026-08-29T17:01:00.000Z")
    });
    input.project.agentWorkItems.push(
      workItem({
        id: "next-discovery",
        title: "Discover the next evidence-backed SignalCare prospects",
        state: "QUEUED",
        requiredCapability: "SIGNALCARE_PUBLIC_WEB_RESEARCH",
        operationalContext: JSON.stringify({
          researchMode: "DISCOVER_PROSPECTS",
          targetProspect: null
        }),
        resultSummary: null,
        createdAt: new Date("2026-08-29T17:01:00.000Z"),
        updatedAt: new Date("2026-08-29T17:01:00.000Z"),
        completedAt: null
      })
    );

    const state = deriveAgentProjectDisplayState(input, now);

    expect(state).toMatchObject({
      displayHealth: "ON_TRACK",
      displayBottleneck:
        "SignalCare needs the next evidence-backed prospect for bounded qualification.",
      ownerAttentionRequired: false,
      pendingOwnerDecisionCount: 0,
      machineWorkState: { activeCount: 1 }
    });
    expect(state.displayLatestOutcome).toContain(
      "PASS_INSUFFICIENT_EVIDENCE"
    );
  });

  it("keeps an ordinary SignalCare no-match batch on track and searching", () => {
    const input = baseInput({
      projectId: "signalcare-searching",
      profile: "SIGNALCARE_GM",
      health: "ON_TRACK",
      currentBottleneck:
        "No qualified prospect from the latest discovery batch; SignalCare is searching the next bounded strategy.",
      signalCarePipeline: { qualified: 1, queued: 3 },
      project: {
        name: "SignalCare",
        agentDecisions: [],
        agentEvents: [
          {
            id: "no-match",
            type: "SIGNALCARE_DISCOVERY_NO_MATCH",
            summary:
              "No qualified prospects from the latest 8-organization discovery batch; SignalCare will search multi-site scheduling and workflow complexity after cooldown.",
            metadata: JSON.stringify({
              rawCandidateCount: 8,
              candidatesAccepted: 0,
              discoveryStrategy: "REGIONAL_GROWTH_EXPANSION",
              nextDiscoveryStrategy: "OPERATIONS_SCHEDULING_COMPLEXITY"
            }),
            createdAt: new Date("2026-08-29T17:30:00.000Z")
          }
        ],
        agentWorkItems: [
          workItem({
            id: "next-strategy",
            title:
              "Search SignalCare prospects — multi-site scheduling and workflow complexity",
            state: "QUEUED",
            requiredCapability: "SIGNALCARE_PUBLIC_WEB_RESEARCH",
            operationalContext: JSON.stringify({
              researchMode: "DISCOVER_PROSPECTS",
              targetProspect: null,
              instructions: "Rotate after a valid no-match batch.",
              discoveryStrategy: "OPERATIONS_SCHEDULING_COMPLEXITY"
            }),
            resultSummary: null,
            completedAt: null,
            updatedAt: new Date("2026-08-29T17:30:00.000Z")
          })
        ]
      }
    });

    const state = deriveAgentProjectDisplayState(input, now);

    expect(state).toMatchObject({
      displayHealth: "ON_TRACK",
      displayBottleneck:
        "No qualified prospect from the latest discovery batch; SignalCare is searching the next bounded strategy.",
      displayLatestOutcome:
        "No qualified prospects from the latest 8-organization discovery batch; SignalCare will search multi-site scheduling and workflow complexity after cooldown.",
      pendingOwnerDecisionCount: 0,
      supportingState: {
        kind: "SIGNALCARE_PIPELINE",
        qualified: 1,
        researching: 0,
        queued: 3
      }
    });
  });

  it("uses a completed Rykas truth read and its returned PO/capital blocker immediately", () => {
    const state = deriveAgentProjectDisplayState(rykasInput(), now);
    expect(state.displayHealth).toBe("NEEDS_ATTENTION");
    expect(state.displayBottleneck).toBe(
      "PO/capital truth requires reconciliation before buying decisions."
    );
    expect(state.displayLatestOutcome).toBe(
      "Read-only Rykas OPERATIONS_SNAPSHOT completed."
    );
    expect(state.displayBottleneck).not.toContain("queued");
    expect(state.supportingState).toMatchObject({
      poLedgerStatus: "NOT VERIFIED",
      poTruthCurrent: false,
      safeInventoryCapital: null
    });
  });

  it("automatically clears the Rykas reconciliation message when truth becomes reliable", () => {
    const state = deriveAgentProjectDisplayState(
      rykasInput({
        reliable: true,
        status: "READY",
        poLedgerStatus: "VERIFIED",
        poCertificationState: "CURRENT_OPEN_POS_LOADED",
        poTruthCurrent: true,
        safeInventoryCapital: 25000
      }),
      now
    );
    expect(state.displayHealth).toBe("WAITING");
    expect(state.displayBottleneck).toContain(
      "No PO/capital reconciliation blocker"
    );
  });

  it("excludes an intentionally paused CCHCS project from overdue, attention, and BLOCKED status", () => {
    const cchcs = baseInput({
      projectId: "cchcs",
      profile: "CCHCS_PM",
      enabled: false,
      pausedAt: new Date("2026-08-20T00:00:00.000Z"),
      health: "BLOCKED",
      currentBottleneck: "Needs bounded work activated.",
      lastAgentReviewAt: null,
      nextAgentReviewAt: new Date("2026-08-01T00:00:00.000Z"),
      project: {
        name: "CCHCS",
        agentWorkItems: [],
        agentDecisions: [],
        agentEvents: []
      }
    });
    const state = deriveAgentProjectDisplayState(cchcs, now);
    const portfolio = deriveAgentPortfolioDisplay([state], [cchcs], now);
    expect(state.displayHealth).toBe("PAUSED");
    expect(state.nextReviewState).toBe("PAUSED");
    expect(portfolio.stalledProjectIds).toEqual([]);
    expect(portfolio.projectsNeedingPmReview).toEqual([]);
    expect(portfolio.projectsRequiringAttention).toBe(0);
    expect(portfolio.status).toBe("HEALTHY");
    expect(portfolio.attentionSummary).toContain("Paused by design: CCHCS");
    expect(portfolio.attentionSummary).not.toContain("activated");
  });

  it("does not let an older failure override a newer successful outcome", () => {
    const input = baseInput({
      health: "BLOCKED",
      project: {
        name: "Example",
        agentDecisions: [],
        agentEvents: [],
        agentWorkItems: [
          workItem({
            id: "old-failure",
            state: "FAILED",
            blocker: "Old failure",
            resultSummary: null,
            updatedAt: new Date("2026-08-28T12:00:00.000Z"),
            completedAt: new Date("2026-08-28T12:00:00.000Z")
          }),
          workItem({
            id: "new-success",
            resultSummary:
              "New deterministic success superseded the earlier attempt.",
            updatedAt: new Date("2026-08-29T12:00:00.000Z"),
            completedAt: new Date("2026-08-29T12:00:00.000Z")
          })
        ]
      }
    });
    const state = deriveAgentProjectDisplayState(input, now);
    expect(state.displayLatestOutcome).toBe(
      "New deterministic success superseded the earlier attempt."
    );
    expect(state.machineWorkState.currentRetryFailureCount).toBe(0);
    expect(state.displayHealth).not.toBe("BLOCKED");
    expect(state.displayBottleneck).not.toContain("Old failure");
  });

  it("selects the newest state-changing owner resolution as the latest meaningful outcome", () => {
    const input = baseInput({
      project: {
        name: "Example",
        agentWorkItems: [
          workItem({ completedAt: new Date("2026-08-29T12:00:00.000Z") })
        ],
        agentEvents: [],
        agentDecisions: [
          {
            id: "decision-1",
            status: "RESOLVED",
            question: "Proceed with the bounded review?",
            selectedChoice: "PASS",
            category: "RESEARCH_READ_ONLY",
            context: "Review context",
            createdAt: new Date("2026-08-29T13:00:00.000Z"),
            updatedAt: new Date("2026-08-29T14:00:00.000Z"),
            resolvedAt: new Date("2026-08-29T14:00:00.000Z")
          }
        ]
      }
    });
    expect(
      deriveAgentProjectDisplayState(input, now).displayLatestOutcome
    ).toContain("Owner decision resolved");
  });

  it("composes a Chief summary only from canonical facts", () => {
    const signalInput = signalCareInput();
    const rykas = rykasInput();
    const states = [signalInput, rykas].map((input) =>
      deriveAgentProjectDisplayState(input, now)
    );
    const portfolio = deriveAgentPortfolioDisplay(
      states,
      [signalInput, rykas],
      now
    );
    expect(portfolio.attentionSummary).toContain(
      "Public evidence remains inadequate"
    );
    expect(portfolio.attentionSummary).toContain(
      "PO/capital truth requires reconciliation"
    );
    expect(portfolio.attentionSummary).not.toMatch(
      /owner outreach decision|truth read was queued|overdue/i
    );
  });
});

describe("owner decision presentation", () => {
  it("keeps Rykas reconciliation primary content compact and JSON-free", () => {
    const presentation = buildAgentDecisionPresentation({
      category: "RESEARCH_READ_ONLY",
      context: serializeRykasTruthReconciliation({
        kind: "RYKAS_TRUTH_RECONCILIATION",
        truthArea: "PO_AND_CAPITAL",
        observedAt: "2026-08-29T17:30:00.000Z",
        sourceUpdatedAt: "2026-08-29T17:25:00.000Z",
        poTruthCurrent: false,
        poLedgerStatus: "NOT VERIFIED",
        poCertificationState: "NOT VERIFIED",
        poCertifiedAt: "2026-08-20T00:00:00.000Z",
        openCommitments: 0,
        safeInventoryCapital: null,
        requiredOwnerAction: "Update authoritative truth."
      }),
      expectedUpside: "Restore reliable truth.",
      risk: "Buying remains blocked.",
      recommendedChoice: "UPDATED_AND_RECHECK",
      amountCents: null,
      currency: null,
      actionRequest: null
    });
    expect(presentation.kind).toBe("RYKAS_TRUTH_RECONCILIATION");
    expect(presentation.keyFacts).toHaveLength(5);
    expect(decisionPrimaryText(presentation)).not.toContain("{");
    expect(decisionPrimaryText(presentation)).toContain(
      "Safe inventory capital\nUnknown"
    );
  });

  it("renders a SignalCare outreach draft as readable text without qualification JSON", () => {
    const payload = {
      targetEntity: { type: "SIGNALCARE_PROSPECT", name: "Existing Dental" },
      outreachPackage: {
        organizationName: "Existing Dental",
        recommendedEntryOffer: "DENTAL_REVENUE_LEAKAGE_DIAGNOSTIC",
        targetContactName: "Alex Smith",
        targetContactRole: "Chief Operating Officer",
        likelyStakeholderRole: "Chief Operating Officer",
        confidence: "HIGH",
        conversationAngle: "Reduce unscheduled treatment leakage.",
        draftOutreachLanguage:
          "Hi Alex,\\n\\nI noticed your multi-location growth.",
        verifiedPublicFacts: [
          {
            fact: "The organization operates multiple dental locations.",
            sourceUrls: ["https://example.com/locations"]
          },
          {
            fact: "Public materials emphasize operational consistency.",
            sourceUrls: ["https://example.com/operations"]
          }
        ],
        sourceUrls: [
          "https://example.com/locations",
          "https://example.com/operations"
        ],
        providerSourceUrls: [
          "https://example.com/locations",
          "https://example.com/operations"
        ]
      },
      externalOutreachPerformed: false
    };
    const presentation = buildAgentDecisionPresentation({
      category: "SEND_EMAIL_OR_MESSAGE",
      context: `Evidence-backed package is ready.\n\nEvidence-backed internal outreach package:\n${JSON.stringify(payload.outreachPackage)}`,
      expectedUpside: "Open a qualified conversation.",
      risk: "External communication represents Ryan.",
      recommendedChoice: "APPROVE",
      amountCents: null,
      currency: null,
      actionRequest: { boundedPayload: JSON.stringify(payload) }
    });
    expect(presentation.kind).toBe("SIGNALCARE_OUTREACH");
    expect(presentation.draft).toBe(
      "Hi Alex,\n\nI noticed your multi-location growth."
    );
    expect(decisionPrimaryText(presentation)).not.toContain("{");
    expect(decisionPrimaryText(presentation)).not.toContain("\\n");
    expect(presentation.keyFacts).toContainEqual({
      label: "Sources",
      value: "2 provider-backed sources"
    });
  });
});
