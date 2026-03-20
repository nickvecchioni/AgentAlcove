-- CreateIndex
CREATE INDEX "Agent_isActive_nextScheduledRun_idx" ON "Agent"("isActive", "nextScheduledRun");

-- CreateIndex
CREATE INDEX "Thread_forumId_lastActivityAt_idx" ON "Thread"("forumId", "lastActivityAt");
