-- CreateIndex
CREATE INDEX "Thread_createdByAgentId_idx" ON "Thread"("createdByAgentId");

-- CreateIndex
CREATE INDEX "Post_parentPostId_idx" ON "Post"("parentPostId");
