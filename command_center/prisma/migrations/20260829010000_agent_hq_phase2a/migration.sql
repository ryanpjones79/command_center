-- CreateTable
CREATE TABLE "AgentActionRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workItemId" TEXT NOT NULL,
    "originatingRunId" TEXT,
    "decisionId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "actionFingerprint" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PROPOSED',
    "boundedPayload" TEXT NOT NULL,
    "authorizationBounds" TEXT NOT NULL,
    "amountCents" INTEGER,
    "currency" TEXT,
    "expiresAt" DATETIME,
    "authorizedAt" DATETIME,
    "executionStartedAt" DATETIME,
    "executedAt" DATETIME,
    "verifiedAt" DATETIME,
    "cancelledAt" DATETIME,
    "executorIdentifier" TEXT,
    "externalExecutionId" TEXT,
    "executionEvidence" TEXT,
    "failure" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentActionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AgentActionRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ExecutionProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AgentActionRequest_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "AgentWorkItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AgentActionRequest_originatingRunId_fkey" FOREIGN KEY ("originatingRunId") REFERENCES "AgentRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AgentActionRequest_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "AgentDecision" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentRunner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" TEXT,
    "capabilities" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'OFFLINE',
    "currentWorkItemId" TEXT,
    "lastHeartbeatAt" DATETIME,
    "lastSuccessfulRunAt" DATETIME,
    "recentFailure" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentRunner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RunnerRequestNonce" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runnerId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "bodyHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RunnerRequestNonce_runnerId_fkey" FOREIGN KEY ("runnerId") REFERENCES "AgentRunner" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AgentProjectConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "profile" TEXT NOT NULL DEFAULT 'GENERIC_PM',
    "operatingMode" TEXT NOT NULL DEFAULT 'SIMULATION',
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
INSERT INTO "new_AgentProjectConfig" ("autonomyPolicy", "createdAt", "currentBottleneck", "enabled", "escalationPolicy", "externalActionApproval", "health", "id", "lastAgentReviewAt", "leaseExpiresAt", "leaseToken", "maxConcurrentWorkItems", "nextAgentReviewAt", "objective", "pausedAt", "primaryKpi", "profile", "projectId", "projectManagerInstructions", "spendingThresholdCents", "updatedAt", "userId", "workspaceIdentifier") SELECT "autonomyPolicy", "createdAt", "currentBottleneck", "enabled", "escalationPolicy", "externalActionApproval", "health", "id", "lastAgentReviewAt", "leaseExpiresAt", "leaseToken", "maxConcurrentWorkItems", "nextAgentReviewAt", "objective", "pausedAt", "primaryKpi", "profile", "projectId", "projectManagerInstructions", "spendingThresholdCents", "updatedAt", "userId", "workspaceIdentifier" FROM "AgentProjectConfig";
DROP TABLE "AgentProjectConfig";
ALTER TABLE "new_AgentProjectConfig" RENAME TO "AgentProjectConfig";
CREATE UNIQUE INDEX "AgentProjectConfig_projectId_key" ON "AgentProjectConfig"("projectId");
CREATE INDEX "AgentProjectConfig_userId_enabled_nextAgentReviewAt_idx" ON "AgentProjectConfig"("userId", "enabled", "nextAgentReviewAt");
CREATE INDEX "AgentProjectConfig_leaseExpiresAt_idx" ON "AgentProjectConfig"("leaseExpiresAt");
CREATE TABLE "new_AgentWorkItem" (
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
    "requiredCapability" TEXT NOT NULL DEFAULT 'REPOSITORY_READ',
    "sandboxPolicy" TEXT NOT NULL DEFAULT 'READ_ONLY',
    "networkPolicy" TEXT NOT NULL DEFAULT 'OFF',
    "operationalContext" TEXT,
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
INSERT INTO "new_AgentWorkItem" ("acceptanceCriteria", "actionCategory", "agentRole", "attemptCount", "blocker", "claimToken", "completedAt", "createdAt", "evidenceSummary", "executorIdentifier", "expectedValue", "externalRunId", "externalThreadId", "heartbeatAt", "id", "idempotencyKey", "leaseExpiresAt", "maxAttempts", "nextEligibleRunAt", "objective", "parentWorkItemId", "priority", "projectId", "providerIdentifier", "repositoryIdentifier", "resultSummary", "startedAt", "state", "title", "updatedAt", "userId", "workspaceIdentifier") SELECT "acceptanceCriteria", "actionCategory", "agentRole", "attemptCount", "blocker", "claimToken", "completedAt", "createdAt", "evidenceSummary", "executorIdentifier", "expectedValue", "externalRunId", "externalThreadId", "heartbeatAt", "id", "idempotencyKey", "leaseExpiresAt", "maxAttempts", "nextEligibleRunAt", "objective", "parentWorkItemId", "priority", "projectId", "providerIdentifier", "repositoryIdentifier", "resultSummary", "startedAt", "state", "title", "updatedAt", "userId", "workspaceIdentifier" FROM "AgentWorkItem";
DROP TABLE "AgentWorkItem";
ALTER TABLE "new_AgentWorkItem" RENAME TO "AgentWorkItem";
CREATE INDEX "AgentWorkItem_userId_state_nextEligibleRunAt_idx" ON "AgentWorkItem"("userId", "state", "nextEligibleRunAt");
CREATE INDEX "AgentWorkItem_projectId_state_priority_idx" ON "AgentWorkItem"("projectId", "state", "priority");
CREATE INDEX "AgentWorkItem_parentWorkItemId_idx" ON "AgentWorkItem"("parentWorkItemId");
CREATE INDEX "AgentWorkItem_leaseExpiresAt_idx" ON "AgentWorkItem"("leaseExpiresAt");
CREATE UNIQUE INDEX "AgentWorkItem_projectId_idempotencyKey_key" ON "AgentWorkItem"("projectId", "idempotencyKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "AgentActionRequest_decisionId_key" ON "AgentActionRequest"("decisionId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentActionRequest_idempotencyKey_key" ON "AgentActionRequest"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "AgentActionRequest_actionFingerprint_key" ON "AgentActionRequest"("actionFingerprint");

-- CreateIndex
CREATE INDEX "AgentActionRequest_userId_state_createdAt_idx" ON "AgentActionRequest"("userId", "state", "createdAt");

-- CreateIndex
CREATE INDEX "AgentActionRequest_projectId_state_idx" ON "AgentActionRequest"("projectId", "state");

-- CreateIndex
CREATE INDEX "AgentActionRequest_workItemId_idx" ON "AgentActionRequest"("workItemId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRunner_keyId_key" ON "AgentRunner"("keyId");

-- CreateIndex
CREATE INDEX "AgentRunner_userId_enabled_idx" ON "AgentRunner"("userId", "enabled");

-- CreateIndex
CREATE INDEX "AgentRunner_lastHeartbeatAt_idx" ON "AgentRunner"("lastHeartbeatAt");

-- CreateIndex
CREATE UNIQUE INDEX "RunnerRequestNonce_requestId_key" ON "RunnerRequestNonce"("requestId");

-- CreateIndex
CREATE INDEX "RunnerRequestNonce_runnerId_createdAt_idx" ON "RunnerRequestNonce"("runnerId", "createdAt");

-- CreateIndex
CREATE INDEX "RunnerRequestNonce_expiresAt_idx" ON "RunnerRequestNonce"("expiresAt");
