const asOf = "2026-08-30T03:47:36Z";

const inventoryStates = [
  {
    inventory_state: "AMAZON_INBOUND", units: 1673, inventory_at_cost: 13455.53,
    missing_cost_units: 120, cost_coverage_percent: 92.83, expected_sales_value: 27000,
    expected_contribution: 9542.62, slow_or_aged_inventory_at_cost: 0, as_of: asOf,
    confidence: "PARTIAL", source: "mart.capital_steward_inventory_position",
    warning: "Some inbound units lack authoritative acquisition cost."
  },
  {
    inventory_state: "AMAZON_ON_HAND", units: 4791, inventory_at_cost: 29429.85,
    missing_cost_units: 485, cost_coverage_percent: 89.88, expected_sales_value: 55996.45,
    expected_contribution: 8841.47, slow_or_aged_inventory_at_cost: 15546.35, as_of: asOf,
    confidence: "PARTIAL", source: "mart.capital_steward_inventory_position",
    warning: "Some on-hand units lack authoritative acquisition cost."
  }
] as const;

const inventoryCapitalPosition = {
  amazonOnHandUnits: 4791, amazonOnHandInventoryAtCost: 29429.85,
  amazonOnHandExpectedSalesValue: 55996.45, amazonOnHandExpectedContribution: 8841.47,
  amazonInboundUnits: 1673, amazonInboundInventoryAtCost: 13455.53,
  amazonInboundExpectedContribution: 9542.62, localInventoryAtCost: null,
  otherInventoryAtCost: null, knownOwnedInventoryAtCost: 42885.38,
  totalOwnedInventoryAtCost: null, slowOrAgedInventoryAtCost: 15546.35,
  inventoryCapitalMissingCostBasisUnits: 605, inventoryCostCoveragePercent: 90.64,
  states: inventoryStates, countedAsCash: false
} as const;

const sources = [
  { value: 30000, authoritativeSource: "manual.business_cash_balance", asOf },
  { value: 22161, authoritativeSource: "mart.capital_steward_commitment_position", asOf },
  { value: 0, authoritativeSource: "manual.cash_obligation", asOf: null },
  { value: 469143, authoritativeSource: "manual.debt_account", asOf },
  { value: null, authoritativeSource: "mart.capital_steward_inventory_position", asOf }
] as const;

const capitalPlan = {
  schemaVersion: "RYKAS_CAPITAL_PLAN_V1", status: "BLOCKED", asOf,
  settledCashOnly: true, amazonForecastCountedAsSettledCash: false,
  purchaseAuthorized: false, purchaseExecuted: false, debtPaymentAuthorized: false, debtPaymentExecuted: false,
  missingInputs: ["AMAZON_SALES_INVENTORY", "DEBT"],
  blockers: ["Amazon source data is stale.", "One active debt lacks minimum-payment truth."],
  grossCash: null, forecastCash30Days: null, committedCapital: null, openObligations: null,
  minimumDebtObligations: null, debtPaymentBuffer: null, operatingReserve: null,
  coreReplenishmentReserve: null, coreReplenishmentShortfall: null,
  plannedExtraDebtReduction: null, preliminaryFreeCapital: null, safeBuyingCapacity: null,
  coreReplenishmentBudget: null, growthInventoryBudget: null, opportunisticSaleBudget: null,
  speculativeTestBudget: null, remainingBuffer: null, sources
} as const;

export const financialSnapshotV11Fixture = {
  schemaVersion: "RYKAS_FINANCIAL_SNAPSHOT_V1", asOf, status: "BLOCKED",
  settledCash: {
    grossCash: 30000,
    accounts: [{ account_label: "Operating cash", account_kind: "BUSINESS_BANK", available_balance: 30000, observed_at: asOf, source_reference: "owner-confirmed" }],
    forecastIncluded: false
  },
  amazonCashForecast: {
    amazonAvailableBalance: null, amazonPendingBalance: null, estimatedPayout7Days: null,
    estimatedPayout14Days: null, estimatedPayout30Days: null, nextExpectedPayoutDate: null,
    amazonReserveOrHold: null, confidence: "UNKNOWN", asOf,
    missingInputs: ["Available/pending Amazon balance source is absent."]
  },
  commitments: {
    detailedOpenPurchaseOrders: 0, detailedOpenLines: 0, detailedTruthStatus: "NOT VERIFIED",
    ownerCertifiedTotalOpenCommitments: 22161, ownerTotalStatus: "CURRENT",
    protectedCommittedCapital: 22161, aggregateCertifiesDetailedLedger: false, asOf
  },
  obligations: { dueNext30Days: 0, items: [] },
  debt: {
    totalBalance: 469143, minimumDueNext30Days: 15510,
    accounts: [{
      debtId: 13, displayName: "Synthetic acceptance debt", debtType: "CREDIT_CARD", pricingType: "APR",
      currentBalance: 469143, apr: 18.5, minimumPayment: null, nextDueDate: null,
      promotionalRateEnd: null, ownerPriority: null, remainingFinancingFee: null,
      remainingTotalRepayment: null, paymentCadence: null, requiredPeriodicPayment: null,
      balanceObservedAt: asOf, notes: "Acceptance fixture only"
    }]
  },
  ownerPolicy: {
    minimumOperatingReserve: 10000, minimumDebtPaymentBuffer: 15510,
    desiredMonthlyExtraDebtPayment: 0, percentOfExcessCashToDebt: 0.5,
    maximumDiscretionaryInventoryPercent: 0.5, maximumBrandConcentrationPercent: 0.2,
    coreReplenishmentPriority: "CORE_FIRST", speculativeTestBudgetCap: 500,
    debtStrategy: "HIGHEST_APR", effectiveAt: asOf
  },
  replenishment: { coreRequiredSpend: 0, candidateCount: 0 },
  inventoryCapitalPosition,
  performance: {
    units_7: 100, units_30: 400, units_90: 1200, realized_sales: 50000,
    realized_contribution: 8000, orders_through: "2026-08-20", financials_through: "2026-08-20", inventory_through: "2026-08-20"
  },
  checklist: [
    { inputKey: "AMAZON_SALES_INVENTORY", status: "STALE", observedAt: "2026-08-20", freshnessDays: 1, authoritativeSource: "Amazon system truth", reason: "Amazon source data is stale." },
    { inputKey: "BUSINESS_CASH", status: "CURRENT", observedAt: asOf, freshnessDays: 7, authoritativeSource: "manual.business_cash_balance", reason: null },
    { inputKey: "DEBT", status: "CONFLICTING", observedAt: asOf, freshnessDays: 30, authoritativeSource: "manual.debt_account", reason: "One active debt lacks minimum-payment truth." },
    { inputKey: "OBLIGATIONS", status: "CURRENT", observedAt: asOf, freshnessDays: 7, authoritativeSource: "manual.cash_obligation", reason: null },
    { inputKey: "OWNER_POLICY", status: "CURRENT", observedAt: asOf, freshnessDays: null, authoritativeSource: "manual.owner_capital_policy", reason: null },
    { inputKey: "PO_COMMITMENTS", status: "MISSING", observedAt: null, freshnessDays: 7, authoritativeSource: "mart.open_purchase_order_truth", reason: "Detailed PO ledger is not verified." },
    { inputKey: "PROTECTED_COMMITMENTS", status: "CURRENT", observedAt: asOf, freshnessDays: 7, authoritativeSource: "mart.capital_steward_commitment_position", reason: null },
    { inputKey: "LOCAL_INVENTORY", status: "MISSING", observedAt: null, freshnessDays: 30, authoritativeSource: "manual.local_inventory_snapshot", reason: "Local inventory capital is unknown." }
  ],
  missingInputs: ["AMAZON_SALES_INVENTORY", "DEBT"], sources,
  purchaseAuthorized: false, purchaseExecuted: false, debtPaymentAuthorized: false, debtPaymentExecuted: false,
  capitalPlan,
  capitalPosition: {
    name: "FINANCIAL_CAPITAL_POSITION",
    liquid: { settledBusinessCash: 30000, source: "manual.business_cash_balance", asOf },
    nearTermForecast: { amazonPayout7Days: null, amazonPayout14Days: null, amazonPayout30Days: null, countedAsSettledCash: false, source: "mart.amazon_cash_forecast", asOf },
    committed: { protectedOpenCommitments: 22161, otherObligationsDue30Days: 0, minimumDebtProtection: 15510 },
    illiquidWorkingCapital: inventoryCapitalPosition,
    liabilities: { totalBusinessDebt: 469143, source: "manual.debt_account" }, safeBuyingCapacity: null
  },
  debtAdvice: { status: "NEEDS_DATA", recommendations: [], paymentExecuted: false },
  financialHealth: { status: "BLOCKED", reasons: ["Amazon source data is stale.", "One active debt lacks minimum-payment truth.", "Local inventory capital is unknown or stale; discretionary inventory confidence is reduced, but core replenishment is not blocked solely for this reason."] },
  weeklyCapitalPlan: { status: "BLOCKED", asOf, coreReplenishment: null, growthInventory: null, saleEventInventory: null, debtReduction: null, holdAsReserve: null, priorityActions: ["Amazon source data is stale.", "One active debt lacks minimum-payment truth."], externalActionsPerformed: false }
} as const;
