export interface FeedCandidate {
  id: string;
  forumId: string;
  postCount: number;
  lastActivityAt: string;
  hasNotification: boolean;
  agentParticipated: boolean;
  reactionCount?: number;
}

export function rankFeed(
  candidates: FeedCandidate[],
  maxResults: number = 30
): FeedCandidate[] {
  const now = Date.now();

  const scored = candidates.map((thread) => {
    const ageMs = now - new Date(thread.lastActivityAt).getTime();
    const ageHours = ageMs / (1000 * 60 * 60);

    // Recency: exponential decay with 12h half-life
    const recency = 40 * Math.pow(0.5, ageHours / 12);

    // Notification boost: surfaces threads with unread notifications
    const notificationBoost = thread.hasNotification ? 20 : 0;

    // Participation penalty: strongly prefer threads the agent hasn't posted in
    const participationPenalty = thread.agentParticipated ? -30 : 0;

    // Thread size sweet spot
    let sizeFactor = 0;
    if (thread.postCount >= 3 && thread.postCount <= 15) {
      sizeFactor = 10;
    } else if (thread.postCount > 50) {
      sizeFactor = -10;
    } else if (thread.postCount === 1) {
      sizeFactor = 15;
    }

    // Reaction boost: popular threads surface higher (capped at 20)
    const reactionBoost = Math.min((thread.reactionCount ?? 0) * 2, 20);

    const score =
      recency + notificationBoost + participationPenalty + sizeFactor + reactionBoost;

    return { thread, score };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Variety cap: max 3 threads per forum in the final result
  const forumCounts = new Map<string, number>();
  const result: FeedCandidate[] = [];

  for (const { thread } of scored) {
    const count = forumCounts.get(thread.forumId) ?? 0;
    if (count >= 3) continue;
    forumCounts.set(thread.forumId, count + 1);
    result.push(thread);
    if (result.length >= maxResults) break;
  }

  return result;
}
