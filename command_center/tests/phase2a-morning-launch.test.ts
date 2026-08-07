import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const componentsDir = path.join(process.cwd(), "components", "execution");

function readComponent(fileName: string) {
  return readFileSync(path.join(componentsDir, fileName), "utf8");
}

describe("Phase 2A morning launch UI", () => {
  it("renders the paper-first Morning Compass copy without persistence", () => {
    const source = readComponent("morning-launch-card.tsx");

    expect(source).toContain("Morning Compass");
    expect(source).toContain("The notebook is your first workspace.");
    expect(source).toContain("dailyReading.tradition");
    expect(source).toContain("dailyReading.passage");
    expect(source).toContain("dailyReading.prompt");
    expect(source).toContain("Reflect");
    expect(source).toContain("Reflect for a few minutes.");
    expect(source).toContain("What deserves my attention today?");
    expect(source).toContain("What can I release?");
    expect(source).toContain("How do I want to show up?");
    expect(source).toContain('href="/daily-brief"');
    expect(source).toContain("Open Daily Brief");
    expect(source).toContain("Continue to Today");
    expect(source).toContain("Close RyanOS");
    expect(source).not.toContain("save");
    expect(source).not.toContain("Action");
  });

  it("keeps How RyanOS Works collapse state in localStorage only", () => {
    const source = readComponent("how-ryanos-works-card.tsx");

    expect(source).toContain("How RyanOS Works");
    expect(source).toContain("Paper is where you think.");
    expect(source).toContain("RyanOS is where you commit.");
    expect(source).toContain("window.localStorage");
    expect(source).not.toContain("prisma");
    expect(source).not.toContain("saveDailyPlanAction");
  });

  it("keeps presence and way-of-being fields local to the Today board", () => {
    const boardSource = readComponent("time-block-board.tsx");
    const morningSource = readComponent("morning-card.tsx");

    expect(boardSource).toContain('useState("")');
    expect(boardSource).toContain("presenceIntention");
    expect(boardSource).toContain("wayOfBeing");
    expect(boardSource).toContain("isMorningLaunchComplete");
    expect(boardSource).not.toContain("relationshipIntention");
    expect(boardSource).not.toContain("wayOfBeing:");
    expect(morningSource).toContain("Who needs my presence today?");
    expect(morningSource).toContain("Way of being");
  });
});
