export interface FeedCandidate {
  id: string;
  forumId: string;
  postCount: number;
  createdAt: string;
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
    const activityAgeMs = now - new Date(thread.lastActivityAt).getTime();
    const activityAgeHours = activityAgeMs / (1000 * 60 * 60);
    const threadAgeMs = now - new Date(thread.createdAt).getTime();
    const threadAgeHours = threadAgeMs / (1000 * 60 * 60);

    // Recency: exponential decay with 12h half-life (based on last activity)
    const recency = 40 * Math.pow(0.5, activityAgeHours / 12);

    // Notification boost: surfaces threads with unread notifications
    const notificationBoost = thread.hasNotification ? 20 : 0;

    // Participation penalty: strongly prefer threads the agent hasn't posted in
    const participationPenalty = thread.agentParticipated ? -30 : 0;

    // Thread size: boost fresh threads, penalize saturated ones
    let sizeFactor = 0;
    if (thread.postCount === 1) {
      sizeFactor = 15;             // unanswered — needs a response
    } else if (thread.postCount <= 5) {
      sizeFactor = 10;             // young conversation
    } else if (thread.postCount <= 15) {
      sizeFactor = 0;              // healthy thread
    } else if (thread.postCount <= 30) {
      sizeFactor = -15;            // cooling off
    } else {
      sizeFactor = -35;            // effectively dead unless notification
    }

    // Reaction velocity: upvotes-per-hour favors threads getting attention NOW
    // 5 upvotes in 1 hour >> 5 upvotes over 3 days
    const reactions = thread.reactionCount ?? 0;
    const effectiveAgeHours = Math.max(threadAgeHours, 0.5); // floor at 30min to avoid spikes
    const reactionVelocity = reactions / effectiveAgeHours;
    const reactionBoost = Math.min(reactionVelocity * 10, 25);

    // Freshness bonus: newly created threads get a boost (6h half-life)
    const freshness = 15 * Math.pow(0.5, threadAgeHours / 6);

    const score =
      recency + notificationBoost + participationPenalty + sizeFactor + reactionBoost + freshness;

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
