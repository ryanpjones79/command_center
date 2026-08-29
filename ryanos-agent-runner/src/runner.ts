import type { RunnerConfig, Workspace } from "./config.js";
import { loadWorkspaceRegistry } from "./config.js";
import { RyanOsClient } from "./api-client.js";
import { CodexWorker } from "./codex-worker.js";
import { resolveWorkspace } from "./workspace-registry.js";
import { WorktreeManager } from "./worktree.js";
import { verifyRepositoryResult } from "./qa.js";

export class LocalRunner {
  private registry: Record<string, Workspace>; private client: RyanOsClient; private worker: CodexWorker; private worktrees: WorktreeManager;
  constructor(private config: RunnerConfig) { this.registry = loadWorkspaceRegistry(config.RYANOS_WORKSPACE_REGISTRY); this.client = new RyanOsClient(config); this.worker = new CodexWorker(config); this.worktrees = new WorktreeManager(config.RYANOS_WORKTREE_ROOT); }
  async once() {
    if (this.config.FEATURE_RUNNER_EXECUTION !== "true") return false;
    const capabilities = ["REPOSITORY_READ", "REPOSITORY_CHANGE", "RUN_TESTS", "CODEX_IMPLEMENTATION", "CODEX_REVIEW"];
    const claim = await this.client.claim(capabilities); if (!claim) return false;
    let heartbeat: NodeJS.Timeout | undefined;
    try {
      const workspace = resolveWorkspace(this.registry, claim.workspaceIdentifier, claim.allowedCapability);
      const mutable = claim.allowedCapability === "REPOSITORY_CHANGE" || claim.allowedCapability === "CODEX_IMPLEMENTATION";
      const isolated = mutable ? await this.worktrees.create(workspace.canonicalPath, workspace.projectSlug, claim.workItemId) : { branch: null, worktree: workspace.canonicalPath, baseCommit: undefined };
      heartbeat = setInterval(() => void this.client.heartbeat(claim).catch(() => undefined), 60_000);
      const codexResult = await this.worker.execute(claim, isolated.worktree);
      const verified = await verifyRepositoryResult(this.worktrees, isolated.worktree, workspace, codexResult, isolated.baseCommit);
      await this.client.result(claim, { ...verified, branch: isolated.branch, worktree: isolated.worktree });
      return true;
    } catch (error) {
      await this.client.failure(claim, error instanceof Error ? error.message : "Unknown runner failure");
      return false;
    } finally { if (heartbeat) clearInterval(heartbeat); }
  }
}
