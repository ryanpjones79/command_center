import { readFileSync } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

function readSource(...parts: string[]) {
  return readFileSync(path.join(rootDir, ...parts), "utf8");
}

describe("CreateTaskForm project filtering", () => {
  it("filters Add Task projects by the selected area", () => {
    const source = readSource("components", "execution", "create-task-form.tsx");

    expect(source).toContain("const [selectedDomainId, setSelectedDomainId]");
    expect(source).toContain("const [selectedProjectId, setSelectedProjectId]");
    expect(source).toContain("projects.filter((project) => project.domainId === selectedDomainId)");
    expect(source).toContain("setSelectedProjectId(\"\")");
    expect(source).toContain("Projects are filtered to the selected area.");
  });
});
