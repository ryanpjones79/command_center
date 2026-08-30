import { readFileSync } from "node:fs";
import { z } from "zod";

const envSchema = z.object({ RYANOS_BASE_URL: z.string().url(), RYANOS_RUNNER_KEY_ID: z.string().min(1), RYANOS_RUNNER_HMAC_SECRET: z.string().min(32),
  RYANOS_WORKSPACE_REGISTRY: z.string().min(1), RYANOS_WORKTREE_ROOT: z.string().min(1), RUNNER_POLL_MS: z.coerce.number().int().min(1000).default(15000),
  RUNNER_VERSION: z.string().default("0.1.0"), FEATURE_RUNNER_EXECUTION: z.enum(["true", "false"]).default("true"), FEATURE_CODEX_EXECUTION: z.enum(["true", "false"]).default("false"),
  FEATURE_RYKAS_TRUTH_READ: z.enum(["true", "false"]).default("false"), RYKAS_TRUTH_BASE_URL: z.string().url().default("http://127.0.0.1:8765"),
  FEATURE_RYKAS_OWNER_DATA_WRITE: z.enum(["true", "false"]).default("false"),
  FEATURE_RYKAS_AMAZON_TRUTH_REFRESH: z.enum(["true", "false"]).default("false"),
  RYKAS_AMAZON_REFRESH_TIMEOUT_MS: z.coerce.number().int().min(60_000).max(7_200_000).default(1_800_000),
  RYKAS_TRUTH_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(10000),
  CODEX_MODEL: z.string().default(""), CODEX_TIMEOUT_MS: z.coerce.number().int().min(1000).max(3_600_000).default(900000) });
export type RunnerConfig = z.infer<typeof envSchema>;
export function loadConfig(env: NodeJS.ProcessEnv = process.env) { return envSchema.parse(env); }

const workspaceSchema = z.object({ workspaces: z.record(z.object({ canonicalPath: z.string().min(1), projectSlug: z.string().regex(/^[a-z0-9-]+$/),
  capabilities: z.array(z.enum(["REPOSITORY_READ", "REPOSITORY_CHANGE", "RUN_TESTS", "CODEX_IMPLEMENTATION", "CODEX_REVIEW", "RYKAS_OPERATIONS_READ", "RYKAS_OWNER_DATA_UPDATE", "RYKAS_AMAZON_TRUTH_REFRESH"])),
  networkPolicy: z.enum(["OFF", "ALLOWLIST", "LOCALHOST_ONLY"]), sensitivity: z.enum(["STANDARD", "CCHCS_PHI_FREE", "CCHCS_SENSITIVE"]),
  testCommands: z.array(z.object({ command: z.string().min(1), args: z.array(z.string()) })).default([]) })) });
export type Workspace = z.infer<typeof workspaceSchema>["workspaces"][string];
export function loadWorkspaceRegistry(path: string) { return workspaceSchema.parse(JSON.parse(readFileSync(path, "utf8"))).workspaces; }
