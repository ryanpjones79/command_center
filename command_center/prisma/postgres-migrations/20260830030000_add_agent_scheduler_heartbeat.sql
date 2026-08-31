CREATE TABLE "AgentSchedulerHeartbeat" (
    "id" TEXT NOT NULL,
    "lastStartedAt" TIMESTAMP(3),
    "lastSucceededAt" TIMESTAMP(3),
    "lastFailedAt" TIMESTAMP(3),
    "lastFailure" TEXT,
    "cadenceMinutes" INTEGER NOT NULL DEFAULT 15,
    "lastDueProjectCount" INTEGER,
    "lastClaimedProjectCount" INTEGER,
    "lastProjectOutcomeCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSchedulerHeartbeat_pkey" PRIMARY KEY ("id")
);
