-- CreateTable
CREATE TABLE "SavedSignalFilter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SavedSignalFilter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SavedSignalFilter_userId_createdAt_idx" ON "SavedSignalFilter"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SavedSignalFilter_userId_name_key" ON "SavedSignalFilter"("userId", "name");
