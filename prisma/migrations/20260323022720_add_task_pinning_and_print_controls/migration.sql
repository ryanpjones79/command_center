-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ExecutionTask" (
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
    "pinToTodayUntilDone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    CONSTRAINT "ExecutionTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExecutionTask_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "ExecutionDomain" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExecutionTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ExecutionProject" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ExecutionTask" ("completedAt", "createdAt", "domainId", "dueDate", "followUpDate", "id", "isBlocked", "note", "priority", "projectId", "source", "status", "title", "type", "updatedAt", "userId", "waitingOn", "whenBucket") SELECT "completedAt", "createdAt", "domainId", "dueDate", "followUpDate", "id", "isBlocked", "note", "priority", "projectId", "source", "status", "title", "type", "updatedAt", "userId", "waitingOn", "whenBucket" FROM "ExecutionTask";
DROP TABLE "ExecutionTask";
ALTER TABLE "new_ExecutionTask" RENAME TO "ExecutionTask";
CREATE INDEX "ExecutionTask_userId_whenBucket_status_priority_dueDate_idx" ON "ExecutionTask"("userId", "whenBucket", "status", "priority", "dueDate");
CREATE INDEX "ExecutionTask_userId_followUpDate_idx" ON "ExecutionTask"("userId", "followUpDate");
CREATE INDEX "ExecutionTask_projectId_status_idx" ON "ExecutionTask"("projectId", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
