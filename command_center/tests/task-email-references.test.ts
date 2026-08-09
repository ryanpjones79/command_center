import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

function readSource(...parts: string[]) {
  return readFileSync(path.join(rootDir, ...parts), "utf8");
}

describe("task email references", () => {
  it("adds a task reference model to both Prisma schemas", () => {
    for (const schemaName of ["schema.prisma", "schema.postgres.prisma"]) {
      const schema = readSource("prisma", schemaName);

      expect(schema).toContain("model ExecutionTaskReference");
      expect(schema).toContain("taskReferences     ExecutionTaskReference[]");
      expect(schema).toContain("references          ExecutionTaskReference[]");
      expect(schema).toContain("@@index([taskId, createdAt])");
    }

    expect(
      existsSync(path.join(rootDir, "prisma", "migrations", "20260809090000_add_execution_task_references", "migration.sql"))
    ).toBe(true);
  });

  it("loads references with task maintenance and time block data", () => {
    const service = readSource("server", "execution-service.ts");

    expect(service).toContain("references: { orderBy: { createdAt: \"desc\" } }");
  });

  it("supports attaching Gmail or Outlook references without mailbox integration", () => {
    const actions = readSource("app", "execution-actions.ts");
    const referenceComponent = readSource("components", "execution", "task-email-references.tsx");
    const tasksPage = readSource("app", "tasks", "page.tsx");
    const board = readSource("components", "execution", "time-block-board.tsx");

    expect(actions).toContain("addExecutionTaskReferenceAction");
    expect(actions).toContain("deleteExecutionTaskReferenceAction");
    expect(referenceComponent).toContain("Paste Gmail or Outlook message link");
    expect(referenceComponent).toContain("<option value=\"gmail\">Gmail</option>");
    expect(referenceComponent).toContain("<option value=\"outlook\">Outlook</option>");
    expect(tasksPage).toContain("Email References");
    expect(board).toContain("Email References");
    expect(board).toContain("Open");
  });
});
