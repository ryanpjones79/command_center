import { execFileSync } from "node:child_process";
import { closeSync, existsSync, openSync, rmSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

// Throwaway SQLite database for v2 integration tests (same pattern as the
// existing agent tests). Never points at a real database.
export async function createV2TestDb(name: string) {
  const databasePath = path.join(process.cwd(), `.v2-${name}-${process.pid}.db`);
  const databaseUrl = `file:${databasePath.replaceAll("\\", "/")}`;
  closeSync(openSync(databasePath, "w"));
  const prismaCli = path.join(process.cwd(), "node_modules", "prisma", "build", "index.js");
  execFileSync(
    process.execPath,
    [prismaCli, "db", "push", "--skip-generate", "--schema", path.join(process.cwd(), "prisma", "schema.prisma")],
    { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe" }
  );
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const user = await db.user.create({ data: { email: `v2-${name}@example.test`, passwordHash: "x" } });
  for (const [name_, slug] of [["Work", "work"], ["Rykas", "rykas"], ["Casino/AP", "casino-ap"], ["Betting Models", "betting-models"], ["Health", "health"], ["Family", "family"], ["Admin", "admin"]]) {
    await db.executionDomain.create({ data: { userId: user.id, name: name_, slug } });
  }
  async function cleanup() {
    await db.$disconnect();
    for (const suffix of ["", "-journal"]) {
      const file = `${databasePath}${suffix}`;
      if (existsSync(file)) rmSync(file, { force: true });
    }
  }
  return { db, userId: user.id, cleanup };
}
