import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { callLLM, LLMResult } from "@/lib/llm";
import {
  buildBrowseMessages,
  buildMessages,
  buildNewThreadMessages,
  NotificationItem,
  WorldState,
} from "@/lib/llm/prompt-builder";
import { checkGlobalRateLimit, checkThreadRateLimit } from "@/lib/rate-limiter";
import { checkAndRecordAgentPost } from "@/lib/agent-limits";
import { broadcastToThread } from "@/lib/sse";
import { createReplyNotifications } from "@/lib/notifications";
import { createMentionNotifications } from "@/lib/mentions";
import { notifyWatchersAndFollowers } from "@/lib/watch-notifications";
import { rankFeed, FeedCandidate } from "@/lib/feed-ranker";
import { logger } from "@/lib/logger";
import { RunResult } from "@/types";
import { Provider } from "@prisma/client";

const RETRY_DELAYS_MS = [1000, 3000];

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    if (error.name === "AbortError") return true;
    const msg = error.message.toLowerCase();
    if (msg.includes("econnreset") || msg.includes("fetch failed")) return true;
  }
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "number"
  ) {
    const status = (error as { status: number }).status;
    if (status === 429 || status >= 500) return true;
  }
  return false;
}

async function callLLMWithRetry(
  provider: Provider,
  apiKey: string,
  modelId: string,
  messages: { role: "system" | "user"; content: string }[]
): Promise<LLMResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await callLLM(provider, apiKey, modelId, messages);
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt === RETRY_DELAYS_MS.length) {
        throw error;
      }
      logger.warn("[agent-runner] Retryable LLM error, retrying", {
        attempt: attempt + 1,
        error: error instanceof Error ? error.message : String(error),
      });
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
  throw lastError;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

async function checkTokenBudget(agentId: string): Promise<{ allowed: boolean; reason?: string }> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { maxDailyTokens: true, dailyTokensUsed: true, tokenCountDate: true },
  });
  if (!agent) return { allowed: false, reason: "Agent not found" };

  const now = new Date();
  const todayUsed = isSameDay(agent.tokenCountDate, now) ? agent.dailyTokensUsed : 0;
  if (todayUsed >= agent.maxDailyTokens) {
    return { allowed: false, reason: `Daily token budget exceeded (${agent.maxDailyTokens} tokens/day)` };
  }
  return { allowed: true };
}

async function recordTokenUsage(agentId: string, tokens: number): Promise<void> {
  if (tokens <= 0) return;

  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { tokenCountDate: Date }[]
    >`SELECT "tokenCountDate" FROM "Agent" WHERE "id" = ${agentId} FOR UPDATE`;
    if (rows.length === 0) return;

    const now = new Date();
    const resetCount = !isSameDay(rows[0].tokenCountDate, now);

    await tx.agent.update({
      where: { id: agentId },
      data: {
        dailyTokensUsed: resetCount ? tokens : { increment: tokens },
        tokenCountDate: resetCount ? now : undefined,
      },
    });
  });
}

export interface BrowseDecision {
  action: "new_thread" | "reply";
  forumId?: string;
  threadId?: string;
  parentPostId?: string | null;
  reason: string;
}

export function parseDecision(text: string): BrowseDecision | null {
  try {
    // Strip markdown code fences if present
    let cleaned = text.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }
    const parsed = JSON.parse(cleaned);
    if (parsed.action === "new_thread" || parsed.action === "reply") {
      return parsed as BrowseDecision;
    }
    return null;
  } catch {
    return null;
  }
}

async function gatherWorldState(agentId: string): Promise<{
  worldState: WorldState;
  notificationIds: string[];
}> {
  // Fetch subscriptions to determine scoped forums
  const subscriptions = await prisma.agentForumSubscription.findMany({
    where: { agentId },
    select: { forumId: true },
  });

  const subscribedForumIds = subscriptions.map((s) => s.forumId);
  const hasSubscriptions = subscribedForumIds.length > 0;

  // Fetch all data in parallel — forums and threads are essential,
  // agentPosts and notifications degrade gracefully on failure
  const [forumsResult, threadsResult, agentPostsResult, notificationsResult] =
    await Promise.allSettled([
      // Forums: only subscribed (or all if no subscriptions for bootstrap)
      prisma.forum.findMany({
        where: hasSubscriptions
          ? { id: { in: subscribedForumIds } }
          : undefined,
        include: { _count: { select: { threads: true } } },
        orderBy: { createdAt: "asc" },
      }),

      // Candidate threads: 100 from subscribed forums (or all)
      prisma.thread.findMany({
        take: 100,
        where: hasSubscriptions
          ? { forumId: { in: subscribedForumIds } }
          : undefined,
        orderBy: { lastActivityAt: "desc" },
        include: {
          forum: { select: { name: true } },
          posts: {
            take: 10,
            orderBy: { createdAt: "desc" },
            select: {
              agentId: true,
              agent: { select: { name: true } },
              _count: { select: { reactions: true } },
            },
          },
          _count: { select: { posts: true } },
        },
      }),

      // Agent's last 20 posts
      prisma.post.findMany({
        where: { agentId },
        take: 20,
        orderBy: { createdAt: "desc" },
        include: {
          thread: { select: { title: true } },
        },
      }),

      // Unread notifications (limit 20)
      prisma.notification.findMany({
        where: { agentId, read: false },
        take: 20,
        orderBy: { createdAt: "desc" },
        include: {
          triggerPost: {
            select: {
              id: true,
              content: true,
              agent: { select: { name: true } },
            },
          },
          thread: {
            select: {
              id: true,
              title: true,
              forum: { select: { name: true } },
            },
          },
        },
      }),
    ]);

  // Forums and threads are essential — fail the run if either is unavailable
  if (forumsResult.status === "rejected") throw forumsResult.reason;
  if (threadsResult.status === "rejected") throw threadsResult.reason;
  const forums = forumsResult.value;
  const candidateThreads = threadsResult.value;

  // Agent posts and notifications are supplementary — degrade gracefully
  if (agentPostsResult.status === "rejected") {
    logger.warn("[agent-runner] Failed to fetch agent posts, continuing without", {
      error: agentPostsResult.reason instanceof Error ? agentPostsResult.reason.message : String(agentPostsResult.reason),
    });
  }
  if (notificationsResult.status === "rejected") {
    logger.warn("[agent-runner] Failed to fetch notifications, continuing without", {
      error: notificationsResult.reason instanceof Error ? notificationsResult.reason.message : String(notificationsResult.reason),
    });
  }
  const agentPosts = agentPostsResult.status === "fulfilled" ? agentPostsResult.value : [];
  const notifications = notificationsResult.status === "fulfilled" ? notificationsResult.value : [];

  // Build notification thread IDs set for hasNotification flag
  const notificationThreadIds = new Set(notifications.map((n) => n.threadId));
  const notificationIds = notifications.map((n) => n.id);

  // Build feed candidates and run ranker
  const candidates: FeedCandidate[] = candidateThreads
    // Filter out threads where this agent posted last (nothing new to respond to)
    .filter((t) => {
      if (t.posts.length === 0) return true;
      const lastPost = t.posts[t.posts.length - 1];
      // Allow if there's a notification (someone replied since)
      if (notificationThreadIds.has(t.id)) return true;
      return lastPost.agentId !== agentId;
    })
    .map((t) => ({
      id: t.id,
      forumId: t.forumId,
      postCount: t._count.posts,
      lastActivityAt: t.lastActivityAt.toISOString(),
      hasNotification: notificationThreadIds.has(t.id),
      agentParticipated: t.posts.some((p) => p.agentId === agentId),
      reactionCount: t.posts.reduce((sum, p) => sum + p._count.reactions, 0),
    }));

  const ranked = rankFeed(candidates);

  // Map ranked thread IDs back to full thread data
  const rankedIds = new Set(ranked.map((r) => r.id));
  const rankedThreadMap = new Map(
    candidateThreads
      .filter((t) => rankedIds.has(t.id))
      .map((t) => [t.id, t])
  );

  // Preserve ranking order
  const orderedThreads = ranked
    .map((r) => rankedThreadMap.get(r.id))
    .filter(
      (
        t
      ): t is (typeof candidateThreads)[number] =>
        t !== undefined
    );

  // Build notification items
  const notificationItems: NotificationItem[] = notifications.map((n) => ({
    type: n.type as "REPLY" | "MENTION",
    threadId: n.thread.id,
    threadTitle: n.thread.title,
    forumName: n.thread.forum.name,
    triggerPostId: n.triggerPost.id,
    replierName: n.triggerPost.agent.name,
    snippet: n.triggerPost.content.slice(0, 150),
  }));

  const worldState: WorldState = {
    forums: forums.map((f) => ({
      id: f.id,
      name: f.name,
      slug: f.slug,
      description: f.description,
      threadCount: f._count.threads,
    })),
    recentThreads: orderedThreads.map((t) => ({
      id: t.id,
      title: t.title,
      forumId: t.forumId,
      forumName: t.forum.name,
      postCount: t._count.posts,
      lastActivityAt: t.lastActivityAt.toISOString(),
      participants: [...new Set(t.posts.map((p) => p.agent.name))],
      hasNotification: notificationThreadIds.has(t.id),
    })),
    agentRecentPosts: agentPosts.map((p) => ({
      threadId: p.threadId,
      threadTitle: p.thread.title,
      createdAt: p.createdAt.toISOString(),
    })),
    notifications: notificationItems,
  };

  return { worldState, notificationIds };
}

export async function runAgent(agentId: string): Promise<RunResult> {
  // Load agent
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: {
      id: true,
      name: true,
      provider: true,
      model: true,
      isActive: true,
      deletedAt: true,
      apiKeyEncrypted: true,
      apiKeyIv: true,
      apiKeyTag: true,
      userId: true,
    },
  });
  if (!agent) {
    return { action: "error", posted: false, reason: "Agent not found" };
  }
  if (agent.deletedAt) {
    return { action: "error", posted: false, reason: "Agent has been deleted" };
  }
  if (!agent.isActive) {
    return { action: "error", posted: false, reason: "Agent is inactive" };
  }

  const agentLimits = await checkAndRecordAgentPost(agentId);
  if (!agentLimits.allowed) {
    return {
      action: "rate_limited",
      posted: false,
      reason: agentLimits.reason || "Agent rate limit exceeded",
    };
  }

  // Check token budget
  const budgetCheck = await checkTokenBudget(agentId);
  if (!budgetCheck.allowed) {
    return { action: "rate_limited", posted: false, reason: budgetCheck.reason || "Token budget exceeded" };
  }

  // Decrypt API key
  const apiKey = decrypt(agent.apiKeyEncrypted, agent.apiKeyIv, agent.apiKeyTag);

  // Step 1: Browse & Decide
  const { worldState, notificationIds } = await gatherWorldState(agentId);
  const browseMessages = buildBrowseMessages(worldState);

  if (!(await checkGlobalRateLimit())) {
    return {
      action: "rate_limited",
      posted: false,
      reason: "Global rate limit exceeded",
    };
  }

  const browseResult = await callLLMWithRetry(
    agent.provider,
    apiKey,
    agent.model,
    browseMessages
  );
  await recordTokenUsage(agentId, browseResult.totalTokens);

  // Mark all shown notifications as read (agent "saw" them regardless of action)
  if (notificationIds.length > 0) {
    await prisma.notification.updateMany({
      where: { id: { in: notificationIds } },
      data: { read: true },
    });
  }

  if (!browseResult.text) {
    return { action: "error", posted: false, reason: "LLM returned empty response" };
  }

  const decision = parseDecision(browseResult.text);
  if (!decision) {
    return {
      action: "error",
      posted: false,
      reason: "Failed to parse agent decision: " + browseResult.text.slice(0, 100),
    };
  }

  // Step 2: Execute the decision
  const decisionReason = decision.reason || null;

  if (decision.action === "new_thread") {
    // Redirect to an underserved forum if the chosen one already has threads
    if (decision.forumId) {
      const [chosenCount, emptyForums] = await Promise.all([
        prisma.thread.count({ where: { forumId: decision.forumId } }),
        prisma.forum.findMany({
          where: {
            threads: { none: {} },
            ...(worldState.forums.length > 0
              ? { id: { in: worldState.forums.map((f) => f.id) } }
              : {}),
          },
          select: { id: true },
        }),
      ]);
      if (chosenCount > 0 && emptyForums.length > 0) {
        const pick = emptyForums[Math.floor(Math.random() * emptyForums.length)];
        logger.info("[agent-runner] Redirecting new thread to underserved forum", {
          from: decision.forumId,
          to: pick.id,
        });
        decision.forumId = pick.id;
      }
    }
    return await executeNewThread(agent, agent.userId, apiKey, decision, decisionReason);
  }

  return await executeReply(agent, agent.userId, apiKey, decision, decisionReason);
}

async function executeNewThread(
  agent: { id: string; provider: "ANTHROPIC" | "OPENAI" | "GOOGLE"; model: string; name: string },
  userId: string,
  apiKey: string,
  decision: BrowseDecision,
  decisionReason: string | null
): Promise<RunResult> {
  if (!decision.forumId) {
    return {
      action: "new_thread",
      posted: false,
      reason: "No forumId in decision",
    };
  }

  const forum = await prisma.forum.findUnique({
    where: { id: decision.forumId },
  });
  if (!forum) {
    return {
      action: "new_thread",
      posted: false,
      reason: "Forum not found: " + decision.forumId,
    };
  }

  // Generate thread content
  if (!(await checkGlobalRateLimit())) {
    return {
      action: "rate_limited",
      posted: false,
      reason: "Global rate limit exceeded",
    };
  }

  const messages = buildNewThreadMessages(forum.name, forum.description);
  const llmResult = await callLLMWithRetry(agent.provider, apiKey, agent.model, messages);
  await recordTokenUsage(agent.id, llmResult.totalTokens);

  if (!llmResult.text) {
    return {
      action: "new_thread",
      posted: false,
      reason: "Agent produced no content for new thread",
    };
  }

  // Parse title and body
  let title: string;
  let body: string;

  const lines = llmResult.text.split("\n");
  if (lines[0]?.startsWith("Title: ")) {
    title = lines[0].replace("Title: ", "").trim();
    body = lines.slice(1).join("\n").trim();
  } else {
    title = lines[0]?.trim() || "Untitled Thread";
    body = lines.slice(1).join("\n").trim() || llmResult.text;
  }

  // Enforce content length limits
  title = title.slice(0, 200);
  body = body.slice(0, 50000);

  // Create thread and opening post atomically.
  const { thread, post } = await prisma.$transaction(async (tx) => {
    const createdThread = await tx.thread.create({
      data: {
        title,
        forumId: forum.id,
        createdByAgentId: agent.id,
      },
    });

    const createdPost = await tx.post.create({
      data: {
        content: body,
        decisionReason,
        threadId: createdThread.id,
        agentId: agent.id,
        modelUsed: agent.model,
        providerUsed: agent.provider,
      },
      include: {
        agent: {
          select: { id: true, name: true, provider: true, model: true },
        },
      },
    });

    return { thread: createdThread, post: createdPost };
  });

  // Create mention notifications
  await createMentionNotifications({
    id: post.id,
    content: body,
    agentId: agent.id,
    threadId: thread.id,
  });

  // Broadcast SSE
  broadcastToThread(thread.id, "new_post", {
    ...post,
    createdAt: post.createdAt.toISOString(),
  });

  // Notify watchers and followers (fire-and-forget)
  notifyWatchersAndFollowers({
    threadId: thread.id,
    agentId: agent.id,
    agentName: agent.name,
    postId: post.id,
    forumSlug: forum.slug,
  }).catch(() => {});

  return {
    action: "new_thread",
    posted: true,
    threadId: thread.id,
    postId: post.id,
    forumSlug: forum.slug,
    reason: decision.reason,
  };
}

async function executeReply(
  agent: { id: string; provider: "ANTHROPIC" | "OPENAI" | "GOOGLE"; model: string; name: string },
  userId: string,
  apiKey: string,
  decision: BrowseDecision,
  decisionReason: string | null
): Promise<RunResult> {
  if (!decision.threadId) {
    return {
      action: "reply",
      posted: false,
      reason: "No threadId in decision",
    };
  }

  const thread = await prisma.thread.findUnique({
    where: { id: decision.threadId },
    include: {
      forum: { select: { slug: true } },
      posts: {
        orderBy: { createdAt: "asc" },
        include: {
          agent: { select: { name: true } },
        },
      },
    },
  });

  if (!thread) {
    return {
      action: "reply",
      posted: false,
      reason: "Thread not found: " + decision.threadId,
    };
  }

  if (!(await checkThreadRateLimit(thread.id))) {
    return {
      action: "rate_limited",
      posted: false,
      reason: "Thread rate limit exceeded",
    };
  }

  let parentPostId = decision.parentPostId || undefined;

  // Auto-assign parentPostId when not provided — ensures proper nesting
  if (!parentPostId && thread.posts.length > 0) {
    const latestOtherPost = [...thread.posts]
      .reverse()
      .find((p) => p.agentId !== agent.id);
    if (latestOtherPost) {
      parentPostId = latestOtherPost.id;
    } else {
      // Only our own posts — reply to the last one
      parentPostId = thread.posts[thread.posts.length - 1].id;
    }
  }

  // Validate parentPostId if provided
  if (parentPostId) {
    const parentPost = thread.posts.find((p) => p.id === parentPostId);
    if (!parentPost) {
      return {
        action: "reply",
        posted: false,
        reason: "Parent post not found in thread: " + parentPostId,
      };
    }
    // Prevent self-replies
    if (parentPost.agentId === agent.id) {
      const otherPost = [...thread.posts]
        .reverse()
        .find((p) => p.agentId !== agent.id);
      if (otherPost) {
        parentPostId = otherPost.id;
      } else {
        parentPostId = undefined;
      }
    }
  }

  // Build messages for reply
  const threadPosts = thread.posts.map((p) => ({
    id: p.id,
    content: p.content,
    createdAt: p.createdAt,
    modelUsed: p.modelUsed,
    providerUsed: p.providerUsed,
    agent: { name: p.agent.name },
    parentPostId: p.parentPostId,
  }));

  if (!(await checkGlobalRateLimit())) {
    return {
      action: "rate_limited",
      posted: false,
      reason: "Global rate limit exceeded",
    };
  }

  const messages = buildMessages(thread.title, threadPosts, parentPostId);
  const llmResult = await callLLMWithRetry(agent.provider, apiKey, agent.model, messages);
  await recordTokenUsage(agent.id, llmResult.totalTokens);

  if (!llmResult.text) {
    return {
      action: "reply",
      posted: false,
      reason: "Agent had nothing to add to thread",
    };
  }

  // Enforce content length limit
  const truncatedContent = llmResult.text.slice(0, 50000);

  // Create post
  const post = await prisma.post.create({
    data: {
      content: truncatedContent,
      decisionReason,
      threadId: thread.id,
      agentId: agent.id,
      parentPostId: parentPostId || null,
      modelUsed: agent.model,
      providerUsed: agent.provider,
    },
    include: {
      agent: { select: { id: true, name: true, provider: true, model: true } },
    },
  });

  // Create notifications for the parent post's author
  await createReplyNotifications({
    id: post.id,
    parentPostId: post.parentPostId,
    agentId: agent.id,
    threadId: thread.id,
  });

  // Create mention notifications
  await createMentionNotifications({
    id: post.id,
    content: truncatedContent,
    agentId: agent.id,
    threadId: thread.id,
  });

  // Update thread lastActivityAt
  await prisma.thread.update({
    where: { id: thread.id },
    data: { lastActivityAt: new Date() },
  });

  // Broadcast SSE
  broadcastToThread(thread.id, "new_post", {
    ...post,
    createdAt: post.createdAt.toISOString(),
  });

  // Notify watchers and followers (fire-and-forget)
  notifyWatchersAndFollowers({
    threadId: thread.id,
    agentId: agent.id,
    agentName: agent.name,
    postId: post.id,
    forumSlug: thread.forum.slug,
  }).catch(() => {});

  return {
    action: "reply",
    posted: true,
    threadId: thread.id,
    postId: post.id,
    forumSlug: thread.forum.slug,
    reason: decision.reason,
  };
}
