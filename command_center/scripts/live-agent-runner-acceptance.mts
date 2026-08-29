// ESM is required because the official Codex SDK is ESM-only.
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import prismaModule from "../lib/prisma.ts";
import orchestrationModule from "../server/agent/orchestration-service.ts";
import type { OrchestrationServices } from "../server/agent/orchestration-service";
import { LocalRunner } from "../../ryanos-agent-runner/src/runner.js";
import type { RunnerConfig } from "../../ryanos-agent-runner/src/config.js";

const { prisma } = prismaModule as typeof import("../lib/prisma");
const { runAgentOrchestrationCycle } = orchestrationModule as typeof import("../server/agent/orchestration-service");

async function main() {
const port = 3117; const baseUrl = `http://127.0.0.1:${port}`; const secret = "local-acceptance-secret-" + "x".repeat(32); const keyId = `acceptance-${Date.now()}`;
const root = mkdtempSync(path.join(os.tmpdir(), "ryanos-control-plane-acceptance-")); const repo = path.join(root, "repo"); const worktrees = path.join(root, "worktrees"); const registryPath = path.join(root, "workspaces.json"); mkdirSync(repo);
writeFileSync(path.join(repo, "package.json"), JSON.stringify({ private: true, scripts: { test: "node --test" }, type: "module" }, null, 2));
writeFileSync(path.join(repo, "multiply.test.js"), "import test from 'node:test'; import assert from 'node:assert/strict'; import { multiply } from './multiply.js'; test('multiplies', () => assert.equal(multiply(4, 5), 20));\n");
writeFileSync(path.join(repo, "README.md"), "Disposable full RyanOS runner acceptance fixture. Implement multiply.js only.\n");
execFileSync("git", ["init"], { cwd: repo }); execFileSync("git", ["config", "user.email", "acceptance@ryanos.local"], { cwd: repo }); execFileSync("git", ["config", "user.name", "RyanOS Acceptance"], { cwd: repo }); execFileSync("git", ["add", "."], { cwd: repo }); execFileSync("git", ["commit", "-m", "safe fixture"], { cwd: repo });
writeFileSync(registryPath, JSON.stringify({ workspaces: { "acceptance-repo": { canonicalPath: repo, projectSlug: "acceptance", capabilities: ["CODEX_IMPLEMENTATION"], networkPolicy: "OFF", sensitivity: "STANDARD", testCommands: [{ command: "npm.cmd", args: ["test"] }] } } }, null, 2));

const user = await prisma.user.create({ data: { email: `${keyId}@local.invalid`, passwordHash: "not-a-login" } });
const domain = await prisma.executionDomain.create({ data: { userId: user.id, name: "Acceptance", slug: "acceptance" } });
const project = await prisma.executionProject.create({ data: { userId: user.id, domainId: domain.id, name: "Agent Runner Acceptance" } });
await prisma.agentProjectConfig.create({ data: { userId: user.id, projectId: project.id, profile: "ACCEPTANCE_PM", operatingMode: "LIVE_INTERNAL", objective: "Prove safe full runner execution", projectManagerInstructions: "Create only bounded work", autonomyPolicy: "Internal repository only", escalationPolicy: "Escalate side effects", workspaceIdentifier: "acceptance-repo", nextAgentReviewAt: new Date(Date.now() + 86_400_000) } });
const work = await prisma.agentWorkItem.create({ data: { userId: user.id, projectId: project.id, idempotencyKey: `live:${keyId}`, title: "Implement multiply helper", objective: "Create multiply.js exporting a pure multiply(a, b) function; change no other file", expectedValue: "Proves full control-plane-to-runner flow", acceptanceCriteria: "Only multiply.js is added and npm test passes", agentRole: "CODE_WORKER", actionCategory: "REVERSIBLE_REPOSITORY_WORK", requiredCapability: "CODEX_IMPLEMENTATION", sandboxPolicy: "WORKSPACE_WRITE", networkPolicy: "OFF", workspaceIdentifier: "acceptance-repo" } });
await prisma.agentRunner.create({ data: { userId: user.id, keyId, name: "Disposable acceptance runner" } });

const server = spawn(process.execPath, [path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next"), "dev", "-p", String(port)], { cwd: process.cwd(), windowsHide: true,
  env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? "file:./dev.db", RYANOS_RUNNER_HMAC_KEYS: JSON.stringify({ [keyId]: secret }), FEATURE_RUNNER_EXECUTION: "true", FEATURE_AGENT_MODELS: "false" }, stdio: ["ignore", "pipe", "pipe"] });
let serverLog = ""; server.stdout.on("data", (v) => serverLog += String(v)); server.stderr.on("data", (v) => serverLog += String(v));
try {
  for (let attempt = 0; attempt < 60; attempt++) { try { const response = await fetch(`${baseUrl}/api/health`); if (response.ok) break; } catch {} await new Promise((resolve) => setTimeout(resolve, 500)); if (attempt === 59) throw new Error(`Local RyanOS did not start. ${serverLog.slice(-2000)}`); }
  const config = { RYANOS_BASE_URL: baseUrl, RYANOS_RUNNER_KEY_ID: keyId, RYANOS_RUNNER_HMAC_SECRET: secret, RYANOS_WORKSPACE_REGISTRY: registryPath, RYANOS_WORKTREE_ROOT: worktrees, RUNNER_POLL_MS: 1000, RUNNER_VERSION: "live-acceptance", FEATURE_RUNNER_EXECUTION: "true", FEATURE_CODEX_EXECUTION: "true", CODEX_MODEL: "", CODEX_TIMEOUT_MS: 600000 } as RunnerConfig;
  if (!await new LocalRunner(config).once()) throw new Error("Runner did not complete the claimed work.");
  const persisted = await prisma.agentWorkItem.findUniqueOrThrow({ where: { id: work.id }, include: { runs: true } });
  const services: OrchestrationServices = { projectManager: { async chooseNextWork() { return { disposition: "WAIT", title: "Wait", objective: "Wait", expectedValue: "Avoid make-work", acceptanceCriteria: "No item", agentRole: "PM", actionCategory: "RESEARCH_READ_ONLY", priority: "LOW", maxAttempts: 1, plannedBottleneck: "Acceptance milestone verified" }; } }, worker: { async execute() { throw new Error("unused"); } }, verifier: { async verify() { throw new Error("unused"); } } };
  const continuation = await runAgentOrchestrationCycle(new Date(Date.now() + 1000), { userId: user.id, projectIds: [project.id], services });
  console.log(JSON.stringify({ workItemId: work.id, state: persisted.state, threadId: persisted.externalThreadId, runStatus: persisted.runs[0]?.status, provider: persisted.runs[0]?.providerIdentifier, model: persisted.runs[0]?.modelIdentifier, evidenceRecorded: Boolean(persisted.evidenceSummary), pmContinuation: continuation.projects[0]?.outcome }, null, 2));
  if (persisted.state !== "READY_FOR_REVIEW" || continuation.projects[0]?.outcome !== "WAITING") process.exitCode = 1;
} finally {
  server.kill(); await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined); await prisma.$disconnect();
  if (process.exitCode !== 1) rmSync(root, { recursive: true, force: true });
}
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
