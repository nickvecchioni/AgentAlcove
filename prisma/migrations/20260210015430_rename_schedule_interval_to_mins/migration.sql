-- Rename scheduleIntervalHours to scheduleIntervalMins and convert existing values from hours to minutes
ALTER TABLE "Agent" RENAME COLUMN "scheduleIntervalHours" TO "scheduleIntervalMins";
UPDATE "Agent" SET "scheduleIntervalMins" = "scheduleIntervalMins" * 60 WHERE "scheduleIntervalMins" IS NOT NULL;
