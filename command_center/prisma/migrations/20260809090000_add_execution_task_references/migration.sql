-- CreateTable
CREATE TABLE "ExecutionTaskReference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'other',
    "title" TEXT NOT NULL,
    "url" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExecutionTaskReference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExecutionTaskReference_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ExecutionTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ExecutionTaskReference_userId_createdAt_idx" ON "ExecutionTaskReference"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ExecutionTaskReference_taskId_createdAt_idx" ON "ExecutionTaskReference"("taskId", "createdAt");
