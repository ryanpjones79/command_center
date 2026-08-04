-- CreateTable
CREATE TABLE "Notebook" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "number" INTEGER,
  "startedAt" DATETIME,
  "completedAt" DATETIME,
  "description" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Notebook_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotebookEntryIndex" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "notebookId" TEXT NOT NULL,
  "date" DATETIME,
  "pageNumber" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "domainId" TEXT,
  "projectId" TEXT,
  "entryType" TEXT NOT NULL,
  "photoUrl" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "NotebookEntryIndex_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "NotebookEntryIndex_notebookId_fkey" FOREIGN KEY ("notebookId") REFERENCES "Notebook" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "NotebookEntryIndex_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "ExecutionDomain" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "NotebookEntryIndex_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ExecutionProject" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Notebook_userId_number_key" ON "Notebook"("userId", "number");
CREATE INDEX "Notebook_userId_startedAt_idx" ON "Notebook"("userId", "startedAt");
CREATE INDEX "Notebook_userId_completedAt_idx" ON "Notebook"("userId", "completedAt");
CREATE INDEX "NotebookEntryIndex_userId_date_idx" ON "NotebookEntryIndex"("userId", "date");
CREATE INDEX "NotebookEntryIndex_userId_entryType_idx" ON "NotebookEntryIndex"("userId", "entryType");
CREATE INDEX "NotebookEntryIndex_notebookId_pageNumber_idx" ON "NotebookEntryIndex"("notebookId", "pageNumber");
CREATE INDEX "NotebookEntryIndex_domainId_idx" ON "NotebookEntryIndex"("domainId");
CREATE INDEX "NotebookEntryIndex_projectId_idx" ON "NotebookEntryIndex"("projectId");
