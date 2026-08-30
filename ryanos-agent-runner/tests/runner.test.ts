import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { signRequest } from "../src/api-client.js";
import { CodexWorker } from "../src/codex-worker.js";
import { resolveWorkspace } from "../src/workspace-registry.js";
import { WorktreeManager } from "../src/worktree.js";
import type { RunnerConfig, Workspace } from "../src/config.js";
import type { Claim } from "../src/types.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const workspace: Workspace = { canonicalPath: ".", projectSlug: "safe", capabilities: ["CODEX_IMPLEMENTATION"], networkPolicy: "OFF", sensitivity: "STANDARD", testCommands: [] };

describe("fail-closed runner boundaries", () => {
  it("signs the canonical request deterministically", () => {
    expect(signRequest("POST", "/api/runner/claim", "2026-01-01T00:00:00Z", "abc", "{}", "s".repeat(32))).toHaveLength(64);
  });
  it("denies unknown workspaces, capabilities, and sensitive CCHCS paths", () => {
    expect(() => resolveWorkspace({}, "invented", "CODEX_IMPLEMENTATION")).toThrow("Unregistered");
    expect(() => resolveWorkspace({ safe: workspace }, "safe", "CODEX_REVIEW")).toThrow("does not allow");
    expect(() => resolveWorkspace({ cchcs: { ...workspace, sensitivity: "CCHCS_SENSITIVE" } }, "cchcs", "CODEX_IMPLEMENTATION")).toThrow("Sensitive CCHCS");
    const rykas: Workspace = { canonicalPath: ".", projectSlug: "rykas", capabilities: ["RYKAS_OPERATIONS_READ", "RYKAS_AMAZON_TRUTH_REFRESH"], networkPolicy: "LOCALHOST_ONLY", sensitivity: "STANDARD", testCommands: [] };
    expect(resolveWorkspace({ "rykas-repo": rykas }, "rykas-repo", "RYKAS_OPERATIONS_READ").projectSlug).toBe("rykas");
    expect(() => resolveWorkspace({ other: rykas }, "other", "RYKAS_OPERATIONS_READ")).toThrow("fixed rykas-repo");
    expect(resolveWorkspace({ "rykas-repo": rykas }, "rykas-repo", "RYKAS_AMAZON_TRUTH_REFRESH").projectSlug).toBe("rykas");
  });
});

describe("Codex adapter and worktree isolation", () => {
  const config = { FEATURE_CODEX_EXECUTION: "true", CODEX_MODEL: "test-model", CODEX_TIMEOUT_MS: 1000 } as RunnerConfig;
  const claim = { workItemId: "work1", projectId: "p1", objective: "Add safe test", expectedValue: "Test", acceptanceCriteria: "Pass", projectObjective: "Safe", currentBottleneck: "Missing test", workspaceIdentifier: "safe", allowedCapability: "CODEX_IMPLEMENTATION", sandboxPolicy: "WORKSPACE_WRITE", networkPolicy: "OFF", operationalContext: null, attempt: 1, maxAttempts: 2, externalThreadId: null } as Claim;
  it("normalizes structured output and uses restrictive SDK options", async () => {
    let options: Record<string, unknown> = {};
    const worker = new CodexWorker(config, () => ({
      startThread(value) { options = value as Record<string, unknown>; return { id: "thread-safe", run: async () => ({ finalResponse: JSON.stringify({ status: "SUCCEEDED", summary: "done", filesChanged: ["a.ts"], testsRun: [], testResults: "", unresolvedIssues: [], evidence: "diff", acceptanceCriteriaSatisfied: true, recommendedQaAction: "PASS" }), items: [], usage: null }) } as never; },
      resumeThread() { throw new Error("unused"); }
    }));
    const result = await worker.execute(claim, "C:\\safe");
    expect(result.externalThreadId).toBe("thread-safe"); expect(options).toMatchObject({ sandboxMode: "workspace-write", networkAccessEnabled: false, approvalPolicy: "never", skipGitRepoCheck: false });
  });
  it("creates a separate branch/worktree and refuses a dirty canonical repo", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "ryanos-worktree-")); roots.push(root); const repo = path.join(root, "repo"); const trees = path.join(root, "trees"); mkdirSync(repo);
    execFileSync("git", ["init"], { cwd: repo }); execFileSync("git", ["config", "user.email", "runner@test.local"], { cwd: repo }); execFileSync("git", ["config", "user.name", "Runner Test"], { cwd: repo });
    writeFileSync(path.join(repo, "README.md"), "safe\n"); execFileSync("git", ["add", "."], { cwd: repo }); execFileSync("git", ["commit", "-m", "initial"], { cwd: repo });
    const manager = new WorktreeManager(trees); const isolated = await manager.create(repo, "safe", "one"); expect(isolated.worktree).not.toBe(repo); expect(isolated.branch).toBe("agent/safe/one");
    writeFileSync(path.join(repo, "human.txt"), "uncommitted"); await expect(manager.create(repo, "safe", "two")).rejects.toThrow("dirty");
  });
});
