import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(filePath: string) {
  return fs.readFileSync(path.join(root, filePath), "utf8");
}

describe("Phase 5 seasons", () => {
  it("adds the Season model to both Prisma schemas", () => {
    for (const schemaPath of ["prisma/schema.prisma", "prisma/schema.postgres.prisma"]) {
      const schema = read(schemaPath);

      expect(schema).toContain("enum SeasonStatus");
      expect(schema).toContain("model Season");
      expect(schema).toContain("seasons           Season[]");
      expect(schema).toContain("seasonId        String?");
      expect(schema).toContain("season          Season?");
      expect(schema).toContain("@@index([userId, isCurrent])");
      expect(schema).toContain("@@index([userId, seasonId])");
    }
  });

  it("keeps the season migration additive", () => {
    const migration = read("prisma/migrations/20260803002000_add_seasons/migration.sql");

    expect(migration).toContain('CREATE TABLE "Season"');
    expect(migration).toContain('ALTER TABLE "ExecutionProject" ADD COLUMN "seasonId" TEXT');
    expect(migration).not.toMatch(/\bDROP\b/i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it("enforces one current season through the service transaction", () => {
    const service = read("server/season-service.ts");

    expect(service).toContain("updateMany({");
    expect(service).toContain("where: { userId, isCurrent: true");
    expect(service).toContain("data: { isCurrent: false }");
    expect(service).toContain("data: { isCurrent: true, status: \"ACTIVE\" }");
  });

  it("surfaces current season on the Today operating screen", () => {
    const planner = read("server/execution-service.ts");
    const board = read("components/execution/time-block-board.tsx");
    const page = read("app/time-blocks/page.tsx");
    const card = read("components/execution/current-season-card.tsx");

    expect(planner).toContain("getCurrentSeason(userId)");
    expect(page).toContain("currentSeason={planner.currentSeason}");
    expect(board).toContain("<CurrentSeasonCard season={currentSeason} />");
    expect(card).toContain("Current Season");
    expect(card).toContain("No projects assigned");
  });

  it("lets projects optionally belong to a season", () => {
    const validation = read("lib/execution-validation.ts");
    const actions = read("app/execution-actions.ts");
    const form = read("components/execution/create-project-form.tsx");
    const projects = read("app/projects/page.tsx");

    expect(validation).toContain("seasonId: z.string().cuid().optional()");
    expect(actions).toContain("getOwnedSeason");
    expect(actions).toContain("seasonId: formData.get(\"seasonId\") || undefined");
    expect(form).toContain("name=\"seasonId\"");
    expect(projects).toContain("No Season");
  });

  it("adds Season Archive to Library and season context to Weekly Reset", () => {
    const library = read("app/library/page.tsx");
    const archive = read("app/library/seasons/page.tsx");
    const weeklyReset = read("app/weekly-review/page.tsx");

    expect(library).toContain("Season Archive");
    expect(archive).toContain("Completed Seasons");
    expect(archive).toContain("Current Season");
    expect(weeklyReset).toContain("Does this week's work support your current season?");
  });
});
