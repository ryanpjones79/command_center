import type { RunnerConfig } from "./config.js";
import { rykasReadRequestSchema, rykasTruthResultSchema, type RykasTruthResult } from "./rykas-contracts.js";
import { z } from "zod";

const SOURCE = "Rykas SQL Server database rykas via loopback Command Center marts";
const rawListSchema = z.object({ items: z.array(z.record(z.unknown())).max(500) });
const rawSummarySchema = z.object({ actions: z.array(z.record(z.unknown())).max(100), capital: z.record(z.unknown()) }).passthrough();

function text(value: unknown, max = 1000) { return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null; }
function num(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function int(value: unknown) { const number = num(value); return number === null ? null : Math.max(0, Math.trunc(number)); }
function iso(value: unknown) { if (typeof value !== "string" || !value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function jsonObject(value: unknown) { if (typeof value !== "string" || value.length > 100_000) return {}; try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; } catch { return {}; } }
function strings(value: unknown) { if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string").slice(0, 100); if (typeof value !== "string" || value.length > 50_000) return []; try { return strings(JSON.parse(value)); } catch { return []; } }
function latest(...values: unknown[]) { return values.map(iso).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null; }

function normalizeOpportunity(row: Record<string, unknown>, observedAt: string) {
  const asin = String(row.asin ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin)) throw new Error("Rykas returned an invalid opportunity identity.");
  const reasonCodes = strings(row.reason_codes_json);
  const sourceStatus = text(row.source_status, 100);
  const stale = Boolean(sourceStatus?.includes("STALE") || reasonCodes.some((code) => code.includes("STALE")));
  const sourceUpdatedAt = latest(row.price_observed_at_utc, row.current_source_price_observed_at, row.buy_box_checked_at_utc, row.amazon_market_checked_at_utc, row.eligibility_checked_at_utc, row.last_evaluated_at_utc);
  const missingEvidence: string[] = [];
  for (const [field, value] of [["currentBuyBox", row.current_buy_box], ["observedOrReferenceCost", row.observed_or_reference_cost ?? row.reference_cost], ["profitPerUnit", row.profit_per_unit], ["expectedProfit", row.expected_profit], ["roi", row.roi], ["margin", row.margin], ["estimatedMonthlyUnits", row.estimated_monthly_units], ["sellerCount", row.current_seller_count], ["recommendedUnits", row.recommended_units], ["expectedSpend", row.capital_required]] as const) if (value === null || value === undefined) missingEvidence.push(field);
  if (!sourceUpdatedAt) missingEvidence.push("sourceUpdatedAt");
  const blockers = reasonCodes.filter((code) => code.includes("MISSING") || code.includes("STALE") || code.includes("BLOCKED") || code.includes("NEEDED")).slice(0, 50);
  if (sourceStatus && (sourceStatus.includes("STALE") || sourceStatus.includes("UNVERIFIED"))) blockers.unshift(sourceStatus);
  return {
    opportunityId: `US:${asin}`, asin, vendorSku: text(row.vendor_sku, 200), brand: text(row.brand, 400), title: text(row.product, 1000), supplier: text(row.vendor_or_retailer, 500), discoverySource: text(row.discovery_source, 200), discoveryStrategy: text(row.discovery_strategy, 200),
    currentBuyBox: num(row.current_buy_box), buyBox90: num(row.buy_box_90), observedOrReferenceCost: num(row.observed_or_reference_cost ?? row.reference_cost), maxLandedCost: num(row.max_landed_cost), idealLandedCost: num(row.ideal_landed_cost), profitPerUnit: num(row.profit_per_unit), expectedProfit: num(row.expected_profit), expectedMonthlyContribution: num(row.expected_monthly_contribution), roi: num(row.roi), margin: num(row.margin), estimatedMonthlyUnits: num(row.estimated_monthly_units), units30: num(row.units_30), units90: num(row.units_90), sellerCount: int(row.current_seller_count), amazonOos90: num(row.amazon_oos_90), opportunityScore: num(row.opportunity_score), decision: text(row.opportunity_decision, 80), actionState: text(row.action_bucket, 100) ?? "UNKNOWN", recommendationStatus: text(row.recommendation_status, 100), recommendedUnits: int(row.recommended_units), recommendedCases: num(row.recommended_cases), expectedSpend: num(row.capital_required), eligibilityStatus: text(row.eligibility_status, 100), requiredAction: text(row.eligibility_required_action ?? row.required_action, 200), sourceStatus, reasonCodes, missingEvidence, blockers,
    freshness: { observedAt, authoritativeSource: SOURCE, sourceUpdatedAt, classification: stale ? "STALE" as const : sourceUpdatedAt ? "CURRENT" as const : "UNKNOWN" as const, stale }
  };
}

function purchaseReady(item: ReturnType<typeof normalizeOpportunity>) { return ["BUY NOW", "TEST"].includes(item.actionState) && item.recommendationStatus === "BUY_RECOMMENDATION"; }
function applyView(items: ReturnType<typeof normalizeOpportunity>[], view: "TOP" | "OWNER_ACTION_NEEDED" | "PURCHASE_READY" | "NEEDS_DATA" | "BLOCKED" | "STALE_EVIDENCE") {
  if (view === "OWNER_ACTION_NEEDED") return items.filter((item) => item.actionState !== "WATCH");
  if (view === "PURCHASE_READY") return items.filter(purchaseReady);
  if (view === "NEEDS_DATA") return items.filter((item) => ["PRICE CHECK", "SKU MAPPING NEEDED", "BUY ON PRICE", "SOURCE NEEDED"].includes(item.actionState) || item.missingEvidence.length > 0);
  if (view === "BLOCKED") return items.filter((item) => Boolean(item.recommendationStatus?.startsWith("BLOCKED")) || item.blockers.length > 0);
  if (view === "STALE_EVIDENCE") return items.filter((item) => item.freshness.stale);
  return items;
}

export class RykasTruthAdapter {
  constructor(private config: RunnerConfig, private fetcher: typeof fetch = fetch) {
    const url = new URL(config.RYKAS_TRUTH_BASE_URL);
    if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) || (url.pathname !== "/" && url.pathname !== "")) throw new Error("RYKAS_TRUTH_BASE_URL must be a loopback HTTP origin.");
  }
  private async get(path: string) {
    const url = new URL(path, this.config.RYKAS_TRUTH_BASE_URL);
    const origin = new URL(this.config.RYKAS_TRUTH_BASE_URL);
    if (url.origin !== origin.origin || !url.pathname.startsWith("/api/sourcing/")) throw new Error("Rykas adapter path denied.");
    const response = await this.fetcher(url, { method: "GET", redirect: "error", signal: AbortSignal.timeout(this.config.RYKAS_TRUTH_TIMEOUT_MS), headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`Rykas truth unavailable (${response.status}).`);
    const raw = await response.text(); if (raw.length > 2_000_000) throw new Error("Rykas truth response exceeded the bounded size.");
    return JSON.parse(raw) as unknown;
  }
  async execute(rawRequest: unknown): Promise<RykasTruthResult> {
    if (this.config.FEATURE_RYKAS_TRUTH_READ !== "true") throw new Error("Rykas truth connector is disabled.");
    const request = rykasReadRequestSchema.parse(rawRequest); const observedAt = new Date().toISOString();
    let summary: z.infer<typeof rawSummarySchema> | null = null; let rawItems: Record<string, unknown>[] = []; let detail: Record<string, unknown> | null = null;
    if (request.operation === "OPPORTUNITY_DETAIL") detail = z.record(z.unknown()).parse(await this.get(`/api/sourcing/opportunities/${request.input.opportunityId.slice(3)}`));
    else {
      const [summaryRaw, listRaw] = await Promise.all([this.get("/api/sourcing/summary"), this.get("/api/sourcing/opportunities")]);
      summary = rawSummarySchema.parse(summaryRaw); rawItems = rawListSchema.parse(listRaw).items;
    }
    const all = rawItems.map((row) => normalizeOpportunity(row, observedAt));
    const limit = request.operation === "OPERATIONS_SNAPSHOT" || request.operation === "SOURCING_OPPORTUNITIES" || request.operation === "PURCHASE_CANDIDATES" || request.operation === "OPERATIONS_BLOCKERS" ? request.input.limit : 1;
    const view = request.operation === "SOURCING_OPPORTUNITIES" ? request.input.view : "TOP";
    const opportunities = request.operation === "OPPORTUNITY_DETAIL" ? [] : applyView(all, view).slice(0, limit);
    const matureRows = rawItems.filter((row) => ["BUY NOW", "TEST"].includes(String(row.action_bucket ?? "")) && row.recommendation_status === "BUY_RECOMMENDATION").slice(0, limit);
    const matureDetails = request.operation === "OPPORTUNITY_DETAIL" ? [] : await Promise.all(matureRows.map((row) => this.get(`/api/sourcing/opportunities/${String(row.asin)}`).then((value) => z.record(z.unknown()).parse(value))));
    const purchaseCandidates = matureDetails.map((row) => normalizeOpportunity(row, observedAt)).filter((item) => purchaseReady(item) && !item.freshness.stale && item.missingEvidence.length === 0);
    const capitalRaw = summary?.capital ?? {}; const capital = summary ? { reliable: capitalRaw.reliable === true, status: text(capitalRaw.status, 100) ?? "UNKNOWN", reason: text(capitalRaw.reason, 2000), actionRequired: text(capitalRaw.actionRequired, 1000), asOf: text(capitalRaw.asOf, 100), openCommitments: num(capitalRaw.openCommitments), purchaseOrderRows: int(capitalRaw.purchaseOrderRows) ?? 0, openPurchaseOrderLines: int(capitalRaw.openPurchaseOrderLines) ?? 0, poLedgerStatus: text(capitalRaw.poLedgerStatus, 100) ?? "UNKNOWN", poCertificationState: text(capitalRaw.poCertificationState, 100) ?? "UNKNOWN", poCertifiedAt: iso(capitalRaw.poCertifiedAt), poTruthCurrent: capitalRaw.poTruthCurrent === true, safeInventoryCapital: num(capitalRaw.safeInventoryCapital) } : null;
    const blockers = [] as Array<{ id: string; opportunityId: string | null; stage: "OPPORTUNITY" | "PURCHASE_DECISION" | "INBOUND_INVENTORY" | "LISTING" | "SALE" | "SYSTEM"; code: string; summary: string; sourceUpdatedAt: string | null; stale: boolean }>;
    if (capital && (!capital.reliable || !capital.poTruthCurrent)) blockers.push({ id: "capital-po-truth", opportunityId: null, stage: "PURCHASE_DECISION", code: "CAPITAL_OR_PO_TRUTH_BLOCKED", summary: capital.actionRequired ?? capital.reason ?? "Capital or PO truth is not current.", sourceUpdatedAt: capital.poCertifiedAt, stale: true });
    for (const item of all.filter((candidate) => candidate.actionState !== "WATCH").slice(0, Math.max(0, limit - blockers.length))) blockers.push({ id: `${item.opportunityId}:${item.actionState}`, opportunityId: item.opportunityId, stage: item.actionState === "UNGATING" ? "OPPORTUNITY" : "PURCHASE_DECISION", code: item.actionState.replaceAll(" ", "_"), summary: item.blockers[0] ?? item.requiredAction ?? `${item.actionState} requires bounded owner or evidence action.`, sourceUpdatedAt: item.freshness.sourceUpdatedAt, stale: item.freshness.stale });
    let detailOutput = null;
    if (detail) { const opportunity = normalizeOpportunity(detail, observedAt); const evaluation = jsonObject(detail.evaluation_evidence_json); detailOutput = { opportunity, priceHistory: { buyBox30: num(detail.buy_box_30_days_avg), buyBox90: num(detail.buy_box_90), buyBox180: num(detail.buy_box_180_days_avg) }, competition: { offerCount30: num(detail.offer_count_30_days_avg), offerCount90: num(detail.offer_count_90_days_avg), offerCount180: num(detail.offer_count_180_days_avg) }, inventory: { onHand: num(detail.current_available_inventory), reserved: num(detail.reserved_inventory), inbound: num(detail.inbound_inventory) }, evidence: { evaluationVersion: text(evaluation.evaluation_version, 200), positives: strings(evaluation.positives).map((value) => value.slice(0, 1000)).slice(0, 50), risks: strings(evaluation.risks).map((value) => value.slice(0, 1000)).slice(0, 50), confidenceFactor: num(evaluation.confidence_factor), priceConfidence: text(detail.price_confidence, 100), availabilityConfidence: text(detail.availability_confidence, 100), priceAgeDays: int(detail.price_age_days), quantityStatus: text(detail.recommendation_status, 100), eligibilityCheckedAt: iso(detail.eligibility_checked_at_utc), marketCheckedAt: iso(detail.amazon_market_checked_at_utc), buyBoxCheckedAt: iso(detail.buy_box_checked_at_utc), sourcePriceObservedAt: iso(detail.current_source_price_observed_at ?? detail.price_observed_at_utc) } }; }
    const actionSummary = (summary?.actions ?? []).map((row) => ({ action: text(row.action_bucket, 100) ?? "UNKNOWN", count: int(row.action_count) ?? 0, topOpportunityScore: num(row.top_opportunity_score) })).slice(0, 30);
    const sourceUpdatedAt = latest(detailOutput?.opportunity.freshness.sourceUpdatedAt, capital?.poCertifiedAt, ...all.map((item) => item.freshness.sourceUpdatedAt));
    const stale = Boolean(detailOutput?.opportunity.freshness.stale || capital && !capital.poTruthCurrent || opportunities.some((item) => item.freshness.stale));
    return rykasTruthResultSchema.parse({ schemaVersion: "RYKAS_TRUTH_READ_V1", operation: request.operation, readOnly: true, purchaseAuthorized: false, purchaseExecuted: false, observedAt, authoritativeSource: SOURCE, sourceUpdatedAt, freshness: stale ? "STALE" : sourceUpdatedAt ? "CURRENT" : "UNKNOWN", stale, data: { actionSummary, capital, opportunities: request.operation === "PURCHASE_CANDIDATES" ? [] : opportunities, purchaseCandidates: request.operation === "OPPORTUNITY_DETAIL" ? [] : purchaseCandidates, blockers: blockers.slice(0, limit), detail: detailOutput } });
  }
}
