import type { AmazonTruthRefreshResult } from "./amazon-truth-refresh.js";
import type { RykasTruthResult } from "./rykas-contracts.js";

export type Capability = "REPOSITORY_READ" | "REPOSITORY_CHANGE" | "RUN_TESTS" | "CODEX_IMPLEMENTATION" | "CODEX_REVIEW" | "RYKAS_OPERATIONS_READ" | "RYKAS_OWNER_DATA_UPDATE" | "RYKAS_AMAZON_TRUTH_REFRESH";
export type Claim = { workItemId: string; projectId: string; runId: string; claimToken: string; leaseExpiresAt: string; workerType: Capability;
  objective: string; expectedValue: string; acceptanceCriteria: string; projectObjective: string; currentBottleneck: string; workspaceIdentifier: string;
  allowedCapability: Capability; sandboxPolicy: "READ_ONLY" | "WORKSPACE_WRITE"; networkPolicy: "OFF" | "ALLOWLIST" | "LOCALHOST_ONLY"; operationalContext: string | null;
  attempt: number; maxAttempts: number; externalThreadId: string | null };
export type WorkerResult = { status: "SUCCEEDED" | "FAILED"; summary: string; filesChanged: string[]; testsRun: string[]; testResults: string;
  commitSha?: string | null; branch?: string | null; worktree?: string | null; unresolvedIssues: string[]; evidence: string;
  acceptanceCriteriaSatisfied: boolean; recommendedQaAction: "PASS" | "REPAIR" | "ESCALATE"; qaFeedback?: string;
  externalThreadId?: string; externalRunId?: string; providerIdentifier?: string; modelIdentifier?: string; rykasTruthResult?: RykasTruthResult; rykasOwnerFinancialUpdateResult?: Record<string, unknown>; rykasAmazonTruthRefreshResult?: AmazonTruthRefreshResult };
