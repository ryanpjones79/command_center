import { describe, expect, it, vi } from "vitest";
import type { RunnerConfig } from "../src/config.js";
import { RykasTruthAdapter } from "../src/rykas-adapter.js";
import { rykasReadRequestSchema } from "../src/rykas-contracts.js";

const config = { FEATURE_RYKAS_TRUTH_READ: "true", RYKAS_TRUTH_BASE_URL: "http://127.0.0.1:8765", RYKAS_TRUTH_TIMEOUT_MS: 1000 } as RunnerConfig;
const summary = { actions: [{ action_bucket: "BUY NOW", action_count: 1, top_opportunity_score: 91 }], capital: { reliable: false, status: "BLOCKED", reason: "PO truth stale", actionRequired: "Confirm PO ledger", asOf: "2026-08-29", openCommitments: 0, purchaseOrderRows: 0, openPurchaseOrderLines: 0, poLedgerStatus: "NOT VERIFIED", poCertificationState: "NOT VERIFIED", poCertifiedAt: "2026-08-20T00:00:00Z", poTruthCurrent: false, safeInventoryCapital: null } };
const ready = { asin: "B000000001", product: "Exact item", brand: "Exact brand", vendor_or_retailer: "Exact supplier", vendor_sku: "SKU-1", action_bucket: "BUY NOW", recommendation_status: "BUY_RECOMMENDATION", opportunity_decision: "BUY", opportunity_score: 91, current_buy_box: 20, buy_box_90: 19, observed_or_reference_cost: 10, max_landed_cost: 11, ideal_landed_cost: 9, profit_per_unit: 4, expected_profit: 48, expected_monthly_contribution: 24, roi: 0.4, margin: 0.2, estimated_monthly_units: 6, current_seller_count: 3, amazon_oos_90: 50, recommended_units: 12, recommended_cases: 1, capital_required: 120, eligibility_status: "ELIGIBLE", eligibility_required_action: "NONE", source_status: "CURRENT_VERIFIED_SOURCE", reason_codes_json: "[]", last_evaluated_at_utc: "2026-08-29T12:00:00Z" };
const staleUnknown = { asin: "B000000002", product: "Needs evidence", action_bucket: "PRICE CHECK", opportunity_decision: "SOURCE", opportunity_score: 98, profit_per_unit: null, roi: null, recommended_units: null, capital_required: null, source_status: "STALE_PRICE", reason_codes_json: "[\"STALE_BUY_BOX\"]", last_evaluated_at_utc: "2026-08-20T12:00:00Z" };

function fetcher(items = [ready, staleUnknown]) {
  return vi.fn(async (input: URL | RequestInfo) => {
    const path = new URL(String(input)).pathname;
    const body = path.endsWith("/summary") ? summary : path.endsWith("/opportunities") ? { items } : ready;
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

describe("bounded deterministic Rykas truth adapter", () => {
  it("preserves authoritative economics, labels stale UNKNOWN fields, and never authorizes purchasing", async () => {
    const result = await new RykasTruthAdapter(config, fetcher()).execute({ version: 1, operation: "OPERATIONS_SNAPSHOT", input: { limit: 2 } });
    expect(result.data.purchaseCandidates).toHaveLength(1);
    expect(result.data.purchaseCandidates[0]).toMatchObject({ opportunityId: "US:B000000001", profitPerUnit: 4, roi: 0.4, margin: 0.2, expectedSpend: 120 });
    expect(result.data.opportunities[1]).toMatchObject({ opportunityId: "US:B000000002", profitPerUnit: null, roi: null, freshness: { stale: true, classification: "STALE" } });
    expect(result.data.opportunities[1]?.missingEvidence).toEqual(expect.arrayContaining(["profitPerUnit", "roi", "recommendedUnits", "expectedSpend"]));
    expect(result).toMatchObject({ readOnly: true, purchaseAuthorized: false, purchaseExecuted: false });
  });
  it("enforces hard limits and deterministic opportunity identities", async () => {
    const items = Array.from({ length: 30 }, (_, index) => ({ ...staleUnknown, asin: `B${String(index).padStart(9, "0")}` }));
    const result = await new RykasTruthAdapter(config, fetcher(items)).execute({ version: 1, operation: "SOURCING_OPPORTUNITIES", input: { view: "TOP", limit: 5 } });
    expect(result.data.opportunities).toHaveLength(5); expect(result.data.opportunities[0]?.opportunityId).toBe("US:B000000000");
  });
  it("rejects raw SQL, shell, arbitrary searches, and ambiguous identifiers", async () => {
    const adapter = new RykasTruthAdapter(config, fetcher());
    await expect(adapter.execute({ version: 1, operation: "OPERATIONS_SNAPSHOT", input: { limit: 2, sql: "SELECT *" } })).rejects.toThrow();
    await expect(adapter.execute({ version: 1, operation: "OPPORTUNITY_DETAIL", input: { opportunityId: "US:B000000001", shell: "whoami" } })).rejects.toThrow();
    await expect(adapter.execute({ version: 1, operation: "OPPORTUNITY_DETAIL", input: { opportunityId: "Ultra Pro" } })).rejects.toThrow();
  });
  it("accepts the exact canonical PM wire contract and rejects the invented production wrapper", async () => {
    const wire = JSON.stringify({ version: 1, operation: "OPERATIONS_SNAPSHOT", input: { limit: 10 } });
    const request = rykasReadRequestSchema.parse(JSON.parse(wire));
    const result = await new RykasTruthAdapter(config, fetcher()).execute(request);
    expect(result).toMatchObject({ operation: "OPERATIONS_SNAPSHOT", readOnly: true, purchaseAuthorized: false, purchaseExecuted: false });
    await expect(new RykasTruthAdapter(config, fetcher()).execute({ schemaVersion: "RYKAS_TRUTH_READ_V1", readOnly: true, operation: "OPERATIONS_SNAPSHOT" })).rejects.toThrow();
  });
  it("fails closed for a non-loopback endpoint and SQL/service failure", async () => {
    expect(() => new RykasTruthAdapter({ ...config, RYKAS_TRUTH_BASE_URL: "https://example.com" }, fetcher())).toThrow("loopback");
    const failed = vi.fn(async () => new Response("unavailable", { status: 503 })) as typeof fetch;
    await expect(new RykasTruthAdapter(config, failed).execute({ version: 1, operation: "PURCHASE_CANDIDATES", input: { limit: 10 } })).rejects.toThrow("unavailable");
  });
});
