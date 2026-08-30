import { describe, expect, it } from "vitest";
import {
  rykasOwnerFinancialUpdateResultSchema,
  rykasOwnerFinancialUpdateSchema
} from "@/lib/rykas-owner-financial-contract";
import {
  rykasCapitalPlanSchema,
  rykasReadRequestSchema
} from "@/lib/rykas-truth-contract";
import { projectToolRegistry } from "@/server/agent/project-tools";

const observedAt = "2026-08-29T12:00:00.000Z";

describe("Rykas Capital Steward safety contracts", () => {
  it("allows only bounded typed financial reads", () => {
    expect(
      rykasReadRequestSchema.safeParse({
        version: 1,
        operation: "FINANCIAL_SNAPSHOT",
        input: {}
      }).success
    ).toBe(true);
    expect(
      rykasReadRequestSchema.safeParse({
        version: 1,
        operation: "SALE_EVENT_EVALUATION",
        input: { candidateIds: ["B012345678"], sql: "select *" }
      }).success
    ).toBe(false);
    expect(
      rykasReadRequestSchema.safeParse({
        version: 1,
        operation: "CAPITAL_PLAN",
        input: { shell: "pay-vendor" }
      }).success
    ).toBe(false);
  });

  it("keeps all Capital Steward tools read-only and Rykas-only", () => {
    const ids = [
      "rykas.finance.snapshot",
      "rykas.finance.capital_plan",
      "rykas.inventory.replenishment_candidates",
      "rykas.inventory.capital_release_candidates",
      "rykas.sale_event.evaluate"
    ];
    for (const id of ids) {
      const tool = projectToolRegistry[id];
      expect(tool.classification).toBe("READ");
      expect(tool.policyCategory).toBe("RESEARCH_READ_ONLY");
      expect(tool.profiles).toEqual(["RYKAS_GM"]);
    }
  });

  it("accepts null buying capacity when required truth is unavailable", () => {
    const result = rykasCapitalPlanSchema.parse({
      schemaVersion: "RYKAS_CAPITAL_PLAN_V1",
      status: "BLOCKED",
      asOf: observedAt,
      settledCashOnly: true,
      amazonForecastCountedAsSettledCash: false,
      purchaseAuthorized: false,
      purchaseExecuted: false,
      debtPaymentAuthorized: false,
      debtPaymentExecuted: false,
      missingInputs: ["BUSINESS_CASH"],
      blockers: ["Business cash is missing."],
      grossCash: null,
      forecastCash30Days: null,
      committedCapital: null,
      openObligations: null,
      minimumDebtObligations: null,
      debtPaymentBuffer: null,
      operatingReserve: null,
      coreReplenishmentReserve: null,
      coreReplenishmentShortfall: null,
      plannedExtraDebtReduction: null,
      preliminaryFreeCapital: null,
      safeBuyingCapacity: null,
      coreReplenishmentBudget: null,
      growthInventoryBudget: null,
      opportunisticSaleBudget: null,
      speculativeTestBudget: null,
      remainingBuffer: null,
      sources: []
    });
    expect(result.safeBuyingCapacity).toBeNull();
    expect(result.amazonForecastCountedAsSettledCash).toBe(false);
  });

  it("limits owner updates to financial facts and rejects credential-shaped extras", () => {
    const update = {
      version: 1,
      observedAt,
      businessCash: { label: "Operating cash", amount: 30_000 },
      debts: null,
      obligations: null,
      ownerCertifiedOpenCommitments: null,
      localInventorySnapshots: null,
      ownerPolicy: null,
      poCertification: null
    };
    expect(rykasOwnerFinancialUpdateSchema.safeParse(update).success).toBe(true);
    expect(
      rykasOwnerFinancialUpdateSchema.safeParse({
        ...update,
        bankAccountNumber: "123456789"
      }).success
    ).toBe(false);
    expect(
      rykasOwnerFinancialUpdateSchema.safeParse({
        ...update,
        businessCash: { ...update.businessCash, amount: -1 }
      }).success
    ).toBe(false);
  });

  it("cannot represent a purchase, debt payment, or commitment as executed", () => {
    const receipt = {
      schemaVersion: "RYKAS_OWNER_FINANCIAL_TRUTH_UPDATE_V1",
      status: "SAVED",
      writes: {
        businessCash: 1,
        debts: 0,
        obligations: 0,
        ownerPolicy: 0,
        poCertification: 0,
        ownerCertifiedOpenCommitments: 0,
        localInventorySnapshots: 0
      },
      observedAt,
      purchaseAuthorized: false,
      purchaseExecuted: false,
      debtPaymentAuthorized: false,
      debtPaymentExecuted: false,
      financialCommitmentCreated: false
    };
    expect(rykasOwnerFinancialUpdateResultSchema.safeParse(receipt).success).toBe(true);
    expect(
      rykasOwnerFinancialUpdateResultSchema.safeParse({
        ...receipt,
        purchaseExecuted: true
      }).success
    ).toBe(false);
  });

  it("accepts 13 debts, multiple obligations, aggregate commitments, and estimated garage inventory", () => {
    const debts = Array.from({ length: 13 }, (_, index) => ({
      displayName: `Debt ${index + 1}`, debtType: "OTHER", pricingType: index === 0 ? "FIXED_FEE" : "APR",
      currentBalance: 1000 + index, apr: index === 0 ? null : 0.2, minimumPayment: 25,
      nextDueDate: null, promotionalRateEnd: null, ownerPriority: index + 1,
      remainingFinancingFee: index === 0 ? 100 : null, remainingTotalRepayment: null,
      paymentCadence: "MONTHLY", requiredPeriodicPayment: 25, notes: null
    }));
    const result = rykasOwnerFinancialUpdateSchema.parse({
      version: 1, observedAt, businessCash: null,
      debts: { status: "CURRENT_ROWS_LOADED", items: debts, note: null },
      obligations: { status: "CURRENT_ROWS_LOADED", items: [
        { vendor: "A", description: "Invoice A", amountDue: 100, dueDate: "2026-09-01", category: "SUPPLIER", relatedPurchaseOrderId: null },
        { vendor: "B", description: "Freight", amountDue: 200, dueDate: "2026-09-02", category: "FREIGHT", relatedPurchaseOrderId: null }
      ], note: null },
      ownerCertifiedOpenCommitments: { totalOpenCommitments: 22161, note: "Aggregate only" },
      localInventorySnapshots: { status: "CURRENT_ROWS_LOADED", items: [{ location: "GARAGE", inventoryCostBasis: 5000, confidence: "ESTIMATED", notes: null }], note: null },
      ownerPolicy: null, poCertification: null
    });
    expect(result.debts?.items).toHaveLength(13);
    expect(result.obligations?.items).toHaveLength(2);
    expect(result.debts?.items[0]?.apr).toBeNull();
    expect(rykasOwnerFinancialUpdateSchema.safeParse({ ...result, amazonSales: 123 }).success).toBe(false);
  });
});
