-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "bufferMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "dayEndMin" INTEGER NOT NULL DEFAULT 1260,
ADD COLUMN     "quietEndMin" INTEGER NOT NULL DEFAULT 390,
ADD COLUMN     "quietStartMin" INTEGER NOT NULL DEFAULT 1290,
ADD COLUMN     "timeZone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
ADD COLUMN     "workdayEndMin" INTEGER NOT NULL DEFAULT 1050,
ADD COLUMN     "workdayStartMin" INTEGER NOT NULL DEFAULT 480;

-- AlterTable
ALTER TABLE "ExecutionProject" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "desiredOutcome" TEXT,
ADD COLUMN     "monitoring" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sourceKey" TEXT,
ADD COLUMN     "sourceStatus" TEXT,
ADD COLUMN     "sourceSystem" TEXT,
ADD COLUMN     "sourceUrl" TEXT;

-- AlterTable
ALTER TABLE "ExecutionTask" ADD COLUMN     "captureKind" TEXT,
ADD COLUMN     "doneWhen" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "goalKey" TEXT,
ADD COLUMN     "integrationSourceKey" TEXT,
ADD COLUMN     "localConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "needsJudgment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "postponeCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "remainingMinutes" INTEGER,
ADD COLUMN     "sourceCheckedAt" TIMESTAMP(3),
ADD COLUMN     "sourceFingerprint" TEXT,
ADD COLUMN     "sourceObservedAt" TIMESTAMP(3),
ADD COLUMN     "sourceState" TEXT,
ADD COLUMN     "sourceSystem" TEXT,
ADD COLUMN     "sourceUrl" TEXT,
ADD COLUMN     "sourceVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "successorTaskId" TEXT,
ADD COLUMN     "workContext" TEXT;

-- CreateTable
CREATE TABLE "ExecutionTaskEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "detail" TEXT,
    "idempotencyKey" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutionTaskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaptureAttachment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "locationNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaptureAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "owner" TEXT NOT NULL,
    "sourceSystem" TEXT,
    "sourceKey" TEXT,
    "sourceUrl" TEXT,
    "title" TEXT NOT NULL,
    "desiredOutcome" TEXT,
    "measureKind" TEXT NOT NULL DEFAULT 'OUTCOME',
    "metricName" TEXT,
    "metricDefinition" TEXT,
    "unit" TEXT,
    "target" DOUBLE PRECISION,
    "period" TEXT NOT NULL DEFAULT 'WEEK',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalResult" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "value" DOUBLE PRECISION,
    "evidence" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "sourceRef" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectAttention" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "weekOf" TIMESTAMP(3) NOT NULL,
    "plannedMinutes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectAttention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertDelivery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceSync" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "lastAttemptAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "SourceSync_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionTaskEvent_idempotencyKey_key" ON "ExecutionTaskEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ExecutionTaskEvent_taskId_at_idx" ON "ExecutionTaskEvent"("taskId", "at");

-- CreateIndex
CREATE INDEX "ExecutionTaskEvent_userId_type_at_idx" ON "ExecutionTaskEvent"("userId", "type", "at");

-- CreateIndex
CREATE INDEX "CaptureAttachment_userId_createdAt_idx" ON "CaptureAttachment"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CaptureAttachment_taskId_idx" ON "CaptureAttachment"("taskId");

-- CreateIndex
CREATE INDEX "Goal_userId_active_idx" ON "Goal"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Goal_userId_sourceSystem_sourceKey_key" ON "Goal"("userId", "sourceSystem", "sourceKey");

-- CreateIndex
CREATE INDEX "GoalResult_userId_periodStart_idx" ON "GoalResult"("userId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "GoalResult_goalId_periodStart_evidence_key" ON "GoalResult"("goalId", "periodStart", "evidence");

-- CreateIndex
CREATE INDEX "ProjectAttention_userId_weekOf_idx" ON "ProjectAttention"("userId", "weekOf");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectAttention_projectId_weekOf_key" ON "ProjectAttention"("projectId", "weekOf");

-- CreateIndex
CREATE UNIQUE INDEX "AlertDelivery_key_key" ON "AlertDelivery"("key");

-- CreateIndex
CREATE INDEX "AlertDelivery_userId_sentAt_idx" ON "AlertDelivery"("userId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "SourceSync_userId_sourceSystem_key" ON "SourceSync"("userId", "sourceSystem");

-- CreateIndex
CREATE INDEX "ExecutionTask_userId_needsJudgment_idx" ON "ExecutionTask"("userId", "needsJudgment");

-- CreateIndex
CREATE INDEX "ExecutionTask_userId_expiresAt_idx" ON "ExecutionTask"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionTask_userId_integrationSourceKey_key" ON "ExecutionTask"("userId", "integrationSourceKey");

-- AddForeignKey
ALTER TABLE "ExecutionTaskEvent" ADD CONSTRAINT "ExecutionTaskEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionTaskEvent" ADD CONSTRAINT "ExecutionTaskEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ExecutionTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaptureAttachment" ADD CONSTRAINT "CaptureAttachment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaptureAttachment" ADD CONSTRAINT "CaptureAttachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ExecutionTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ExecutionProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalResult" ADD CONSTRAINT "GoalResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalResult" ADD CONSTRAINT "GoalResult_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAttention" ADD CONSTRAINT "ProjectAttention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAttention" ADD CONSTRAINT "ProjectAttention_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ExecutionProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertDelivery" ADD CONSTRAINT "AlertDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceSync" ADD CONSTRAINT "SourceSync_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

