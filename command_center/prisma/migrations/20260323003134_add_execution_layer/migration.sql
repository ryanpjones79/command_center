-- CreateTable
CREATE TABLE "ExecutionDomain" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExecutionDomain_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExecutionProject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
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
    CONSTRAINT "ExecutionProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExecutionProject_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "ExecutionDomain" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExecutionTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'ACTION',
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "whenBucket" TEXT NOT NULL DEFAULT 'LATER',
    "dueDate" DATETIME,
    "followUpDate" DATETIME,
    "waitingOn" TEXT,
    "note" TEXT,
    "source" TEXT,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    CONSTRAINT "ExecutionTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExecutionTask_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "ExecutionDomain" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExecutionTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ExecutionProject" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ExecutionDomain_userId_name_idx" ON "ExecutionDomain"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionDomain_userId_slug_key" ON "ExecutionDomain"("userId", "slug");

-- CreateIndex
CREATE INDEX "ExecutionProject_userId_activeStatus_weeklyFocus_priority_idx" ON "ExecutionProject"("userId", "activeStatus", "weeklyFocus", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionProject_userId_name_key" ON "ExecutionProject"("userId", "name");

-- CreateIndex
CREATE INDEX "ExecutionTask_userId_whenBucket_status_priority_dueDate_idx" ON "ExecutionTask"("userId", "whenBucket", "status", "priority", "dueDate");

-- CreateIndex
CREATE INDEX "ExecutionTask_userId_followUpDate_idx" ON "ExecutionTask"("userId", "followUpDate");

-- CreateIndex
CREATE INDEX "ExecutionTask_projectId_status_idx" ON "ExecutionTask"("projectId", "status");
