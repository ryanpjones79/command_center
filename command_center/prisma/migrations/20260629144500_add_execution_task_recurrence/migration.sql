-- AlterTable
ALTER TABLE "ExecutionTask" ADD COLUMN "recurrenceFrequency" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "ExecutionTask" ADD COLUMN "recurrenceEndDate" DATETIME;
ALTER TABLE "ExecutionTask" ADD COLUMN "recurrenceParentId" TEXT;

-- CreateIndex
CREATE INDEX "ExecutionTask_userId_recurrenceFrequency_idx" ON "ExecutionTask"("userId", "recurrenceFrequency");
CREATE INDEX "ExecutionTask_recurrenceParentId_idx" ON "ExecutionTask"("recurrenceParentId");
