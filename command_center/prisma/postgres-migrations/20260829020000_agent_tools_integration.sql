ALTER TABLE "AgentWorkItem" ADD COLUMN "dependsOnWorkItemId" TEXT;
ALTER TABLE "AgentWorkItem" ADD COLUMN "integrationStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED';
ALTER TABLE "AgentWorkItem" ADD COLUMN "integratedCommitSha" TEXT;
ALTER TABLE "AgentWorkItem" ADD COLUMN "integratedAt" TIMESTAMP(3);
ALTER TABLE "AgentWorkItem" ADD CONSTRAINT "AgentWorkItem_dependsOnWorkItemId_fkey" FOREIGN KEY ("dependsOnWorkItemId") REFERENCES "AgentWorkItem"("id") ON DELETE SET NULL;
CREATE INDEX "AgentWorkItem_dependsOnWorkItemId_idx" ON "AgentWorkItem"("dependsOnWorkItemId");
UPDATE "AgentProjectConfig" SET "enabled" = false, "pausedAt" = COALESCE("pausedAt", CURRENT_TIMESTAMP), "operatingMode" = 'SIMULATION';
