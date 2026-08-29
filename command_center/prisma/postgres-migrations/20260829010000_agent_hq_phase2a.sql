ALTER TYPE "AgentWorkState" ADD VALUE IF NOT EXISTS 'AWAITING_EXECUTION';
ALTER TYPE "AgentWorkState" ADD VALUE IF NOT EXISTS 'READY_FOR_REVIEW';
CREATE TYPE "AgentActionState" AS ENUM ('PROPOSED','AWAITING_OWNER_APPROVAL','AUTHORIZED','AWAITING_EXECUTION','EXECUTING','VERIFYING','COMPLETED','FAILED','EXPIRED','CANCELLED');

ALTER TABLE "AgentProjectConfig" ADD COLUMN "operatingMode" TEXT NOT NULL DEFAULT 'SIMULATION';
ALTER TABLE "AgentWorkItem" ADD COLUMN "requiredCapability" TEXT NOT NULL DEFAULT 'REPOSITORY_READ';
ALTER TABLE "AgentWorkItem" ADD COLUMN "sandboxPolicy" TEXT NOT NULL DEFAULT 'READ_ONLY';
ALTER TABLE "AgentWorkItem" ADD COLUMN "networkPolicy" TEXT NOT NULL DEFAULT 'OFF';
ALTER TABLE "AgentWorkItem" ADD COLUMN "operationalContext" TEXT;

CREATE TABLE "AgentActionRequest" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "projectId" TEXT NOT NULL, "workItemId" TEXT NOT NULL,
  "originatingRunId" TEXT, "decisionId" TEXT UNIQUE, "idempotencyKey" TEXT NOT NULL UNIQUE, "actionFingerprint" TEXT NOT NULL UNIQUE,
  "category" TEXT NOT NULL, "capability" TEXT NOT NULL, "state" "AgentActionState" NOT NULL DEFAULT 'PROPOSED',
  "boundedPayload" TEXT NOT NULL, "authorizationBounds" TEXT NOT NULL, "amountCents" INTEGER, "currency" TEXT,
  "expiresAt" TIMESTAMP(3), "authorizedAt" TIMESTAMP(3), "executionStartedAt" TIMESTAMP(3), "executedAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3), "cancelledAt" TIMESTAMP(3), "executorIdentifier" TEXT, "externalExecutionId" TEXT,
  "executionEvidence" TEXT, "failure" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentActionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "AgentActionRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ExecutionProject"("id") ON DELETE CASCADE,
  CONSTRAINT "AgentActionRequest_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "AgentWorkItem"("id") ON DELETE CASCADE,
  CONSTRAINT "AgentActionRequest_originatingRunId_fkey" FOREIGN KEY ("originatingRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL,
  CONSTRAINT "AgentActionRequest_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "AgentDecision"("id") ON DELETE SET NULL
);
CREATE INDEX "AgentActionRequest_userId_state_createdAt_idx" ON "AgentActionRequest"("userId","state","createdAt");
CREATE INDEX "AgentActionRequest_projectId_state_idx" ON "AgentActionRequest"("projectId","state");
CREATE INDEX "AgentActionRequest_workItemId_idx" ON "AgentActionRequest"("workItemId");

CREATE TABLE "AgentRunner" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "keyId" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true,
  "version" TEXT, "capabilities" TEXT NOT NULL DEFAULT '[]', "status" TEXT NOT NULL DEFAULT 'OFFLINE', "currentWorkItemId" TEXT,
  "lastHeartbeatAt" TIMESTAMP(3), "lastSuccessfulRunAt" TIMESTAMP(3), "recentFailure" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentRunner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX "AgentRunner_userId_enabled_idx" ON "AgentRunner"("userId","enabled");
CREATE INDEX "AgentRunner_lastHeartbeatAt_idx" ON "AgentRunner"("lastHeartbeatAt");

CREATE TABLE "RunnerRequestNonce" (
  "id" TEXT PRIMARY KEY, "runnerId" TEXT NOT NULL, "requestId" TEXT NOT NULL UNIQUE, "timestamp" TIMESTAMP(3) NOT NULL,
  "bodyHash" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RunnerRequestNonce_runnerId_fkey" FOREIGN KEY ("runnerId") REFERENCES "AgentRunner"("id") ON DELETE CASCADE
);
CREATE INDEX "RunnerRequestNonce_runnerId_createdAt_idx" ON "RunnerRequestNonce"("runnerId","createdAt");
CREATE INDEX "RunnerRequestNonce_expiresAt_idx" ON "RunnerRequestNonce"("expiresAt");
