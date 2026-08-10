import { readFileSync } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

function readSource(...parts: string[]) {
  return readFileSync(path.join(rootDir, ...parts), "utf8");
}

describe("time block calendar overlap layout", () => {
  it("packs simultaneous Google Calendar events into visible columns", () => {
    const grid = readSource("components", "execution", "time-block-grid.tsx");

    expect(grid).toContain("type PositionedCalendarEvent");
    expect(grid).toContain("function layoutCalendarEvents");
    expect(grid).toContain("columnCount");
    expect(grid).toContain("const laneWidth = 48 / event.columnCount");
    expect(grid).toContain("title={`${event.summary}");
  });
});
