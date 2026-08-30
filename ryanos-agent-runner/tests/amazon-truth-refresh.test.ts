import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AmazonTruthRefreshAdapter, amazonTruthRefreshRequestSchema, amazonTruthRefreshResultSchema } from "../src/amazon-truth-refresh.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

const result = {
  schemaVersion: "RYKAS_AMAZON_TRUTH_REFRESH_V1" as const, status: "CURRENT" as const, executionState: "COMPLETED" as const, failureCode: null,
  message: "Core Amazon truth is current.", ordersThrough: "2026-08-30", financialsThrough: "2026-08-25", inventoryThrough: "2026-08-30", observedAt: "2026-08-30T15:13:13.256Z",
  remainingStaleAreas: [], downloadedReports: ["GET_FLAT_FILE_ALL_ORDERS_DATA_BY_LAST_UPDATE_GENERAL", "GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2", "GET_FBA_INVENTORY_PLANNING_DATA"], loadedSources: ["dbo.OrderHistory", "dbo.PaymentTransactionsV2", "dbo.FbaInventoryPlanning"],
  ownerFinancialTruthChanged: false as const, poCertificationChanged: false as const, purchaseExecuted: false as const, listingChanged: false as const, priceChanged: false as const, orderCreated: false as const, paymentExecuted: false as const,
  startedAt: "2026-08-30T15:11:46.206Z", completedAt: "2026-08-30T15:13:13.257Z"
};

describe("bounded Amazon truth refresh adapter", () => {
  it("accepts only the fixed versioned operation", () => {
    expect(amazonTruthRefreshRequestSchema.parse({ version: 1, operation: "AMAZON_TRUTH_REFRESH" })).toEqual({ version: 1, operation: "AMAZON_TRUTH_REFRESH" });
    for (const request of [{ version: 1, operation: "AMAZON_TRUTH_REFRESH", command: "whoami" }, { version: 1, operation: "AMAZON_TRUTH_REFRESH", path: "x" }, { version: 1, operation: "SQL", sql: "select 1" }, { version: 1, operation: "AMAZON_TRUTH_REFRESH", url: "https://example.com" }]) expect(amazonTruthRefreshRequestSchema.safeParse(request).success).toBe(false);
  });

  it("maps deterministically to the registered script and validates safe output", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "rykas-amazon-refresh-")); roots.push(root);
    const tools = path.join(root, "tools", "command_center"); mkdirSync(tools, { recursive: true });
    const script = path.join(tools, "Invoke-AmazonTruthRefresh.ps1"); writeFileSync(script, "# fixed\n");
    let call: { command: string; args: string[]; cwd: string } | null = null;
    const adapter = new AmazonTruthRefreshAdapter(60_000, async (command, args, cwd) => { call = { command, args, cwd }; return { stdout: `progress\n${JSON.stringify(result)}\n`, stderr: "", code: 0 }; });
    await expect(adapter.execute(root, { version: 1, operation: "AMAZON_TRUTH_REFRESH" })).resolves.toEqual(amazonTruthRefreshResultSchema.parse(result));
    expect(call).toMatchObject({ command: "powershell.exe", cwd: root });
    expect(call!.args).toEqual(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script]);
  });
});
