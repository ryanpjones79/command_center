import { z } from "zod";

export const RYKAS_READ_CAPABILITY = "RYKAS_OPERATIONS_READ" as const;
export const rykasViewSchema = z.enum(["TOP", "OWNER_ACTION_NEEDED", "PURCHASE_READY", "NEEDS_DATA", "BLOCKED", "STALE_EVIDENCE"]);
const limitSchema = z.number().int().min(1).max(25);
const asinSchema = z.string().regex(/^[A-Z0-9]{10}$/);
export const rykasReadRequestSchema = z.discriminatedUnion("operation", [
  z.object({ version: z.literal(1), operation: z.literal("OPERATIONS_SNAPSHOT"), input: z.object({ limit: limitSchema }).strict() }).strict(),
  z.object({ version: z.literal(1), operation: z.literal("SOURCING_OPPORTUNITIES"), input: z.object({ view: rykasViewSchema, limit: limitSchema }).strict() }).strict(),
  z.object({ version: z.literal(1), operation: z.literal("OPPORTUNITY_DETAIL"), input: z.object({ opportunityId: z.string().regex(/^US:[A-Z0-9]{10}$/) }).strict() }).strict(),
  z.object({ version: z.literal(1), operation: z.literal("PURCHASE_CANDIDATES"), input: z.object({ limit: limitSchema }).strict() }).strict(),
  z.object({ version: z.literal(1), operation: z.literal("OPERATIONS_BLOCKERS"), input: z.object({ limit: limitSchema }).strict() }).strict(),
  z.object({ version: z.literal(1), operation: z.literal("FINANCIAL_SNAPSHOT"), input: z.object({}).strict() }).strict(),
  z.object({ version: z.literal(1), operation: z.literal("CAPITAL_PLAN"), input: z.object({}).strict() }).strict(),
  z.object({ version: z.literal(1), operation: z.literal("REPLENISHMENT_CANDIDATES"), input: z.object({ limit: limitSchema }).strict() }).strict(),
  z.object({ version: z.literal(1), operation: z.literal("CAPITAL_RELEASE_CANDIDATES"), input: z.object({ limit: limitSchema }).strict() }).strict(),
  z.object({ version: z.literal(1), operation: z.literal("SALE_EVENT_EVALUATION"), input: z.object({ candidateIds: z.array(asinSchema).min(1).max(25) }).strict() }).strict()
]);
export type RykasReadRequest = z.infer<typeof rykasReadRequestSchema>;

export function serializeRykasReadRequest(request: unknown) {
  return JSON.stringify(rykasReadRequestSchema.parse(request));
}

const nullableNumber = z.number().finite().nullable();
const freshnessSchema = z.object({ observedAt: z.string().datetime(), authoritativeSource: z.string().min(1).max(500), sourceUpdatedAt: z.string().datetime().nullable(), classification: z.enum(["CURRENT", "STALE", "UNKNOWN"]), stale: z.boolean() }).strict();
export const rykasOpportunitySchema = z.object({ opportunityId: z.string().regex(/^US:[A-Z0-9]{10}$/), asin: z.string().regex(/^[A-Z0-9]{10}$/), vendorSku: z.string().max(200).nullable(), brand: z.string().max(400).nullable(), title: z.string().max(1000).nullable(), supplier: z.string().max(500).nullable(), discoverySource: z.string().max(200).nullable(), discoveryStrategy: z.string().max(200).nullable(), currentBuyBox: nullableNumber, buyBox90: nullableNumber, observedOrReferenceCost: nullableNumber, maxLandedCost: nullableNumber, idealLandedCost: nullableNumber, profitPerUnit: nullableNumber, expectedProfit: nullableNumber, expectedMonthlyContribution: nullableNumber, roi: nullableNumber, margin: nullableNumber, estimatedMonthlyUnits: nullableNumber, units30: nullableNumber, units90: nullableNumber, sellerCount: z.number().int().nonnegative().nullable(), amazonOos90: nullableNumber, opportunityScore: nullableNumber, decision: z.string().max(80).nullable(), actionState: z.string().max(100), recommendationStatus: z.string().max(100).nullable(), recommendedUnits: z.number().int().nonnegative().nullable(), recommendedCases: nullableNumber, expectedSpend: nullableNumber, eligibilityStatus: z.string().max(100).nullable(), requiredAction: z.string().max(200).nullable(), sourceStatus: z.string().max(100).nullable(), reasonCodes: z.array(z.string().max(200)).max(100), missingEvidence: z.array(z.string().max(200)).max(50), blockers: z.array(z.string().max(500)).max(50), freshness: freshnessSchema }).strict();
const blockerSchema = z.object({ id: z.string().max(200), opportunityId: z.string().max(50).nullable(), stage: z.enum(["OPPORTUNITY", "PURCHASE_DECISION", "INBOUND_INVENTORY", "LISTING", "SALE", "SYSTEM"]), code: z.string().max(200), summary: z.string().max(1000), sourceUpdatedAt: z.string().datetime().nullable(), stale: z.boolean() }).strict();
const capitalSchema = z.object({ reliable: z.boolean(), status: z.string().max(100), reason: z.string().max(2000).nullable(), actionRequired: z.string().max(1000).nullable(), asOf: z.string().nullable(), openCommitments: nullableNumber, purchaseOrderRows: z.number().int().nonnegative(), openPurchaseOrderLines: z.number().int().nonnegative(), poLedgerStatus: z.string().max(100), poCertificationState: z.string().max(100), poCertifiedAt: z.string().datetime().nullable(), poTruthCurrent: z.boolean(), safeInventoryCapital: nullableNumber }).strict();
const checklistItemSchema = z.object({ inputKey: z.string().max(100), status: z.enum(["CURRENT", "STALE", "MISSING", "CONFLICTING"]), observedAt: z.string().nullable(), freshnessDays: z.number().int().nonnegative().nullable(), authoritativeSource: z.string().max(500), reason: z.string().max(2000).nullable() }).strict();
const amazonCashForecastSchema = z.object({ amazonAvailableBalance: nullableNumber, amazonPendingBalance: nullableNumber, estimatedPayout7Days: nullableNumber, estimatedPayout14Days: nullableNumber, estimatedPayout30Days: nullableNumber, nextExpectedPayoutDate: z.string().nullable(), amazonReserveOrHold: nullableNumber, confidence: z.string().max(100), asOf: z.string(), missingInputs: z.array(z.string().max(200)).max(30) }).strict();
export const rykasCapitalPlanSchema = z.object({ schemaVersion: z.literal("RYKAS_CAPITAL_PLAN_V1"), status: z.enum(["READY", "BLOCKED"]), asOf: z.string(), settledCashOnly: z.literal(true), amazonForecastCountedAsSettledCash: z.literal(false), purchaseAuthorized: z.literal(false), purchaseExecuted: z.literal(false), debtPaymentAuthorized: z.literal(false), debtPaymentExecuted: z.literal(false), missingInputs: z.array(z.string().max(100)).max(30), blockers: z.array(z.string().max(2000)).max(30), grossCash: nullableNumber, forecastCash30Days: nullableNumber, committedCapital: nullableNumber, openObligations: nullableNumber, minimumDebtObligations: nullableNumber, debtPaymentBuffer: nullableNumber, operatingReserve: nullableNumber, coreReplenishmentReserve: nullableNumber, coreReplenishmentShortfall: nullableNumber, plannedExtraDebtReduction: nullableNumber, preliminaryFreeCapital: nullableNumber, safeBuyingCapacity: nullableNumber, coreReplenishmentBudget: nullableNumber, growthInventoryBudget: nullableNumber, opportunisticSaleBudget: nullableNumber, speculativeTestBudget: nullableNumber, remainingBuffer: nullableNumber, sources: z.array(z.record(z.unknown())).max(20) }).strict();
const snapshotTime = z.string().min(1).max(100);
const nullableNonnegative = z.number().finite().nonnegative().nullable();
const financialSourceSchema = z.object({
  value: z.union([z.number().finite(), z.string().max(1000), z.null()]),
  authoritativeSource: z.string().min(1).max(500),
  asOf: snapshotTime.nullable()
}).strict();
const settledCashSchema = z.object({
  grossCash: z.number().finite().nonnegative(),
  accounts: z.array(z.object({
    account_label: z.string().min(1).max(200), account_kind: z.string().min(1).max(100),
    available_balance: z.number().finite().nonnegative(), observed_at: snapshotTime,
    source_reference: z.string().max(500).nullable()
  }).strict()).max(25),
  forecastIncluded: z.literal(false)
}).strict();
const commitmentsSchema = z.object({
  detailedOpenPurchaseOrders: z.number().finite().nonnegative(),
  detailedOpenLines: z.number().int().nonnegative(),
  detailedTruthStatus: z.string().min(1).max(100),
  ownerCertifiedTotalOpenCommitments: nullableNonnegative,
  ownerTotalStatus: z.string().min(1).max(100),
  protectedCommittedCapital: z.number().finite().nonnegative(),
  aggregateCertifiesDetailedLedger: z.literal(false),
  asOf: snapshotTime.nullable()
}).strict();
const obligationItemSchema = z.object({
  cash_obligation_id: z.number().int().nonnegative(), vendor: z.string().max(500),
  description: z.string().max(1000), amount: z.number().finite().nonnegative(),
  due_date: snapshotTime, category: z.string().max(100),
  related_purchase_order_id: z.number().int().nonnegative().nullable(),
  status: z.string().max(100), observed_at: snapshotTime,
  source_reference: z.string().max(500).nullable(), loaded_at: snapshotTime
}).strict();
const debtAccountSchema = z.object({
  debtId: z.number().int().nonnegative(), displayName: z.string().min(1).max(300),
  debtType: z.string().max(100), pricingType: z.enum(["APR", "FIXED_FEE", "REVENUE_BASED", "OTHER", "UNKNOWN"]),
  currentBalance: z.number().finite().nonnegative(), apr: nullableNonnegative,
  minimumPayment: nullableNonnegative, nextDueDate: snapshotTime.nullable(),
  promotionalRateEnd: snapshotTime.nullable(), ownerPriority: z.number().int().positive().nullable(),
  remainingFinancingFee: nullableNonnegative, remainingTotalRepayment: nullableNonnegative,
  paymentCadence: z.string().max(100).nullable(), requiredPeriodicPayment: nullableNonnegative,
  balanceObservedAt: snapshotTime, notes: z.string().max(2000).nullable()
}).strict();
const ownerPolicySchema = z.object({
  minimumOperatingReserve: nullableNonnegative, minimumDebtPaymentBuffer: nullableNonnegative,
  desiredMonthlyExtraDebtPayment: nullableNonnegative, percentOfExcessCashToDebt: nullableNonnegative,
  maximumDiscretionaryInventoryPercent: nullableNonnegative, maximumBrandConcentrationPercent: nullableNonnegative,
  coreReplenishmentPriority: z.string().max(100).nullable(), speculativeTestBudgetCap: nullableNonnegative,
  debtStrategy: z.enum(["HIGHEST_APR", "OWNER_DEFINED_ORDER"]), effectiveAt: snapshotTime.nullable()
}).strict();
const inventoryStateSchema = z.object({
  inventory_state: z.enum(["AMAZON_ON_HAND", "AMAZON_INBOUND", "PURCHASED_IN_TRANSIT", "IN_TRANSIT", "RECEIVED_ON_HAND", "LOCAL_GARAGE", "OTHER_OWNED"]),
  units: nullableNonnegative, inventory_at_cost: nullableNonnegative, missing_cost_units: nullableNonnegative,
  cost_coverage_percent: nullableNonnegative, expected_sales_value: nullableNonnegative,
  expected_contribution: nullableNumber, slow_or_aged_inventory_at_cost: nullableNonnegative,
  as_of: snapshotTime.nullable(), confidence: z.enum(["VERIFIED", "ESTIMATED", "PARTIAL", "STALE", "UNKNOWN"]),
  source: z.string().min(1).max(1000), warning: z.string().max(2000).nullable()
}).strict();
const inventoryCapitalPositionSchema = z.object({
  amazonOnHandUnits: nullableNonnegative, amazonOnHandInventoryAtCost: nullableNonnegative,
  amazonOnHandExpectedSalesValue: nullableNonnegative, amazonOnHandExpectedContribution: nullableNumber,
  amazonInboundUnits: nullableNonnegative, amazonInboundInventoryAtCost: nullableNonnegative,
  amazonInboundExpectedContribution: nullableNumber, localInventoryAtCost: nullableNonnegative,
  otherInventoryAtCost: nullableNonnegative, knownOwnedInventoryAtCost: z.number().finite().nonnegative(),
  totalOwnedInventoryAtCost: nullableNonnegative, slowOrAgedInventoryAtCost: nullableNonnegative,
  inventoryCapitalMissingCostBasisUnits: nullableNonnegative, inventoryCostCoveragePercent: nullableNonnegative,
  states: z.array(inventoryStateSchema).max(20), countedAsCash: z.literal(false)
}).strict();
const performanceSchema = z.object({
  units_7: nullableNumber, units_30: nullableNumber, units_90: nullableNumber,
  realized_sales: nullableNumber, realized_contribution: nullableNumber,
  orders_through: snapshotTime.nullable(), financials_through: snapshotTime.nullable(), inventory_through: snapshotTime.nullable()
}).strict();
const debtRecommendationSchema = z.object({
  debtId: z.number().int().nonnegative(), displayName: z.string().max(300), balance: z.number().finite().nonnegative(),
  pricingType: z.enum(["APR", "FIXED_FEE", "REVENUE_BASED", "OTHER", "UNKNOWN"]), apr: nullableNonnegative,
  minimumDue: nullableNonnegative, recommendedExtraPayment: z.number().finite().nonnegative(),
  projectedPostPaymentBalance: z.number().finite().nonnegative(), why: z.string().max(1000)
}).strict();
const debtAdviceSchema = z.object({
  status: z.enum(["READY", "NEEDS_DATA", "OWNER_PRIORITY_REQUIRED"]),
  reason: z.string().max(2000).optional(), strategy: z.string().max(100).optional(),
  recommendations: z.array(debtRecommendationSchema).max(25), paymentExecuted: z.literal(false)
}).strict();
const weeklyCapitalPlanSchema = z.object({
  status: z.enum(["READY", "BLOCKED"]), asOf: snapshotTime, coreReplenishment: nullableNonnegative,
  growthInventory: nullableNonnegative, saleEventInventory: nullableNonnegative, debtReduction: nullableNonnegative,
  holdAsReserve: nullableNonnegative, priorityActions: z.array(z.string().max(2000)).max(5), externalActionsPerformed: z.literal(false)
}).strict();
const capitalPositionSchema = z.object({
  name: z.literal("FINANCIAL_CAPITAL_POSITION"),
  liquid: z.object({ settledBusinessCash: z.number().finite().nonnegative(), source: z.string().max(500), asOf: snapshotTime.nullable() }).strict(),
  nearTermForecast: z.object({ amazonPayout7Days: nullableNumber, amazonPayout14Days: nullableNumber, amazonPayout30Days: nullableNumber, countedAsSettledCash: z.literal(false), source: z.string().max(500), asOf: snapshotTime }).strict(),
  committed: z.object({ protectedOpenCommitments: z.number().finite().nonnegative(), otherObligationsDue30Days: z.number().finite().nonnegative(), minimumDebtProtection: z.number().finite().nonnegative() }).strict(),
  illiquidWorkingCapital: inventoryCapitalPositionSchema,
  liabilities: z.object({ totalBusinessDebt: z.number().finite().nonnegative(), source: z.string().max(500) }).strict(),
  safeBuyingCapacity: nullableNonnegative
}).strict();
export const financialSnapshotSchema = z.object({
  schemaVersion: z.literal("RYKAS_FINANCIAL_SNAPSHOT_V1"), asOf: snapshotTime, status: z.enum(["READY", "BLOCKED"]),
  settledCash: settledCashSchema, amazonCashForecast: amazonCashForecastSchema, commitments: commitmentsSchema,
  obligations: z.object({ dueNext30Days: z.number().finite().nonnegative(), items: z.array(obligationItemSchema).max(100) }).strict(),
  debt: z.object({ totalBalance: z.number().finite().nonnegative(), minimumDueNext30Days: z.number().finite().nonnegative(), accounts: z.array(debtAccountSchema).max(25) }).strict(),
  ownerPolicy: ownerPolicySchema, replenishment: z.object({ coreRequiredSpend: z.number().finite().nonnegative(), candidateCount: z.number().int().nonnegative() }).strict(),
  inventoryCapitalPosition: inventoryCapitalPositionSchema, performance: performanceSchema,
  checklist: z.array(checklistItemSchema).max(30), missingInputs: z.array(z.string().max(100)).max(30), sources: z.array(financialSourceSchema).max(20),
  capitalPlan: rykasCapitalPlanSchema, capitalPosition: capitalPositionSchema, debtAdvice: debtAdviceSchema,
  financialHealth: z.object({ status: z.enum(["BLOCKED", "PARTIAL", "TIGHT", "HEALTHY"]), reasons: z.array(z.string().max(2000)).max(10) }).strict(),
  weeklyCapitalPlan: weeklyCapitalPlanSchema, purchaseAuthorized: z.literal(false), purchaseExecuted: z.literal(false),
  debtPaymentAuthorized: z.literal(false), debtPaymentExecuted: z.literal(false)
}).strict();
const replenishmentCandidateSchema = z.object({ asin: asinSchema, sellerSku: z.string().max(200).nullable(), title: z.string().max(1000).nullable(), vendor: z.string().max(500).nullable(), classification: z.enum(["CORE_REPLENISHMENT", "NORMAL", "TEST", "DO_NOT_REPLENISH"]), onHand: nullableNumber, inbound: nullableNumber, reserved: nullableNumber, committed: nullableNumber, dailyVelocity: nullableNumber, daysOfSupply: nullableNumber, estimatedStockoutDate: z.string().nullable(), leadTimeDays: nullableNumber, targetCoverageDays: nullableNumber, recommendedQuantity: nullableNumber, totalRequiredSpend: nullableNumber, expectedContribution: nullableNumber, recommendation: z.string().max(100), freshness: z.string().max(100).nullable(), missingInputs: z.array(z.string().max(1000)).max(20) }).strict();
const releaseCandidateSchema = z.object({ asin: asinSchema, sellerSku: z.string().max(200).nullable(), title: z.string().max(1000).nullable(), vendor: z.string().max(500).nullable(), units: nullableNumber, daysOfSupply: nullableNumber, inventoryCostTiedUp: nullableNumber, likelyCapitalFreed: nullableNumber, marginImpact: nullableNumber, recommendedAction: z.enum(["HOLD", "REPRICE", "BUNDLE", "LIQUIDATE", "DO_NOT_REPLENISH"]), reason: z.string().max(200).nullable(), freshness: z.string().max(100).nullable() }).strict();
const replenishmentResultSchema = z.object({ schemaVersion: z.literal("RYKAS_REPLENISHMENT_CANDIDATES_V1"), items: z.array(replenishmentCandidateSchema).max(25), purchaseExecuted: z.literal(false) }).strict();
const releaseResultSchema = z.object({ schemaVersion: z.literal("RYKAS_CAPITAL_RELEASE_CANDIDATES_V1"), items: z.array(releaseCandidateSchema).max(25), listingOrPriceChanged: z.literal(false), purchaseExecuted: z.literal(false) }).strict();
const saleEventResultSchema = z.object({ schemaVersion: z.literal("RYKAS_SALE_EVENT_EVALUATION_V1"), status: z.enum(["READY", "BLOCKED"]), safeEventBudget: nullableNumber, recommendedSpend: nullableNumber, candidates: z.array(z.record(z.unknown())).max(25), missingCandidateIds: z.array(asinSchema).max(25), purchaseAuthorized: z.literal(false), purchaseExecuted: z.literal(false) }).strict();
const actionSummarySchema = z.object({ action: z.string().max(100), count: z.number().int().nonnegative(), topOpportunityScore: nullableNumber }).strict();
const detailSchema = z.object({ opportunity: rykasOpportunitySchema, priceHistory: z.object({ buyBox30: nullableNumber, buyBox90: nullableNumber, buyBox180: nullableNumber }).strict(), competition: z.object({ offerCount30: nullableNumber, offerCount90: nullableNumber, offerCount180: nullableNumber }).strict(), inventory: z.object({ onHand: nullableNumber, reserved: nullableNumber, inbound: nullableNumber }).strict(), evidence: z.object({ evaluationVersion: z.string().max(200).nullable(), positives: z.array(z.string().max(1000)).max(50), risks: z.array(z.string().max(1000)).max(50), confidenceFactor: nullableNumber, priceConfidence: z.string().max(100).nullable(), availabilityConfidence: z.string().max(100).nullable(), priceAgeDays: z.number().int().nonnegative().nullable(), quantityStatus: z.string().max(100).nullable(), eligibilityCheckedAt: z.string().datetime().nullable(), marketCheckedAt: z.string().datetime().nullable(), buyBoxCheckedAt: z.string().datetime().nullable(), sourcePriceObservedAt: z.string().datetime().nullable() }).strict() }).strict();
export const rykasTruthResultSchema = z.object({ schemaVersion: z.literal("RYKAS_TRUTH_READ_V1"), operation: z.enum(["OPERATIONS_SNAPSHOT", "SOURCING_OPPORTUNITIES", "OPPORTUNITY_DETAIL", "PURCHASE_CANDIDATES", "OPERATIONS_BLOCKERS", "FINANCIAL_SNAPSHOT", "CAPITAL_PLAN", "REPLENISHMENT_CANDIDATES", "CAPITAL_RELEASE_CANDIDATES", "SALE_EVENT_EVALUATION"]), readOnly: z.literal(true), purchaseAuthorized: z.literal(false), purchaseExecuted: z.literal(false), observedAt: z.string().datetime(), authoritativeSource: z.string().min(1).max(500), sourceUpdatedAt: z.string().datetime().nullable(), freshness: z.enum(["CURRENT", "STALE", "UNKNOWN"]), stale: z.boolean(), data: z.object({ actionSummary: z.array(actionSummarySchema).max(30), capital: capitalSchema.nullable(), opportunities: z.array(rykasOpportunitySchema).max(25), purchaseCandidates: z.array(rykasOpportunitySchema).max(25), blockers: z.array(blockerSchema).max(25), detail: detailSchema.nullable(), financialSnapshot: financialSnapshotSchema.nullable().default(null), capitalPlan: rykasCapitalPlanSchema.nullable().default(null), replenishmentCandidates: replenishmentResultSchema.nullable().default(null), capitalReleaseCandidates: releaseResultSchema.nullable().default(null), saleEventEvaluation: saleEventResultSchema.nullable().default(null) }).strict() }).strict();
export type RykasTruthResult = z.infer<typeof rykasTruthResultSchema>;
