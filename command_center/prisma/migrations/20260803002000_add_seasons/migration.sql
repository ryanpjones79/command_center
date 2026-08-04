-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "themeColor" TEXT,
    "icon" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Season_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable
ALTER TABLE "ExecutionProject" ADD COLUMN "seasonId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Season_userId_title_key" ON "Season"("userId", "title");

-- CreateIndex
CREATE INDEX "Season_userId_isCurrent_idx" ON "Season"("userId", "isCurrent");

-- CreateIndex
CREATE INDEX "Season_userId_status_startedAt_idx" ON "Season"("userId", "status", "startedAt");

-- CreateIndex
CREATE INDEX "ExecutionProject_userId_seasonId_idx" ON "ExecutionProject"("userId", "seasonId");
