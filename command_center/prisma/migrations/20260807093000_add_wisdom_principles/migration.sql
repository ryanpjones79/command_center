CREATE TABLE "WisdomEntry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "idea" TEXT NOT NULL,
  "takeaway" TEXT,
  "application" TEXT,
  "sourceType" TEXT NOT NULL DEFAULT 'other',
  "sourceName" TEXT,
  "author" TEXT,
  "reference" TEXT,
  "category" TEXT NOT NULL DEFAULT 'Other',
  "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "favorite" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "tags" TEXT,
  "photoUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'library',
  "notebookEntryId" TEXT,
  "lastShownAt" DATETIME,
  "archivedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "WisdomEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WisdomEntry_notebookEntryId_fkey" FOREIGN KEY ("notebookEntryId") REFERENCES "NotebookEntryIndex" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "WisdomReflection" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "wisdomId" TEXT NOT NULL,
  "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "text" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WisdomReflection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WisdomReflection_wisdomId_fkey" FOREIGN KEY ("wisdomId") REFERENCES "WisdomEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "WisdomEntry_userId_status_active_favorite_idx" ON "WisdomEntry"("userId", "status", "active", "favorite");
CREATE INDEX "WisdomEntry_userId_category_idx" ON "WisdomEntry"("userId", "category");
CREATE INDEX "WisdomEntry_userId_sourceType_idx" ON "WisdomEntry"("userId", "sourceType");
CREATE INDEX "WisdomEntry_userId_lastShownAt_idx" ON "WisdomEntry"("userId", "lastShownAt");
CREATE INDEX "WisdomEntry_notebookEntryId_idx" ON "WisdomEntry"("notebookEntryId");
CREATE INDEX "WisdomReflection_userId_date_idx" ON "WisdomReflection"("userId", "date");
CREATE INDEX "WisdomReflection_wisdomId_createdAt_idx" ON "WisdomReflection"("wisdomId", "createdAt");
