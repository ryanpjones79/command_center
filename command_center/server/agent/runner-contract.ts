import type { AgentActionCategory, AgentPolicyOutcome } from "@/lib/agent-policy";

export type RunnerClaimRequest = {
  executorIdentifier: string;
  capabilities: string[];
  workspaceIdentifiers: string[];
  leaseDurationSeconds: number;
};

export type RunnerClaim = {
  workItemId: string;
  projectId: string;
  claimToken: string;
  leaseExpiresAt: string;
  title: string;
  objective: string;
  acceptanceCriteria: string;
  actionCategory: AgentActionCategory;
  policyOutcome: AgentPolicyOutcome;
  workspaceIdentifier: string | null;
  repositoryIdentifier: string | null;
  attempt: number;
  maxAttempts: number;
};

export type RunnerHeartbeat = {
  workItemId: string;
  claimToken: string;
  executorIdentifier: string;
  externalRunId?: string;
  externalThreadId?: string;
};

export type RunnerResultSubmission = RunnerHeartbeat & {
  status: "SUCCEEDED" | "FAILED";
  operationalResultSummary: string;
  evidence: string;
  structuredOutcome: Record<string, unknown>;
  providerIdentifier?: string;
  modelIdentifier?: string;
  commitSha?: string;
  pullRequestUrl?: string;
  testOutcome?: string;
};

export interface AgentRunnerGateway {
  claim(request: RunnerClaimRequest): Promise<RunnerClaim | null>;
  heartbeat(request: RunnerHeartbeat): Promise<{ leaseExpiresAt: string }>;
  submitResult(request: RunnerResultSubmission): Promise<void>;
  release(request: RunnerHeartbeat): Promise<void>;
}

// Phase 1 intentionally exposes no inbound local-machine endpoint. A Phase 2 runner
// will authenticate and poll outbound through an implementation of this interface.
