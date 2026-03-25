import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const resolvedEnv = withNormalizedDatabaseUrl(process.env);

if (args.length === 0) {
  console.error("Usage: node scripts/prisma-command.mjs <prisma args>");
  process.exit(1);
}

const resolvedSchemaPath = resolveSchemaPath(resolvedEnv);
const finalArgs = hasSchemaArg(args) ? args : [...args, "--schema", resolvedSchemaPath];
const prismaCliPath = path.resolve(process.cwd(), "node_modules", "prisma", "build", "index.js");

console.log(`[prisma] using schema ${displayPath(resolvedSchemaPath)}`);

const result = spawnSync(process.execPath, [prismaCliPath, ...finalArgs], {
  cwd: process.cwd(),
  env: resolvedEnv,
  stdio: "inherit"
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);

function resolveSchemaPath(env) {
  const explicitPath = env.PRISMA_SCHEMA_PATH;
  if (explicitPath) {
    return normalizePath(explicitPath);
  }

  const databaseUrl = env.DATABASE_URL ?? "";
  if (isPostgresUrl(databaseUrl)) {
    return normalizePath("prisma/schema.postgres.prisma");
  }

  return normalizePath("prisma/schema.prisma");
}

function hasSchemaArg(values) {
  return values.some((value, index) => value === "--schema" || (index > -1 && value.startsWith("--schema=")));
}

function isPostgresUrl(value) {
  return (
    value.startsWith("postgresql://") ||
    value.startsWith("postgres://") ||
    value.startsWith("prisma://") ||
    value.startsWith("prisma+postgres://")
  );
}

function normalizePath(value) {
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}

function displayPath(value) {
  const relativePath = path.relative(process.cwd(), value);
  return relativePath.length > 0 ? relativePath : value;
}

function withNormalizedDatabaseUrl(env) {
  if (!env.DATABASE_URL && env.NETLIFY_DATABASE_URL) {
    return {
      ...env,
      DATABASE_URL: env.NETLIFY_DATABASE_URL
    };
  }

  return env;
}
