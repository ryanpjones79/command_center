import { z } from "zod";

export const RYKAS_TRUTH_RECONCILIATION_KIND =
  "RYKAS_TRUTH_RECONCILIATION" as const;
export const RYKAS_TRUTH_RECONCILIATION_CHOICES = [
  "UPDATED_AND_RECHECK",
  "REQUIRES_RECONCILIATION",
  "CAPITAL_UNKNOWN"
] as const;
export const RYKAS_OWNER_DATA_SOURCE_INSTRUCTIONS =
  "Use the compact Rykas Financial Truth Update form in Agent HQ. Save only owner-confirmed cash, debt, obligations, and policy facts. Existing Amazon, inventory, sourcing, and PO rows remain system-derived; spreadsheets are historical reference only. SAVE & RECHECK writes through the bounded localhost connector to Rykas manual truth and cannot place an order, move money, pay debt, or create a commitment.";

export const rykasTruthReconciliationSchema = z
  .object({
    kind: z.literal(RYKAS_TRUTH_RECONCILIATION_KIND),
    truthArea: z.enum(["PO_AND_CAPITAL", "FINANCIAL"]),
    observedAt: z.string().datetime(),
    sourceUpdatedAt: z.string().datetime().nullable(),
    poTruthCurrent: z.boolean(),
    poLedgerStatus: z.string().min(1).max(100),
    poCertificationState: z.string().min(1).max(100),
    poCertifiedAt: z.string().datetime().nullable(),
    openCommitments: z.number().finite().nullable(),
    safeInventoryCapital: z.number().finite().nullable(),
    requiredOwnerAction: z.string().min(1).max(2000),
    requestedFields: z.array(z.string().max(100)).max(30).optional()
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
            financialSnapshot?: { missingInputs?: unknown; checklist?: unknown } | null;
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
  const financial = truth?.data?.financialSnapshot;
  const financialMissing = Array.isArray(financial?.missingInputs) ? financial.missingInputs.filter((value): value is string => typeof value === "string") : [];
  return rykasTruthReconciliationSchema.parse({
    kind: RYKAS_TRUTH_RECONCILIATION_KIND,
    truthArea: financialMissing.length ? "FINANCIAL" : "PO_AND_CAPITAL",
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
    requiredOwnerAction,
    requestedFields: financialMissing
  });
}

export function rykasTruthReconciliationDecision(
  ownerDataRequest: RykasTruthReconciliation
) {
  const data = rykasTruthReconciliationSchema.parse(ownerDataRequest);
  return {
    category: "RESEARCH_READ_ONLY" as const,
    question:
      "RYKAS FINANCIAL TRUTH UPDATE — provide only the missing, stale, or conflicting owner facts needed for a safe capital plan.",
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
    title: "Rykas financial truth update",
    objective:
      "Collect one consolidated owner update for missing financial truth, persist it in Rykas, then run a fresh deterministic read.",
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
      "Owner-data maintenance only; the bounded runner may write approved facts to Rykas manual truth. No financial authorization or external action.",
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
  if (choice === "CAPITAL_UNKNOWN") return "NOT AVAILABLE";
  return choice;
}
