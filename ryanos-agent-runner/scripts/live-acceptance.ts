import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CodexWorker } from "../src/codex-worker.js";
import { verifyRepositoryResult } from "../src/qa.js";
import { WorktreeManager } from "../src/worktree.js";
import type { RunnerConfig, Workspace } from "../src/config.js";
import type { Claim } from "../src/types.js";

const root = mkdtempSync(path.join(os.tmpdir(), "ryanos-live-acceptance-")); const repo = path.join(root, "repo"); const trees = path.join(root, "worktrees"); mkdirSync(repo);
writeFileSync(path.join(repo, "package.json"), JSON.stringify({ private: true, scripts: { test: "node --test" }, type: "module" }, null, 2));
writeFileSync(path.join(repo, "add.test.js"), "import test from 'node:test'; import assert from 'node:assert/strict'; import { add } from './add.js'; test('adds two numbers', () => assert.equal(add(2, 3), 5));\n");
writeFileSync(path.join(repo, "README.md"), "Disposable RyanOS Codex SDK acceptance fixture. Implement add.js only.\n");
execFileSync("git", ["init"], { cwd: repo }); execFileSync("git", ["config", "user.email", "acceptance@ryanos.local"], { cwd: repo }); execFileSync("git", ["config", "user.name", "RyanOS Acceptance"], { cwd: repo }); execFileSync("git", ["add", "."], { cwd: repo }); execFileSync("git", ["commit", "-m", "safe fixture"], { cwd: repo });

const config = { FEATURE_CODEX_EXECUTION: "true", CODEX_MODEL: process.env.CODEX_MODEL ?? "", CODEX_TIMEOUT_MS: 600000 } as RunnerConfig;
const claim = { workItemId: `acceptance-${Date.now()}`, projectId: "disposable", objective: "Create add.js exporting a pure add(a, b) function so the existing test passes. Change no other file.", expectedValue: "Proves bounded local repository execution", acceptanceCriteria: "Only add.js is added and npm test passes", projectObjective: "Verify RyanOS safe local Codex execution", currentBottleneck: "Missing implementation", workspaceIdentifier: "disposable", allowedCapability: "CODEX_IMPLEMENTATION", sandboxPolicy: "WORKSPACE_WRITE", networkPolicy: "OFF", operationalContext: "Harmless disposable repository; no external actions.", attempt: 1, maxAttempts: 2, externalThreadId: null } as Claim;
const workspace: Workspace = { canonicalPath: repo, projectSlug: "acceptance", capabilities: ["CODEX_IMPLEMENTATION"], networkPolicy: "OFF", sensitivity: "STANDARD", testCommands: [{ command: "npm.cmd", args: ["test"] }] };
const manager = new WorktreeManager(trees); const isolated = await manager.create(repo, workspace.projectSlug, claim.workItemId);
const codex = await new CodexWorker(config).execute(claim, isolated.worktree);
const verified = await verifyRepositoryResult(manager, isolated.worktree, workspace, codex, isolated.baseCommit);
console.log(JSON.stringify({ root, threadId: codex.externalThreadId, branch: isolated.branch, worktree: isolated.worktree, filesChanged: verified.filesChanged, testResults: verified.testResults, qa: verified.recommendedQaAction, acceptanceCriteriaSatisfied: verified.acceptanceCriteriaSatisfied }, null, 2));
if (verified.recommendedQaAction !== "PASS") process.exitCode = 1;
