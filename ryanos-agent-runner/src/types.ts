export type Capability = "REPOSITORY_READ" | "REPOSITORY_CHANGE" | "RUN_TESTS" | "CODEX_IMPLEMENTATION" | "CODEX_REVIEW";
export type Claim = { workItemId: string; projectId: string; runId: string; claimToken: string; leaseExpiresAt: string; workerType: Capability;
  objective: string; expectedValue: string; acceptanceCriteria: string; projectObjective: string; currentBottleneck: string; workspaceIdentifier: string;
  allowedCapability: Capability; sandboxPolicy: "READ_ONLY" | "WORKSPACE_WRITE"; networkPolicy: "OFF" | "ALLOWLIST"; operationalContext: string | null;
  attempt: number; maxAttempts: number; externalThreadId: string | null };
export type WorkerResult = { status: "SUCCEEDED" | "FAILED"; summary: string; filesChanged: string[]; testsRun: string[]; testResults: string;
  commitSha?: string | null; branch?: string | null; worktree?: string | null; unresolvedIssues: string[]; evidence: string;
  acceptanceCriteriaSatisfied: boolean; recommendedQaAction: "PASS" | "REPAIR" | "ESCALATE"; qaFeedback?: string;
  externalThreadId?: string; externalRunId?: string; providerIdentifier?: string; modelIdentifier?: string };
