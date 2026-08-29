-- Additive RyanOS Agent HQ Phase 1 control-plane tables (SQLite).
CREATE TABLE "AgentProjectConfig" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "profile" TEXT NOT NULL DEFAULT 'GENERIC_PM',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "pausedAt" DATETIME,
  "objective" TEXT NOT NULL,
  "primaryKpi" TEXT,
  "currentBottleneck" TEXT,
  "projectManagerInstructions" TEXT NOT NULL,
  "autonomyPolicy" TEXT NOT NULL,
  "escalationPolicy" TEXT NOT NULL,
  "maxConcurrentWorkItems" INTEGER NOT NULL DEFAULT 2,
  "workspaceIdentifier" TEXT,
  "lastAgentReviewAt" DATETIME,
  "nextAgentReviewAt" DATETIME,
  "health" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "spendingThresholdCents" INTEGER,
  "externalActionApproval" TEXT,
  "leaseToken" TEXT,
  "leaseExpiresAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "AgentProjectConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AgentProjectConfig_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ExecutionProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AgentWorkItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "parentWorkItemId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "objective" TEXT NOT NULL,
  "expectedValue" TEXT NOT NULL,
  "acceptanceCriteria" TEXT NOT NULL,
  "agentRole" TEXT NOT NULL,
  "actionCategory" TEXT NOT NULL DEFAULT 'RESEARCH_READ_ONLY',
  "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
  "state" TEXT NOT NULL DEFAULT 'QUEUED',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "blocker" TEXT,
  "resultSummary" TEXT,
  "evidenceSummary" TEXT,
  "executorIdentifier" TEXT,
  "providerIdentifier" TEXT,
  "externalThreadId" TEXT,
  "externalRunId" TEXT,
  "workspaceIdentifier" TEXT,
  "repositoryIdentifier" TEXT,
  "claimToken" TEXT,
  "leaseExpiresAt" DATETIME,
  "heartbeatAt" DATETIME,
  "nextEligibleRunAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" DATETIME,
  "completedAt" DATETIME,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "AgentWorkItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AgentWorkItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ExecutionProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AgentWorkItem_parentWorkItemId_fkey" FOREIGN KEY ("parentWorkItemId") REFERENCES "AgentWorkItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "AgentRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "workItemId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "retryOfRunId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "runType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "providerIdentifier" TEXT,
  "modelIdentifier" TEXT,
  "executorIdentifier" TEXT,
  "externalThreadId" TEXT,
  "externalRunId" TEXT,
  "operationalResultSummary" TEXT,
  "evidence" TEXT,
  "error" TEXT,
  "structuredOutcome" TEXT,
  "workspaceIdentifier" TEXT,
  "repositoryIdentifier" TEXT,
  "commitSha" TEXT,
  "pullRequestUrl" TEXT,
  "testOutcome" TEXT,
  "qaFeedback" TEXT,
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AgentRun_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "AgentWorkItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AgentRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ExecutionProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AgentRun_retryOfRunId_fkey" FOREIGN KEY ("retryOfRunId") REFERENCES "AgentRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "AgentDecision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "originatingWorkItemId" TEXT,
  "originatingRunId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "context" TEXT NOT NULL,
  "recommendedChoice" TEXT,
  "availableChoices" TEXT NOT NULL,
  "expectedUpside" TEXT,
  "risk" TEXT NOT NULL,
  "amountCents" INTEGER,
  "currency" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "selectedChoice" TEXT,
  "resultingAction" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" DATETIME,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "AgentDecision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AgentDecision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ExecutionProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AgentDecision_originatingWorkItemId_fkey" FOREIGN KEY ("originatingWorkItemId") REFERENCES "AgentWorkItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AgentDecision_originatingRunId_fkey" FOREIGN KEY ("originatingRunId") REFERENCES "AgentRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "AgentEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "workItemId" TEXT,
  "runId" TEXT,
  "decisionId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "metadata" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AgentEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ExecutionProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AgentEvent_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "AgentWorkItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AgentEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AgentEvent_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "AgentDecision" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AgentProjectConfig_projectId_key" ON "AgentProjectConfig"("projectId");
CREATE INDEX "AgentProjectConfig_userId_enabled_nextAgentReviewAt_idx" ON "AgentProjectConfig"("userId", "enabled", "nextAgentReviewAt");
CREATE INDEX "AgentProjectConfig_leaseExpiresAt_idx" ON "AgentProjectConfig"("leaseExpiresAt");
CREATE UNIQUE INDEX "AgentWorkItem_projectId_idempotencyKey_key" ON "AgentWorkItem"("projectId", "idempotencyKey");
CREATE INDEX "AgentWorkItem_userId_state_nextEligibleRunAt_idx" ON "AgentWorkItem"("userId", "state", "nextEligibleRunAt");
CREATE INDEX "AgentWorkItem_projectId_state_priority_idx" ON "AgentWorkItem"("projectId", "state", "priority");
CREATE INDEX "AgentWorkItem_parentWorkItemId_idx" ON "AgentWorkItem"("parentWorkItemId");
CREATE INDEX "AgentWorkItem_leaseExpiresAt_idx" ON "AgentWorkItem"("leaseExpiresAt");
CREATE UNIQUE INDEX "AgentRun_idempotencyKey_key" ON "AgentRun"("idempotencyKey");
CREATE INDEX "AgentRun_userId_startedAt_idx" ON "AgentRun"("userId", "startedAt");
CREATE INDEX "AgentRun_workItemId_startedAt_idx" ON "AgentRun"("workItemId", "startedAt");
CREATE INDEX "AgentRun_projectId_status_idx" ON "AgentRun"("projectId", "status");
CREATE INDEX "AgentRun_retryOfRunId_idx" ON "AgentRun"("retryOfRunId");
CREATE UNIQUE INDEX "AgentDecision_idempotencyKey_key" ON "AgentDecision"("idempotencyKey");
CREATE INDEX "AgentDecision_userId_status_createdAt_idx" ON "AgentDecision"("userId", "status", "createdAt");
CREATE INDEX "AgentDecision_projectId_status_idx" ON "AgentDecision"("projectId", "status");
CREATE INDEX "AgentDecision_originatingWorkItemId_idx" ON "AgentDecision"("originatingWorkItemId");
CREATE INDEX "AgentDecision_originatingRunId_idx" ON "AgentDecision"("originatingRunId");
CREATE UNIQUE INDEX "AgentEvent_idempotencyKey_key" ON "AgentEvent"("idempotencyKey");
CREATE INDEX "AgentEvent_userId_createdAt_idx" ON "AgentEvent"("userId", "createdAt");
CREATE INDEX "AgentEvent_projectId_createdAt_idx" ON "AgentEvent"("projectId", "createdAt");
CREATE INDEX "AgentEvent_workItemId_createdAt_idx" ON "AgentEvent"("workItemId", "createdAt");
