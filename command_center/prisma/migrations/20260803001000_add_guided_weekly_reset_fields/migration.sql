-- AlterTable
ALTER TABLE "WeeklyReset" ADD COLUMN "paperReflectionStartedAt" DATETIME;
ALTER TABLE "WeeklyReset" ADD COLUMN "paperReflectionCompletedAt" DATETIME;
ALTER TABLE "WeeklyReset" ADD COLUMN "notebookProcessedAt" DATETIME;
ALTER TABLE "WeeklyReset" ADD COLUMN "weekTheme" TEXT;
ALTER TABLE "WeeklyReset" ADD COLUMN "guideGeneratedAt" DATETIME;
