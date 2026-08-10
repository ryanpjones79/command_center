import { readFileSync } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

function readSource(...parts: string[]) {
  return readFileSync(path.join(rootDir, ...parts), "utf8");
}

describe("Often Anchors", () => {
  it("adds optional anchor templates without turning them into recurring daily tasks", () => {
    const board = readSource("components", "execution", "time-block-board.tsx");
    const actions = readSource("app", "time-blocks", "actions.ts");

    expect(board).toContain("Often Anchors");
    expect(board).toContain("Try to fit these often. Not daily debt.");
    expect(board).toContain("oftenAnchorTemplates");
    expect(board).toContain('id: "walking"');
    expect(board).toContain('id: "workout"');
    expect(board).toContain('id: "golf-practice"');
    expect(actions).toContain("walking:");
    expect(actions).toContain("workout:");
    expect(actions).toContain('"golf-practice":');
    expect(actions).not.toContain('recurrenceFrequency: "DAILY"');
  });
});
