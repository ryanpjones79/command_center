-- AlterTable
ALTER TABLE "ExecutionTask" ADD COLUMN "blockType" TEXT;
ALTER TABLE "ExecutionTask" ADD COLUMN "isNeedle" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ExecutionTask" ADD COLUMN "isBuild" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ExecutionTask" ADD COLUMN "recipient" TEXT;
ALTER TABLE "ExecutionTask" ADD COLUMN "owedToLeadership" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ExecutionTask" ADD COLUMN "shippedAt" DATETIME;

-- CreateTable
CREATE TABLE "DailyPlan" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "date" DATETIME NOT NULL,
  "needleMove" TEXT,
  "ruleStep" INTEGER,
  "needleTaskId" TEXT,
  "rykasDismissed" BOOLEAN NOT NULL DEFAULT false,
  "shutdownNote" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "DailyPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QueueItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "lane" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "nextAction" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" DATETIME,
  CONSTRAINT "QueueItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PipelineAction" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "date" DATETIME NOT NULL,
  "type" TEXT NOT NULL,
  "withWhom" TEXT,
  "note" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PipelineAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RykasDay" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "date" DATETIME NOT NULL,
  "toShip" TEXT,
  "offersDone" BOOLEAN NOT NULL DEFAULT false,
  "listedCount" INTEGER NOT NULL DEFAULT 0,
  "sourced" BOOLEAN NOT NULL DEFAULT false,
  "backlogAfter" INTEGER NOT NULL DEFAULT 0,
  "capOverride" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "RykasDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ParkedIdea" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "idea" TEXT NOT NULL,
  "lane" TEXT NOT NULL,
  "triggerCondition" TEXT,
  "status" TEXT NOT NULL DEFAULT 'parked',
  "renewals" INTEGER NOT NULL DEFAULT 0,
  "parkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "touchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ParkedIdea_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WeeklyReset" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "weekOf" DATETIME NOT NULL,
  "loopsShipped" INTEGER NOT NULL DEFAULT 0,
  "loopsKilled" INTEGER NOT NULL DEFAULT 0,
  "loopsParked" INTEGER NOT NULL DEFAULT 0,
  "conversations" INTEGER NOT NULL DEFAULT 0,
  "ships" INTEGER NOT NULL DEFAULT 0,
  "rykasBacklog" INTEGER NOT NULL DEFAULT 0,
  "overridesCount" INTEGER NOT NULL DEFAULT 0,
  "outcomes" TEXT NOT NULL,
  "promotedIdeaId" TEXT,
  "completedAt" DATETIME,
  CONSTRAINT "WeeklyReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ExecutionTask_userId_blockType_scheduledStart_idx" ON "ExecutionTask"("userId", "blockType", "scheduledStart");
CREATE INDEX "ExecutionTask_userId_isNeedle_scheduledStart_idx" ON "ExecutionTask"("userId", "isNeedle", "scheduledStart");
CREATE INDEX "ExecutionTask_userId_shippedAt_idx" ON "ExecutionTask"("userId", "shippedAt");
CREATE UNIQUE INDEX "DailyPlan_userId_date_key" ON "DailyPlan"("userId", "date");
CREATE INDEX "DailyPlan_userId_date_idx" ON "DailyPlan"("userId", "date");
CREATE INDEX "QueueItem_userId_status_createdAt_idx" ON "QueueItem"("userId", "status", "createdAt");
CREATE INDEX "QueueItem_userId_resolvedAt_idx" ON "QueueItem"("userId", "resolvedAt");
CREATE INDEX "PipelineAction_userId_date_type_idx" ON "PipelineAction"("userId", "date", "type");
CREATE INDEX "PipelineAction_userId_createdAt_idx" ON "PipelineAction"("userId", "createdAt");
CREATE UNIQUE INDEX "RykasDay_userId_date_key" ON "RykasDay"("userId", "date");
CREATE INDEX "RykasDay_userId_date_idx" ON "RykasDay"("userId", "date");
CREATE INDEX "ParkedIdea_userId_status_touchedAt_idx" ON "ParkedIdea"("userId", "status", "touchedAt");
CREATE INDEX "ParkedIdea_userId_parkedAt_idx" ON "ParkedIdea"("userId", "parkedAt");
CREATE UNIQUE INDEX "WeeklyReset_userId_weekOf_key" ON "WeeklyReset"("userId", "weekOf");
CREATE INDEX "WeeklyReset_userId_completedAt_idx" ON "WeeklyReset"("userId", "completedAt");
