import { describe, expect, it } from "vitest";
import { groupRecentEvents, operatorIssue } from "@/lib/agent-operator-summary";

describe("Agent HQ operator summaries", () => {
  it("keeps raw Zod arrays out of the primary summary", () => {
    const raw = JSON.stringify([{ code: "invalid_type", path: ["data", "financialSnapshot", "commitments", "openPurchaseOrders"] }]);
    const issue = operatorIssue(`Rykas validation failed: ${raw}`);
    expect(issue.summary).toContain("Rykas read contract mismatch");
    expect(issue.summary).not.toContain("invalid_type");
    expect(issue.technicalEvidence).toContain("openPurchaseOrders");
  });

  it("groups repetitive movement and enforces a bounded list", () => {
    const events = Array.from({ length: 30 }, (_, index) => ({
      id: String(index), summary: index < 5 ? "Rykas Zod contract validation failed" : `Normal event ${index}`,
      project: { name: "Rykas" }
    }));
    const grouped = groupRecentEvents(events, 12);
    expect(grouped).toHaveLength(12);
    expect(grouped[0]).toMatchObject({ repeatCount: 5 });
  });
});
