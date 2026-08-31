-- CreateTable
CREATE TABLE "AgentSchedulerHeartbeat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lastStartedAt" DATETIME,
    "lastSucceededAt" DATETIME,
    "lastFailedAt" DATETIME,
    "lastFailure" TEXT,
    "cadenceMinutes" INTEGER NOT NULL DEFAULT 15,
    "lastDueProjectCount" INTEGER,
    "lastClaimedProjectCount" INTEGER,
    "lastProjectOutcomeCount" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
