import { describe, expect, it } from "vitest";
import { buildInboxFeed, guessLane, isDueForReview, splitCapturedText } from "@/server/inbox/inbox";

const NOW = new Date("2026-11-19T16:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

describe("capture parsing (Apple Notes paste)", () => {
  it("makes one idea per line and strips bullets, checkboxes and numbering", () => {
    const pasted = [
      "Ideas",
      "",
      "- Call Level Brands about MOQ",
      "• Try Costco clearance on route",
      "1. eBay: relist the 5 stale lots",
      "2) Ask Jim about OPPE dashboard",
      "☐ Free play at Pechanga expires Sunday",
      "[ ] Protein shakes for the week",
      "[x] Protein shakes for the week",
      "----",
      "   "
    ].join("\r\n");
    expect(splitCapturedText(pasted)).toEqual([
      "Ideas",
      "Call Level Brands about MOQ",
      "Try Costco clearance on route",
      "eBay: relist the 5 stale lots",
      "Ask Jim about OPPE dashboard",
      "Free play at Pechanga expires Sunday",
      "Protein shakes for the week"
    ]);
  });

  it("caps very long lines and returns nothing for blank input", () => {
    expect(splitCapturedText("x".repeat(800))[0]).toHaveLength(500);
    expect(splitCapturedText(" \n \n")).toEqual([]);
  });
});

describe("area guess", () => {
  it("routes common ideas to the right area and defaults to Personal", () => {
    expect(guessLane("eBay: relist the 5 stale lots")).toBe("EBAY");
    expect(guessLane("Call Level Brands supplier about MOQ")).toBe("RYKAS");
    expect(guessLane("Try the store route through Costco")).toBe("RYKAS");
    expect(guessLane("Ask Jim about OPPE dashboard")).toBe("CCHCS");
    expect(guessLane("Free play at Pechanga expires Sunday")).toBe("CASINO_AP");
    expect(guessLane("Check Novig maker fills")).toBe("AP_TRADER");
    expect(guessLane("Protein shakes for the week")).toBe("HEALTH");
    expect(guessLane("Kids school pictures form")).toBe("KIDS");
    expect(guessLane("Renew passport")).toBe("PERSONAL");
  });
});

describe("inbox as a to-do", () => {
  it("raises a sort card while anything is unsorted, with the oldest age", () => {
    const feed = buildInboxFeed({ unsorted: [{ parkedAt: daysAgo(3) }, { parkedAt: daysAgo(0) }], dueForReview: 0 }, NOW);
    expect(feed.cards).toHaveLength(1);
    expect(feed.cards[0]).toMatchObject({ id: "inbox:sort", kind: "DECISION", title: "Sort 2 captured ideas", href: "/inbox" });
    expect(feed.cards[0].whyNow).toContain("waited 3 days");
  });

  it("raises a review card for parked ideas 30+ days old", () => {
    const feed = buildInboxFeed({ unsorted: [], dueForReview: 4 }, NOW);
    expect(feed.cards.map((card) => card.title)).toEqual(["Review 4 parked ideas"]);
    expect(isDueForReview({ status: "parked", touchedAt: daysAgo(31) }, NOW)).toBe(true);
    expect(isDueForReview({ status: "parked", touchedAt: daysAgo(10) }, NOW)).toBe(false);
    expect(isDueForReview({ status: "note", touchedAt: daysAgo(90) }, NOW)).toBe(false);
  });

  it("is empty only when every idea has a decision", () => {
    expect(buildInboxFeed({ unsorted: [], dueForReview: 0 }, NOW)).toMatchObject({ status: "EMPTY", cards: [] });
  });
});
