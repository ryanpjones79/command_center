import type { AgentActionCategory } from "@/lib/agent-policy";

export type PortfolioProjectSnapshot = {
  projectId: string;
  name: string;
  objective: string;
  primaryKpi: string | null;
  health: string;
  currentBottleneck: string | null;
  activeWorkCount: number;
  maxConcurrentWorkItems: number;
  pendingDecisionCount: number;
  lastAgentReviewAt: Date | null;
  nextAgentReviewAt: Date | null;
};

export type ChiefPortfolioAssessment = {
  generatedAt: Date;
  status: "HEALTHY" | "NEEDS_ATTENTION" | "BLOCKED";
  movingProjectIds: string[];
  stalledProjectIds: string[];
  wipViolationProjectIds: string[];
  projectsNeedingPmReview: string[];
  attentionSummary: string;
  prioritizationRecommendations?: Array<{ projectId: string; action: "PRIORITIZE" | "DEPRIORITIZE" | "KEEP"; rationale: string }>;
  recommendedParkProjectIds?: string[];
  recommendedResumeProjectIds?: string[];
  ownerEscalations?: Array<{ projectId: string; question: string; rationale: string }>;
};

export interface ChiefPortfolioAgent {
  inspectPortfolio(projects: PortfolioProjectSnapshot[], now: Date): Promise<ChiefPortfolioAssessment>;
}

export type OwnerDecisionPlan = {
  category: AgentActionCategory;
  question: string;
  context: string;
  recommendedChoice: string;
  availableChoices: string[];
  expectedUpside: string;
  risk: string;
  amountCents?: number;
  currency?: string;
  capability?: string;
  boundedPayload?: Record<string, unknown>;
  authorizationExpiresAt?: Date;
  createsActionRequest?: boolean;
};

export type AgentWorkPlan = {
  disposition?: "CREATE_WORK" | "WAIT" | "PARK";
  title: string;
  objective: string;
  expectedValue: string;
  acceptanceCriteria: string;
  agentRole: string;
  actionCategory: AgentActionCategory;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  maxAttempts: number;
  plannedBottleneck: string;
  requiredCapability?: string;
  sandboxPolicy?: "READ_ONLY" | "WORKSPACE_WRITE";
  networkPolicy?: "OFF" | "ALLOWLIST";
  operationalContext?: string;
  dependsOnWorkItemId?: string;
  ownerDecisionAfterQa?: OwnerDecisionPlan;
};

export type ProjectManagerContext = {
  profile: string;
  projectId: string;
  projectName: string;
  objective: string;
  primaryKpi: string | null;
  currentBottleneck: string | null;
  instructions: string;
  autonomyPolicy: string;
  escalationPolicy: string;
  existingWorkTitles: string[];
  operatingMode?: string;
  toolEvidence?: Array<{ toolId: string; summary: string; output: unknown }>;
};

export interface ProjectManagerAgent {
  chooseNextWork(context: ProjectManagerContext): Promise<AgentWorkPlan>;
}

export type WorkerExecutionInput = AgentWorkPlan & {
  workItemId: string;
  attempt: number;
  workspaceIdentifier: string | null;
};

export type WorkerExecutionResult = {
  operationalResultSummary: string;
  evidence: string;
  structuredOutcome: Record<string, unknown>;
  providerIdentifier: string;
  executorIdentifier: string;
  externalThreadId?: string;
  externalRunId?: string;
  testOutcome?: string;
};

export interface AgentWorker {
  execute(input: WorkerExecutionInput): Promise<WorkerExecutionResult>;
}

export type QaOutcome = "PASS" | "REPAIR" | "ESCALATE";

export type QaVerification = {
  outcome: QaOutcome;
  feedback: string;
  evidence: string;
  escalation?: OwnerDecisionPlan;
};

export interface AgentVerifier {
  verify(input: {
    plan: AgentWorkPlan;
    result: WorkerExecutionResult;
    attempt: number;
    maxAttempts: number;
  }): Promise<QaVerification>;
}
