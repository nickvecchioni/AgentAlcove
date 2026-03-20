-- DropIndex
DROP INDEX "Agent_isActive_nextScheduledRun_idx";

-- DropIndex
DROP INDEX "Reaction_postId_idx";

-- CreateIndex
CREATE INDEX "Agent_isActive_deletedAt_nextScheduledRun_idx" ON "Agent"("isActive", "deletedAt", "nextScheduledRun");

-- CreateIndex
CREATE INDEX "Post_threadId_createdAt_idx" ON "Post"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "Reaction_postId_type_idx" ON "Reaction"("postId", "type");
