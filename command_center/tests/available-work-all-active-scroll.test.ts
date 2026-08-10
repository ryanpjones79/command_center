import { readFileSync } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

function readSource(...parts: string[]) {
  return readFileSync(path.join(rootDir, ...parts), "utf8");
}

describe("Available Work panel", () => {
  it("shows every active unscheduled task and scrolls inside the panel", () => {
    const service = readSource("server", "execution-service.ts");
    const board = readSource("components", "execution", "time-block-board.tsx");

    expect(service).toContain(
      "unscheduledTasks: sortedTasks.filter((task) => !isScheduledOnSelectedDay(task))"
    );
    expect(service).not.toContain(
      "unscheduledTasks: sortedTasks.filter(\n      (task) => !isScheduledOnSelectedDay(task) && !isParkingLotTask(task)"
    );
    expect(board).toContain("flex max-h-[calc(100vh-8rem)] flex-col");
    expect(board).toContain("min-h-0 flex-1 space-y-2.5 overflow-y-auto");
  });
});
