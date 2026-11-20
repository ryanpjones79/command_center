import { describe, expect, it } from "vitest";
import { capOwnerActions, type OwnerActionCard } from "@/lib/owner-actions";
import { rykasTruthResultSchema, type RykasTruthResult } from "@/lib/rykas-truth-contract";
import {
  buildRykasFeed,
  rykasCardsFromSources,
  type RykasPendingDecision
} from "@/server/today-feed/rykas-feed";

const NOW = new Date("2026-11-19T16:00:00.000Z");
const BASE = "https://supplier.example";

function opportunity(asin: string, overrides: Record<string, unknown> = {}) {
  return {
    opportunityId: `US:${asin}`, asin, vendorSku: null, brand: "Brand", title: `Item ${asin}`,
    supplier: null, discoverySource: null, discoveryStrategy: null, currentBuyBox: 20, buyBox90: 21,
    observedOrReferenceCost: 8, maxLandedCost: 10, idealLandedCost: 9, profitPerUnit: 4,
    expectedProfit: 120, expectedMonthlyContribution: 80, roi: 0.4, margin: 0.2,
    estimatedMonthlyUnits: 60, units30: 55, units90: 160, sellerCount: 4, amazonOos90: 0.1,
    opportunityScore: 70, decision: "BUY NOW", actionState: "BUY NOW",
    recommendationStatus: "BUY_RECOMMENDATION", recommendedUnits: 30, recommendedCases: 5,
    expectedSpend: 240, eligibilityStatus: "ELIGIBLE", requiredAction: null, sourceStatus: "CURRENT",
    reasonCodes: [], missingEvidence: [], blockers: [],
    freshness: { observedAt: NOW.toISOString(), authoritativeSource: "mart", sourceUpdatedAt: null, classification: "CURRENT", stale: false },
    ...overrides
  };
}

function truth(data: Record<string, unknown> = {}, top: Record<string, unknown> = {}): RykasTruthResult {
  return rykasTruthResultSchema.parse({
    schemaVersion: "RYKAS_TRUTH_READ_V1", operation: "OPERATIONS_SNAPSHOT", readOnly: true,
    purchaseAuthorized: false, purchaseExecuted: false, observedAt: NOW.toISOString(),
    authoritativeSource: "rykas", sourceUpdatedAt: null, freshness: "CURRENT", stale: false,
    data: { actionSummary: [], capital: null, opportunities: [], purchaseCandidates: [], blockers: [], detail: null, ...data },
    ...top
  });
}

const decision: RykasPendingDecision = {
  id: "d1", question: "Approve test buy for Item A?", recommendedChoice: "Approve 12 units",
  expectedUpside: null, createdAt: NOW
};

describe("owner action cap", () => {
  it("ranks decisions first, drops duplicate ids, and caps at three", () => {
    const card = (id: string, kind: OwnerActionCard["kind"]): OwnerActionCard => ({
      id, kind, area: "RYKAS", title: id, whyNow: "", minutes: null, dueAt: null, href: "/", external: false, source: "t"
    });
    const result = capOwnerActions([
      card("a", "FOLLOW_UP"), card("b", "BUY_REVIEW"), card("b", "BUY_REVIEW"), card("c", "DECISION"), card("d", "FIX")
    ]);
    expect(result.map((item) => item.id)).toEqual(["c", "d", "b"]);
  });
});

describe("Rykas Today feed", () => {
  it("puts owner decisions ahead of buy reviews and links to the opportunity page", () => {
    const cards = rykasCardsFromSources(
      [decision],
      truth({ purchaseCandidates: [opportunity("B000000001"), opportunity("B000000002"), opportunity("B000000003")] }),
      BASE
    );
    expect(cards).toHaveLength(3);
    expect(cards[0]).toMatchObject({ kind: "DECISION", href: "/agent-hq", external: false });
    expect(cards[1]).toMatchObject({
      kind: "BUY_REVIEW",
      href: `${BASE}/sourcing/opportunities/B000000001`,
      external: true
    });
    expect(cards[1].whyNow).toContain("30 units");
    expect(cards[1].whyNow).toContain("$240");
  });

  it("shows owner-only blockers but skips per-item listing/sale blockers", () => {
    const cards = rykasCardsFromSources([], truth({
      blockers: [
        { id: "po", opportunityId: null, stage: "SYSTEM", code: "PO_LEDGER_UNCERTIFIED", summary: "Certify the PO ledger", sourceUpdatedAt: null, stale: false },
        { id: "ls", opportunityId: "US:B000000009", stage: "LISTING", code: "NOT_LISTED", summary: "Listing missing", sourceUpdatedAt: null, stale: false }
      ]
    }), BASE);
    expect(cards.map((card) => card.title)).toEqual(["Certify the PO ledger"]);
    expect(cards[0].kind).toBe("FIX");
  });

  it("only turns opportunities with a required action into follow-ups and never duplicates a buy", () => {
    const cards = rykasCardsFromSources([], truth({
      purchaseCandidates: [opportunity("B000000001")],
      opportunities: [
        opportunity("B000000001", { requiredAction: "Confirm case pack" }),
        opportunity("B000000004", { requiredAction: "Get supplier price", missingEvidence: ["source price"] }),
        opportunity("B000000005")
      ]
    }), BASE);
    expect(cards.map((card) => card.id)).toEqual([
      "rykas:opportunity:US:B000000001",
      "rykas:opportunity:US:B000000004"
    ]);
    expect(cards[1].whyNow).toBe("Missing: source price");
  });

  it("reports not connected when there is no Rykas project", () => {
    const feed = buildRykasFeed({ connected: false, connectorEnabled: true, decisions: [], truth: null, truthCompletedAt: null, now: NOW });
    expect(feed.status).toBe("UNAVAILABLE");
    expect(feed.cards).toEqual([]);
  });

  it("says the connector is off but still shows pending decisions", () => {
    const feed = buildRykasFeed({ connected: true, connectorEnabled: false, decisions: [decision], truth: null, truthCompletedAt: null, now: NOW });
    expect(feed.status).toBe("READY");
    expect(feed.message).toMatch(/connector is off/);
    expect(feed.cards).toHaveLength(1);
  });

  it("flags data older than a day as stale", () => {
    const feed = buildRykasFeed({
      connected: true, connectorEnabled: true, decisions: [], truth: truth(),
      truthCompletedAt: new Date(NOW.getTime() - 25 * 60 * 60 * 1000), now: NOW
    });
    expect(feed.status).toBe("STALE");
  });

  it("flags data Rykas marks stale and says when nothing needs Ryan", () => {
    expect(buildRykasFeed({ connected: true, connectorEnabled: true, decisions: [], truth: truth({}, { stale: true, freshness: "STALE" }), truthCompletedAt: NOW, now: NOW }).status).toBe("STALE");
    const empty = buildRykasFeed({ connected: true, connectorEnabled: true, decisions: [], truth: truth(), truthCompletedAt: NOW, now: NOW });
    expect(empty).toMatchObject({ status: "EMPTY", cards: [] });
  });
});
