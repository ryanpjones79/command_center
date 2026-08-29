import { z } from "zod";

export const RYKAS_TRUTH_RECONCILIATION_KIND =
  "RYKAS_TRUTH_RECONCILIATION" as const;
export const RYKAS_TRUTH_RECONCILIATION_CHOICES = [
  "UPDATED_AND_RECHECK",
  "REQUIRES_RECONCILIATION",
  "CAPITAL_UNKNOWN"
] as const;
export const RYKAS_OWNER_DATA_SOURCE_INSTRUCTIONS =
  "In the existing Rykas Sourcing Command Center, open /sourcing and use the Safe Inventory Capital card. Use CONFIRM NO OPEN POS only when there truly are no commitments. If commitments exist, load inputs/command_center/purchase_orders.example.tsv through the controlled procurement import and certify CURRENT_OPEN_POS_LOADED. Update Balance as of and Operating bank / checking balance in the existing Rykas Owner Health workbook, then run the normal Rykas Command Center refresh. Safe inventory capital is calculated by Rykas; do not enter it in RyanOS.";

export const rykasTruthReconciliationSchema = z
  .object({
    kind: z.literal(RYKAS_TRUTH_RECONCILIATION_KIND),
    truthArea: z.literal("PO_AND_CAPITAL"),
    observedAt: z.string().datetime(),
    sourceUpdatedAt: z.string().datetime().nullable(),
    poTruthCurrent: z.boolean(),
    poLedgerStatus: z.string().min(1).max(100),
    poCertificationState: z.string().min(1).max(100),
    poCertifiedAt: z.string().datetime().nullable(),
    openCommitments: z.number().finite().nullable(),
    safeInventoryCapital: z.number().finite().nullable(),
    requiredOwnerAction: z.string().min(1).max(2000)
  })
  .strict();

export type RykasTruthReconciliation = z.infer<
  typeof rykasTruthReconciliationSchema
>;

export function serializeRykasTruthReconciliation(
  value: RykasTruthReconciliation
) {
  return JSON.stringify(rykasTruthReconciliationSchema.parse(value));
}

export function parseRykasTruthReconciliation(value: string) {
  try {
    const parsed = rykasTruthReconciliationSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function extractRykasTruthReconciliation(
  toolEvidence: Array<{ toolId: string; output: unknown }> | undefined
): RykasTruthReconciliation | null {
  const snapshot = toolEvidence?.find(
    (entry) => entry.toolId === "rykas.operations.snapshot"
  )?.output as
    | {
        realTruth?: {
          observedAt?: unknown;
          sourceUpdatedAt?: unknown;
          data?: {
            capital?: {
              reliable?: unknown;
              actionRequired?: unknown;
              reason?: unknown;
              poTruthCurrent?: unknown;
              poLedgerStatus?: unknown;
              poCertificationState?: unknown;
              poCertifiedAt?: unknown;
              openCommitments?: unknown;
              safeInventoryCapital?: unknown;
            } | null;
          };
        } | null;
      }
    | undefined;
  const truth = snapshot?.realTruth;
  const capital = truth?.data?.capital;
  if (!truth || !capital) return null;
  const safeCapital =
    typeof capital.safeInventoryCapital === "number"
      ? capital.safeInventoryCapital
      : null;
  const poTruthCurrent = capital.poTruthCurrent === true;
  if (capital.reliable === true && poTruthCurrent && safeCapital !== null)
    return null;
  const requiredOwnerAction =
    typeof capital.actionRequired === "string" && capital.actionRequired.trim()
      ? capital.actionRequired
      : typeof capital.reason === "string" && capital.reason.trim()
        ? capital.reason
        : "Update the authoritative Rykas PO and owner-capital inputs, then request a recheck.";
  return rykasTruthReconciliationSchema.parse({
    kind: RYKAS_TRUTH_RECONCILIATION_KIND,
    truthArea: "PO_AND_CAPITAL",
    observedAt: truth.observedAt,
    sourceUpdatedAt:
      typeof truth.sourceUpdatedAt === "string" ? truth.sourceUpdatedAt : null,
    poTruthCurrent,
    poLedgerStatus:
      typeof capital.poLedgerStatus === "string"
        ? capital.poLedgerStatus
        : "NOT VERIFIED",
    poCertificationState:
      typeof capital.poCertificationState === "string"
        ? capital.poCertificationState
        : "NOT VERIFIED",
    poCertifiedAt:
      typeof capital.poCertifiedAt === "string" ? capital.poCertifiedAt : null,
    openCommitments:
      typeof capital.openCommitments === "number"
        ? capital.openCommitments
        : null,
    safeInventoryCapital: safeCapital,
    requiredOwnerAction
  });
}

export function rykasTruthReconciliationDecision(
  ownerDataRequest: RykasTruthReconciliation
) {
  const data = rykasTruthReconciliationSchema.parse(ownerDataRequest);
  return {
    category: "RESEARCH_READ_ONLY" as const,
    question:
      "Rykas buying is blocked because PO/capital truth is stale. Update the authoritative Rykas PO/capital source, then request a recheck?",
    context: serializeRykasTruthReconciliation(data),
    recommendedChoice: "UPDATED_AND_RECHECK",
    availableChoices: [...RYKAS_TRUTH_RECONCILIATION_CHOICES],
    expectedUpside:
      "A fresh Rykas read can restore a reliable buying-budget decision without copying financial truth into RyanOS.",
    risk:
      "Buying remains blocked until Rykas itself returns current PO truth and a known safe inventory capital value.",
    createsActionRequest: false,
    ownerDataRequest: data
  };
}

export function rykasTruthReconciliationWorkPlan(
  ownerDataRequest: RykasTruthReconciliation
) {
  return {
    disposition: "CREATE_WORK" as const,
    title: "Rykas buying blocked",
    objective:
      "Ask the owner to update the existing authoritative Rykas PO/capital source before a fresh read.",
    expectedValue:
      "Restore decision-grade buying-budget truth without making RyanOS a financial source of truth.",
    acceptanceCriteria:
      "Ryan chooses a canonical reconciliation outcome; no action request or purchase is created; only a fresh Rykas read can clear the blocker.",
    agentRole: "RYKAS_GM",
    actionCategory: "RESEARCH_READ_ONLY" as const,
    priority: "HIGH" as const,
    maxAttempts: 1,
    plannedBottleneck:
      "Authoritative Rykas PO/capital truth is stale or incomplete.",
    requiredCapability: "REPOSITORY_READ",
    sandboxPolicy: "READ_ONLY" as const,
    networkPolicy: "OFF" as const,
    operationalContext:
      "Owner-data dependency only; RyanOS must not write or certify PO/capital truth.",
    rykasReadRequest: null,
    evidence:
      "Rykas returned non-current PO truth or unknown safe inventory capital.",
    nextReviewMinutes: 10080,
    ownerNeeded: true,
    ownerDecision: rykasTruthReconciliationDecision(ownerDataRequest),
    researchMode: null,
    targetProspect: null
  };
}

export function rykasOwnerChoiceLabel(choice: string) {
  if (choice === "UPDATED_AND_RECHECK") return "UPDATED & RECHECK";
  if (choice === "REQUIRES_RECONCILIATION") return "NEEDS RECONCILIATION";
  if (choice === "CAPITAL_UNKNOWN") return "CAPITAL UNKNOWN";
  return choice;
}
