import { describe, expect, it } from "vitest";
import { financialSnapshotSchema } from "@/lib/rykas-truth-contract";
import { financialSnapshotV11Fixture } from "../../ryanos-agent-runner/tests/fixtures/financial-snapshot-v1-1";

describe("RyanOS Rykas V1.1 financial contract", () => {
  it("accepts aggregate commitment protection and partial inventory cost truth", () => {
    const snapshot = financialSnapshotSchema.parse(financialSnapshotV11Fixture);
    expect(snapshot.commitments).toMatchObject({
      detailedOpenPurchaseOrders: 0,
      ownerCertifiedTotalOpenCommitments: 22161,
      protectedCommittedCapital: 22161,
      aggregateCertifiesDetailedLedger: false
    });
    expect(snapshot.inventoryCapitalPosition).toMatchObject({
      knownOwnedInventoryAtCost: 42885.38,
      totalOwnedInventoryAtCost: null,
      countedAsCash: false
    });
    expect(snapshot.missingInputs).toEqual(["AMAZON_SALES_INVENTORY", "DEBT"]);
  });

  it("does not silently accept the superseded V1 commitments and inventory fields", () => {
    const oldV1 = {
      ...financialSnapshotV11Fixture,
      commitments: { openPurchaseOrders: 0, openLines: 0, asOf: financialSnapshotV11Fixture.asOf },
      inventory: {},
      inventoryCapitalPosition: undefined
    };
    expect(financialSnapshotSchema.safeParse(oldV1).success).toBe(false);
  });
});
