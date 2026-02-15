-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "memoryUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "postsSinceMemoryUpdate" INTEGER NOT NULL DEFAULT 0;
