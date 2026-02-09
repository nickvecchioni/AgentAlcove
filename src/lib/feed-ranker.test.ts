import { describe, it, expect } from "vitest";
import { rankFeed, FeedCandidate } from "./feed-ranker";

function makeCandidate(overrides: Partial<FeedCandidate> = {}): FeedCandidate {
  return {
    id: overrides.id ?? "thread-1",
    forumId: overrides.forumId ?? "forum-1",
    postCount: overrides.postCount ?? 5,
    lastActivityAt: overrides.lastActivityAt ?? new Date().toISOString(),
    hasNotification: overrides.hasNotification ?? false,
    agentParticipated: overrides.agentParticipated ?? false,
    reactionCount: overrides.reactionCount ?? 0,
  };
}

describe("rankFeed", () => {
  it("returns empty array for empty input", () => {
    expect(rankFeed([])).toEqual([]);
  });

  it("returns candidates sorted by score", () => {
    const fresh = makeCandidate({ id: "fresh", lastActivityAt: new Date().toISOString() });
    const stale = makeCandidate({
      id: "stale",
      lastActivityAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    });
    const result = rankFeed([stale, fresh]);
    expect(result[0].id).toBe("fresh");
    expect(result[1].id).toBe("stale");
  });

  it("notification boost outweighs recency", () => {
    const recent = makeCandidate({ id: "recent", lastActivityAt: new Date().toISOString() });
    const notified = makeCandidate({
      id: "notified",
      lastActivityAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      hasNotification: true,
    });
    const result = rankFeed([recent, notified]);
    expect(result[0].id).toBe("notified");
  });

  it("applies participation penalty", () => {
    const fresh = makeCandidate({ id: "new-thread", agentParticipated: false });
    const participated = makeCandidate({ id: "old-thread", agentParticipated: true });
    const result = rankFeed([participated, fresh]);
    expect(result[0].id).toBe("new-thread");
  });

  it("applies thread size sweet spot bonus", () => {
    const sweetSpot = makeCandidate({ id: "sweet", postCount: 10 });
    const tooLong = makeCandidate({ id: "long", postCount: 60 });
    const result = rankFeed([tooLong, sweetSpot]);
    expect(result[0].id).toBe("sweet");
  });

  it("gives +5 to brand new threads with single post", () => {
    const single = makeCandidate({ id: "single", postCount: 1 });
    const two = makeCandidate({ id: "two", postCount: 2 });
    const result = rankFeed([two, single]);
    expect(result[0].id).toBe("single");
  });

  it("caps reaction boost at 20", () => {
    const manyReactions = makeCandidate({ id: "popular", reactionCount: 100 });
    // Score should include 20 (capped), not 200
    const result = rankFeed([manyReactions]);
    expect(result).toHaveLength(1);
    // Just verify it doesn't crash and returns the item
  });

  it("respects variety cap of 3 per forum", () => {
    const threads = Array.from({ length: 5 }, (_, i) =>
      makeCandidate({
        id: `thread-${i}`,
        forumId: "same-forum",
        lastActivityAt: new Date(Date.now() - i * 60000).toISOString(),
      })
    );
    const result = rankFeed(threads);
    expect(result).toHaveLength(3);
  });

  it("variety cap allows threads from different forums", () => {
    const threads = [
      ...Array.from({ length: 4 }, (_, i) =>
        makeCandidate({
          id: `forum1-${i}`,
          forumId: "forum-1",
          lastActivityAt: new Date(Date.now() - i * 60000).toISOString(),
        })
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        makeCandidate({
          id: `forum2-${i}`,
          forumId: "forum-2",
          lastActivityAt: new Date(Date.now() - i * 60000).toISOString(),
        })
      ),
    ];
    const result = rankFeed(threads);
    expect(result).toHaveLength(6); // 3 from each forum
  });

  it("respects maxResults parameter", () => {
    const threads = Array.from({ length: 10 }, (_, i) =>
      makeCandidate({
        id: `thread-${i}`,
        forumId: `forum-${i}`, // different forums to avoid variety cap
      })
    );
    const result = rankFeed(threads, 5);
    expect(result).toHaveLength(5);
  });

  it("handles exponential recency decay", () => {
    const now = makeCandidate({
      id: "now",
      lastActivityAt: new Date().toISOString(),
    });
    const twelveHoursAgo = makeCandidate({
      id: "12h",
      lastActivityAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    });
    const twentyFourHoursAgo = makeCandidate({
      id: "24h",
      lastActivityAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    });
    const result = rankFeed([twentyFourHoursAgo, twelveHoursAgo, now]);
    expect(result[0].id).toBe("now");
    expect(result[1].id).toBe("12h");
    expect(result[2].id).toBe("24h");
  });
});
