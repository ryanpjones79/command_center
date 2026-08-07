import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const componentsDir = path.join(process.cwd(), "components", "execution");

function readComponent(fileName: string) {
  return readFileSync(path.join(componentsDir, fileName), "utf8");
}

describe("Phase 2B Today operating screen", () => {
  it("keeps the core Today flow local to UI components", () => {
    const boardSource = readComponent("time-block-board.tsx");

    expect(boardSource).toContain("<MorningLaunchCard");
    expect(boardSource).toContain("<MorningCard");
    expect(boardSource).toContain("<HowRyanOSWorksCard");
    expect(boardSource).toContain("<TimeBlockGrid");
    expect(boardSource).toContain("<ShutdownPanel");
    expect(boardSource).not.toContain("schema.prisma");
    expect(boardSource).not.toContain("migration");
  });

  it("makes Needle Move, relationship, and way of being prominent", () => {
    const morningSource = readComponent("morning-card.tsx");
    const boardSource = readComponent("time-block-board.tsx");

    expect(morningSource).toContain(
      "What completed result would make today meaningful?"
    );
    expect(morningSource).toContain("Who needs my presence today?");
    expect(morningSource).toContain("Daughter");
    expect(morningSource).toContain("Coworker");
    expect(morningSource).toContain("Customer");
    expect(morningSource).toContain("Myself");
    expect(morningSource).toContain("aria-pressed");
    expect(boardSource).toContain('"Curious"');
  });

  it("uses calmer operating language for commitments and work supply", () => {
    const boardSource = readComponent("time-block-board.tsx");
    const shutdownSource = readComponent("shutdown-panel.tsx");

    expect(boardSource).toContain("Available Work");
    expect(boardSource).toContain("No available work is waiting.");
    expect(boardSource).toContain("Calendar + placed work");
    expect(shutdownSource).toContain("What shipped?");
    expect(shutdownSource).toContain("What remains open?");
    expect(shutdownSource).toContain("What matters tomorrow?");
    expect(shutdownSource).toContain("Notebook pages to index later");
  });

  it("keeps How RyanOS Works collapsed by default", () => {
    const source = readComponent("how-ryanos-works-card.tsx");

    expect(source).toContain("useState(true)");
    expect(source).toContain("storedValue === null ? true");
    expect(source).toContain("aria-expanded");
  });
});
