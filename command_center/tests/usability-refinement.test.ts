import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const rootDir = process.cwd();

function readSource(...parts: string[]) {
  return readFileSync(path.join(rootDir, ...parts), "utf8");
}

describe("RyanOS usability refinement", () => {
  it("clarifies Needle Move supporting fields without changing stored rule values", () => {
    const morningCard = readSource(
      "components",
      "execution",
      "morning-card.tsx"
    );

    expect(morningCard).toContain("Commitment Details");
    expect(morningCard).toContain("Why does this matter?");
    expect(morningCard).toContain(
      "This helps RyanOS protect the right kind of work."
    );
    expect(morningCard).toContain("Who benefits?");
    expect(morningCard).toContain("Maria, my daughters, a customer, patients");
    expect(morningCard).toContain("Area");
    expect(morningCard).toContain("Where does this work belong?");
    expect(morningCard).toContain("Advanced status");
    expect(morningCard).toContain("Leadership-visible commitment");
    expect(morningCard).toContain("Revenue or pipeline action");
    expect(morningCard).toContain("Build or artifact ready to ship");
    expect(morningCard).toContain("No special rule");
    expect(morningCard).toContain("value={rule}");
    expect(morningCard).toContain("setDecisionRule(event.target.value)");
  });

  it("keeps area and status chips display-only while separating their meaning", () => {
    const morningCard = readSource(
      "components",
      "execution",
      "morning-card.tsx"
    );

    expect(morningCard).toContain(
      'const primaryAreaLabels = ["CCHCS", "Pipeline", "Rykas", "Personal", "Admin"]'
    );
    expect(morningCard).toContain(
      'const advancedStatusLabels = ["Needle Move", "Parking"]'
    );
    expect(morningCard).not.toContain("setBlockTypes");
  });

  it("renders Focus Check compact by default and expands for active guardrails", () => {
    const morningCard = readSource(
      "components",
      "execution",
      "morning-card.tsx"
    );

    expect(morningCard).toContain("Focus Check");
    expect(morningCard).toContain("Clear runway");
    expect(morningCard).toContain("No guardrails need your attention.");
    expect(morningCard).toContain(
      "buildNeedsRecipient || shouldWarnRykasBacklog || hasEightyPercentItem"
    );
    expect(morningCard).toContain(
      "const showFocusCheckDetails = hasActiveFocusCheck || isFocusCheckOpen"
    );
    expect(morningCard).toContain("I have something 80% done");
    expect(morningCard).toContain("Rykas backlog count");
    expect(morningCard).toContain(
      "You have something nearly finished. Consider shipping it"
    );
    expect(morningCard).toContain("Rykas backlog needs attention.");
    expect(morningCard).toContain("This appears to be work for someone else.");
  });

  it("adds Read to Daily Brief preview, print, and email paths", () => {
    const service = readSource("server", "daily-brief-service.ts");
    const page = readSource("app", "daily-brief", "page.tsx");

    expect(service).toContain('const briefSectionOrder = [\n  "READ"');
    expect(service).toContain("getDailyReadingBrief(referenceDate)");
    expect(service).toContain("Current reading:");
    expect(service).toContain("Theme:");
    expect(service).toContain("Instruction:");
    expect(service).toContain("buildDailyBriefHtml");
    expect(page).toContain('const briefSectionOrder = [\n  "READ"');
    expect(page).toContain('const read = getSectionLines(sections, "READ", 3)');
    expect(page).toContain('title: "Read"');
  });

  it("keeps News Watch online-only for print", () => {
    const page = readSource("app", "daily-brief", "page.tsx");

    expect(page).toContain('<Card className="print:hidden">');
    expect(page).toContain("News Watch");
    expect(page).toContain("printSections.map");
    expect(page).not.toContain('title: "News Watch"');
  });

  it("does not reset the Needle Move draft during same-day background refreshes", () => {
    const board = readSource(
      "components",
      "execution",
      "time-block-board.tsx"
    );
    const morningCard = readSource(
      "components",
      "execution",
      "morning-card.tsx"
    );

    expect(board).toContain("setNeedleMove(dailyPlan.needleMove ?? \"\")");
    expect(board).toContain("}, [dailyPlan.dateKey]);");
    expect(board).not.toContain("}, [dailyPlan, rykasDay]);");
    expect(morningCard).toContain("text-slate-50");
    expect(morningCard).toContain("caret-emerald-200");
  });
});
