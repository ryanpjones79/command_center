import { readFileSync } from "node:fs";
import path from "node:path";

// The task connector runs on Railway (moved from the old Vercel deployment 2026-11-25). The build itself never
// touches the database; only Railway's pre-deploy step applies the (additive) schema.
it("Railway build performs no database push or seed; pre-deploy applies the schema", () => {
  const pkg = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
  const railway = JSON.parse(readFileSync(path.join(process.cwd(), "railway.json"), "utf8"));
  expect(railway.build.buildCommand).toBe("npm run build");
  expect(pkg.scripts.build).not.toMatch(/db.push|seed|deploy:bootstrap|migrate deploy/);
  expect(pkg.scripts["railway:web:predeploy"]).toBe("npm run prisma:deploy:bootstrap");
});
