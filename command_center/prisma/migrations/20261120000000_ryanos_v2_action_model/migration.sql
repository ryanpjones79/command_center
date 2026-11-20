-- CreateTable
CREATE TABLE "ExecutionTaskEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "detail" TEXT,
    "idempotencyKey" TEXT,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExecutionTaskEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExecutionTaskEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ExecutionTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CaptureAttachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "taskId" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BLOB NOT NULL,
    "locationNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaptureAttachment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CaptureAttachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ExecutionTask" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "owner" TEXT NOT NULL,
    "sourceSystem" TEXT,
    "sourceKey" TEXT,
    "sourceUrl" TEXT,
    "title" TEXT NOT NULL,
    "desiredOutcome" TEXT,
    "measureKind" TEXT NOT NULL DEFAULT 'OUTCOME',
    "metricName" TEXT,
    "metricDefinition" TEXT,
    "unit" TEXT,
    "target" REAL,
    "period" TEXT NOT NULL DEFAULT 'WEEK',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Goal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ExecutionProject" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GoalResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "value" REAL,
    "evidence" TEXT NOT NULL,
    "observedAt" DATETIME NOT NULL,
    "sourceRef" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoalResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GoalResult_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectAttention" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "weekOf" DATETIME NOT NULL,
    "plannedMinutes" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectAttention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectAttention_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ExecutionProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AlertDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AlertDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SourceSync" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "lastAttemptAt" DATETIME,
    "lastSuccessAt" DATETIME,
    "lastError" TEXT,
    CONSTRAINT "SourceSync_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UserSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "accountSize" REAL,
    "maxRiskPerTradePercent" REAL NOT NULL DEFAULT 2,
    "preferredDteMin" INTEGER NOT NULL DEFAULT 30,
    "preferredDteMax" INTEGER NOT NULL DEFAULT 60,
    "definedRiskOnly" BOOLEAN NOT NULL DEFAULT true,
    "earningsBufferDays" INTEGER NOT NULL DEFAULT 7,
    "concentrationLimit" INTEGER NOT NULL DEFAULT 4,
    "updatedAt" DATETIME NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    "workdayStartMin" INTEGER NOT NULL DEFAULT 480,
    "workdayEndMin" INTEGER NOT NULL DEFAULT 1050,
    "dayEndMin" INTEGER NOT NULL DEFAULT 1260,
    "quietStartMin" INTEGER NOT NULL DEFAULT 1290,
    "quietEndMin" INTEGER NOT NULL DEFAULT 390,
    "bufferMinutes" INTEGER NOT NULL DEFAULT 30,
    CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UserSettings" ("accountSize", "concentrationLimit", "definedRiskOnly", "earningsBufferDays", "id", "maxRiskPerTradePercent", "preferredDteMax", "preferredDteMin", "updatedAt", "userId") SELECT "accountSize", "concentrationLimit", "definedRiskOnly", "earningsBufferDays", "id", "maxRiskPerTradePercent", "preferredDteMax", "preferredDteMin", "updatedAt", "userId" FROM "UserSettings";
DROP TABLE "UserSettings";
ALTER TABLE "new_UserSettings" RENAME TO "UserSettings";
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");
CREATE TABLE "new_ExecutionProject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "seasonId" TEXT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ON_TRACK',
    "activeStatus" TEXT NOT NULL DEFAULT 'ACTIVE_NOW',
    "weeklyFocus" TEXT NOT NULL DEFAULT 'NONE',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "nextAction" TEXT,
    "waitingOn" TEXT,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "lastReviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "desiredOutcome" TEXT,
    "sourceSystem" TEXT,
    "sourceKey" TEXT,
    "sourceUrl" TEXT,
    "sourceStatus" TEXT,
    "monitoring" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" DATETIME,
    CONSTRAINT "ExecutionProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExecutionProject_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "ExecutionDomain" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExecutionProject_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ExecutionProject" ("activeStatus", "blocked", "createdAt", "domainId", "id", "lastReviewedAt", "name", "nextAction", "note", "priority", "seasonId", "status", "updatedAt", "userId", "waitingOn", "weeklyFocus") SELECT "activeStatus", "blocked", "createdAt", "domainId", "id", "lastReviewedAt", "name", "nextAction", "note", "priority", "seasonId", "status", "updatedAt", "userId", "waitingOn", "weeklyFocus" FROM "ExecutionProject";
DROP TABLE "ExecutionProject";
ALTER TABLE "new_ExecutionProject" RENAME TO "ExecutionProject";
CREATE INDEX "ExecutionProject_userId_activeStatus_weeklyFocus_priority_idx" ON "ExecutionProject"("userId", "activeStatus", "weeklyFocus", "priority");
CREATE INDEX "ExecutionProject_userId_seasonId_idx" ON "ExecutionProject"("userId", "seasonId");
CREATE UNIQUE INDEX "ExecutionProject_userId_name_key" ON "ExecutionProject"("userId", "name");
CREATE TABLE "new_ExecutionTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'ACTION',
    "estimatedDuration" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "whenBucket" TEXT NOT NULL DEFAULT 'LATER',
    "dueDate" DATETIME,
    "followUpDate" DATETIME,
    "waitingOn" TEXT,
    "note" TEXT,
    "source" TEXT,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "pinToTodayUntilDone" BOOLEAN NOT NULL DEFAULT false,
    "recurrenceFrequency" TEXT NOT NULL DEFAULT 'NONE',
    "recurrenceWeekdays" TEXT,
    "recurrenceEndDate" DATETIME,
    "recurrenceParentId" TEXT,
    "scheduledStart" DATETIME,
    "scheduledEnd" DATETIME,
    "blockType" TEXT,
    "isNeedle" BOOLEAN NOT NULL DEFAULT false,
    "isBuild" BOOLEAN NOT NULL DEFAULT false,
    "recipient" TEXT,
    "owedToLeadership" BOOLEAN NOT NULL DEFAULT false,
    "shippedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    "integrationSourceKey" TEXT,
    "sourceSystem" TEXT,
    "sourceKind" TEXT,
    "sourceUrl" TEXT,
    "sourceState" TEXT,
    "sourceFingerprint" TEXT,
    "sourceObservedAt" DATETIME,
    "sourceCheckedAt" DATETIME,
    "sourceVerifiedAt" DATETIME,
    "localConfirmedAt" DATETIME,
    "doneWhen" TEXT,
    "expiresAt" DATETIME,
    "remainingMinutes" INTEGER,
    "workContext" TEXT,
    "postponeCount" INTEGER NOT NULL DEFAULT 0,
    "successorTaskId" TEXT,
    "goalKey" TEXT,
    "needsJudgment" BOOLEAN NOT NULL DEFAULT false,
    "captureKind" TEXT,
    CONSTRAINT "ExecutionTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExecutionTask_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "ExecutionDomain" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExecutionTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ExecutionProject" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ExecutionTask" ("blockType", "completedAt", "createdAt", "domainId", "dueDate", "estimatedDuration", "followUpDate", "id", "isBlocked", "isBuild", "isNeedle", "note", "owedToLeadership", "pinToTodayUntilDone", "priority", "projectId", "recipient", "recurrenceEndDate", "recurrenceFrequency", "recurrenceParentId", "recurrenceWeekdays", "scheduledEnd", "scheduledStart", "shippedAt", "source", "status", "title", "type", "updatedAt", "userId", "waitingOn", "whenBucket") SELECT "blockType", "completedAt", "createdAt", "domainId", "dueDate", "estimatedDuration", "followUpDate", "id", "isBlocked", "isBuild", "isNeedle", "note", "owedToLeadership", "pinToTodayUntilDone", "priority", "projectId", "recipient", "recurrenceEndDate", "recurrenceFrequency", "recurrenceParentId", "recurrenceWeekdays", "scheduledEnd", "scheduledStart", "shippedAt", "source", "status", "title", "type", "updatedAt", "userId", "waitingOn", "whenBucket" FROM "ExecutionTask";
DROP TABLE "ExecutionTask";
ALTER TABLE "new_ExecutionTask" RENAME TO "ExecutionTask";
CREATE INDEX "ExecutionTask_userId_whenBucket_status_priority_dueDate_idx" ON "ExecutionTask"("userId", "whenBucket", "status", "priority", "dueDate");
CREATE INDEX "ExecutionTask_userId_followUpDate_idx" ON "ExecutionTask"("userId", "followUpDate");
CREATE INDEX "ExecutionTask_userId_recurrenceFrequency_idx" ON "ExecutionTask"("userId", "recurrenceFrequency");
CREATE INDEX "ExecutionTask_recurrenceParentId_idx" ON "ExecutionTask"("recurrenceParentId");
CREATE INDEX "ExecutionTask_userId_scheduledStart_idx" ON "ExecutionTask"("userId", "scheduledStart");
CREATE INDEX "ExecutionTask_userId_blockType_scheduledStart_idx" ON "ExecutionTask"("userId", "blockType", "scheduledStart");
CREATE INDEX "ExecutionTask_userId_isNeedle_scheduledStart_idx" ON "ExecutionTask"("userId", "isNeedle", "scheduledStart");
CREATE INDEX "ExecutionTask_userId_shippedAt_idx" ON "ExecutionTask"("userId", "shippedAt");
CREATE INDEX "ExecutionTask_projectId_status_idx" ON "ExecutionTask"("projectId", "status");
CREATE INDEX "ExecutionTask_userId_needsJudgment_idx" ON "ExecutionTask"("userId", "needsJudgment");
CREATE INDEX "ExecutionTask_userId_expiresAt_idx" ON "ExecutionTask"("userId", "expiresAt");
CREATE UNIQUE INDEX "ExecutionTask_userId_integrationSourceKey_key" ON "ExecutionTask"("userId", "integrationSourceKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionTaskEvent_idempotencyKey_key" ON "ExecutionTaskEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ExecutionTaskEvent_taskId_at_idx" ON "ExecutionTaskEvent"("taskId", "at");

-- CreateIndex
CREATE INDEX "ExecutionTaskEvent_userId_type_at_idx" ON "ExecutionTaskEvent"("userId", "type", "at");

-- CreateIndex
CREATE INDEX "CaptureAttachment_userId_createdAt_idx" ON "CaptureAttachment"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CaptureAttachment_taskId_idx" ON "CaptureAttachment"("taskId");

-- CreateIndex
CREATE INDEX "Goal_userId_active_idx" ON "Goal"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Goal_userId_sourceSystem_sourceKey_key" ON "Goal"("userId", "sourceSystem", "sourceKey");

-- CreateIndex
CREATE INDEX "GoalResult_userId_periodStart_idx" ON "GoalResult"("userId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "GoalResult_goalId_periodStart_evidence_key" ON "GoalResult"("goalId", "periodStart", "evidence");

-- CreateIndex
CREATE INDEX "ProjectAttention_userId_weekOf_idx" ON "ProjectAttention"("userId", "weekOf");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectAttention_projectId_weekOf_key" ON "ProjectAttention"("projectId", "weekOf");

-- CreateIndex
CREATE UNIQUE INDEX "AlertDelivery_key_key" ON "AlertDelivery"("key");

-- CreateIndex
CREATE INDEX "AlertDelivery_userId_sentAt_idx" ON "AlertDelivery"("userId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "SourceSync_userId_sourceSystem_key" ON "SourceSync"("userId", "sourceSystem");

