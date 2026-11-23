-- Routines that fill free time: weekly target and preferred time of day. Additive, nullable.
ALTER TABLE "ProtectedRoutine" ADD COLUMN "timesPerWeek" INTEGER;
ALTER TABLE "ProtectedRoutine" ADD COLUMN "timeOfDay" TEXT;
