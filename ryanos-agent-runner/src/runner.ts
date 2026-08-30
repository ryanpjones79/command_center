import type { RunnerConfig, Workspace } from "./config.js";
import { loadWorkspaceRegistry } from "./config.js";
import { RyanOsClient } from "./api-client.js";
import { CodexWorker } from "./codex-worker.js";
import { resolveWorkspace } from "./workspace-registry.js";
import { WorktreeManager } from "./worktree.js";
import { verifyRepositoryResult } from "./qa.js";
import { RykasTruthAdapter } from "./rykas-adapter.js";
import { AmazonTruthRefreshAdapter } from "./amazon-truth-refresh.js";

export class LocalRunner {
  private registry: Record<string, Workspace>; private client: RyanOsClient; private worker: CodexWorker; private worktrees: WorktreeManager;
  constructor(private config: RunnerConfig) { this.registry = loadWorkspaceRegistry(config.RYANOS_WORKSPACE_REGISTRY); this.client = new RyanOsClient(config); this.worker = new CodexWorker(config); this.worktrees = new WorktreeManager(config.RYANOS_WORKTREE_ROOT); }
  async once() {
    if (this.config.FEATURE_RUNNER_EXECUTION !== "true") return false;
    const capabilities = ["REPOSITORY_READ", "REPOSITORY_CHANGE", "RUN_TESTS", "CODEX_IMPLEMENTATION", "CODEX_REVIEW", ...(this.config.FEATURE_RYKAS_TRUTH_READ === "true" ? ["RYKAS_OPERATIONS_READ"] : []), ...(this.config.FEATURE_RYKAS_OWNER_DATA_WRITE === "true" ? ["RYKAS_OWNER_DATA_UPDATE"] : []), ...(this.config.FEATURE_RYKAS_AMAZON_TRUTH_REFRESH === "true" ? ["RYKAS_AMAZON_TRUTH_REFRESH"] : [])];
    const claim = await this.client.claim(capabilities); if (!claim) return false;
    let heartbeat: NodeJS.Timeout | undefined;
    try {
      const workspace = resolveWorkspace(this.registry, claim.workspaceIdentifier, claim.allowedCapability);
      if (claim.allowedCapability === "RYKAS_OPERATIONS_READ") {
        const request = JSON.parse(claim.operationalContext ?? "null") as unknown;
        const result = await new RykasTruthAdapter(this.config).execute(request);
        await this.client.result(claim, { status: "SUCCEEDED", summary: `Read-only Rykas ${result.operation} completed.`, filesChanged: [], testsRun: ["Zod input/output validation"], testResults: "Bounded result schema passed.", unresolvedIssues: result.data.blockers.map((item) => item.summary), evidence: JSON.stringify({ observedAt: result.observedAt, authoritativeSource: result.authoritativeSource, freshness: result.freshness, blockerCount: result.data.blockers.length }), acceptanceCriteriaSatisfied: true, recommendedQaAction: "PASS", providerIdentifier: "rykas-local-truth", rykasTruthResult: result });
        return true;
      }
      if (claim.allowedCapability === "RYKAS_OWNER_DATA_UPDATE") {
        const request = JSON.parse(claim.operationalContext ?? "null") as unknown;
        const result = await new RykasTruthAdapter(this.config).executeOwnerFinancialUpdate(request);
        await this.client.result(claim, { status: "SUCCEEDED", summary: "Rykas owner financial truth saved; a fresh read is required.", filesChanged: [], testsRun: ["Zod input/output validation"], testResults: "Bounded owner-data result schema passed.", unresolvedIssues: [], evidence: JSON.stringify({ observedAt: result.observedAt, writes: result.writes, purchaseExecuted: false, debtPaymentExecuted: false }), acceptanceCriteriaSatisfied: true, recommendedQaAction: "PASS", providerIdentifier: "rykas-local-owner-data", rykasOwnerFinancialUpdateResult: result });
        return true;
      }
      if (claim.allowedCapability === "RYKAS_AMAZON_TRUTH_REFRESH") {
        const request = JSON.parse(claim.operationalContext ?? "null") as unknown;
        const result = await new AmazonTruthRefreshAdapter(this.config.RYKAS_AMAZON_REFRESH_TIMEOUT_MS).execute(workspace.canonicalPath, request);
        const succeeded = result.status === "CURRENT";
        await this.client.result(claim, { status: succeeded ? "SUCCEEDED" : "FAILED", summary: succeeded ? "Amazon system truth is current." : result.executionState === "ALREADY_RUNNING" ? "Amazon truth refresh is already running." : "Amazon connection needs attention.", filesChanged: [], testsRun: ["Strict operation contract", "Authoritative SQL freshness verification", "Protected owner-truth fingerprint verification"], testResults: result.message, unresolvedIssues: result.remainingStaleAreas, evidence: JSON.stringify({ status: result.status, executionState: result.executionState, failureCode: result.failureCode, ordersThrough: result.ordersThrough, financialsThrough: result.financialsThrough, inventoryThrough: result.inventoryThrough, observedAt: result.observedAt, ownerFinancialTruthChanged: false, poCertificationChanged: false, purchaseExecuted: false, listingChanged: false }), acceptanceCriteriaSatisfied: succeeded, recommendedQaAction: succeeded ? "PASS" : "REPAIR", providerIdentifier: "rykas-local-amazon-truth-refresh", rykasAmazonTruthRefreshResult: result });
        return succeeded;
      }
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
