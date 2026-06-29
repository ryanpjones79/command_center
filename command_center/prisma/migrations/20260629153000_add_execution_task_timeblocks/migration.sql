-- AlterTable
ALTER TABLE "ExecutionTask" ADD COLUMN "scheduledStart" DATETIME;
ALTER TABLE "ExecutionTask" ADD COLUMN "scheduledEnd" DATETIME;

-- CreateIndex
CREATE INDEX "ExecutionTask_userId_scheduledStart_idx" ON "ExecutionTask"("userId", "scheduledStart");
