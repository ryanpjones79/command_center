import { describe, expect, it } from "vitest";
import { suggestTargets, TAG_AT_END, taskMatches } from "@/lib/v2/plan-filters";
import type { QuickTarget } from "@/lib/v2/quick-add";

const task = (over = {}) => ({ title: "Mark down tote bag", projectName: "eBay: Markdowns & offers", areaName: "eBay", source: "EBAY", waitingOn: null, urgent: false, start: null, ...over });

describe("plan search and filters", () => {
  it("search matches title, project, area and app; every word must match", () => {
    expect(taskMatches(task(), "tote", new Set())).toBe(true);
    expect(taskMatches(task(), "markdowns", new Set())).toBe(true);
    expect(taskMatches(task(), "ebay tote", new Set())).toBe(true);
    expect(taskMatches(task(), "tote redstone", new Set())).toBe(false);
    expect(taskMatches(task({ source: "RYKAS", areaName: "Rykas", projectName: null }), "supplier", new Set())).toBe(true);
  });

  it("quick filters: due soon, from apps, mine, not scheduled", () => {
    expect(taskMatches(task(), "", new Set(["due"]))).toBe(false);
    expect(taskMatches(task({ urgent: true }), "", new Set(["due"]))).toBe(true);
    expect(taskMatches(task(), "", new Set(["apps"]))).toBe(true);
    expect(taskMatches(task(), "", new Set(["mine"]))).toBe(false);
    expect(taskMatches(task({ source: null }), "", new Set(["mine"]))).toBe(true);
    expect(taskMatches(task({ start: "2026-11-23T17:00:00Z" }), "", new Set(["unscheduled"]))).toBe(false);
  });
});

describe("# project suggestions", () => {
  const targets: QuickTarget[] = [
    { id: "a1", name: "Rykas", slug: "rykas", kind: "AREA", domainId: "a1" },
    { id: "p1", name: "Amazon: Wholesale sourcing", kind: "PROJECT", domainId: "a1" },
    { id: "p2", name: "Rykas operations", kind: "PROJECT", domainId: "a1" },
    { id: "p3", name: "Christmas shopping", kind: "PROJECT", domainId: "a2" }
  ];

  it("finds projects by any part of the name, projects before areas, name-starts first", () => {
    expect(suggestTargets("whole", targets).map((t) => t.id)).toEqual(["p1"]);
    expect(suggestTargets("ryk", targets).map((t) => t.id)).toEqual(["p2", "a1"]);
    expect(suggestTargets("chris", targets).map((t) => t.id)).toEqual(["p3"]);
    expect(suggestTargets("", targets)).toHaveLength(4);
  });

  it("only the word being typed at the end counts as a #tag", () => {
    expect("Call Redstone #whol".match(TAG_AT_END)?.[2]).toBe("whol");
    expect("Call #rykas about MOQ".match(TAG_AT_END)).toBeNull();
    expect("#".match(TAG_AT_END)?.[2]).toBe("");
  });
});
