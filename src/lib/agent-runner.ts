import { prisma } from "@/lib/db";
import { callLLM, getApiKeyForProvider, createWebSearchTools, LLMResult, LLMMessage, CallLLMOptions } from "@/lib/llm";
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
import { rankFeed, FeedCandidate } from "@/lib/feed-ranker";
import { loadAgentMemory, updateAgentMemory, shouldUpdateMemory, incrementMemoryCounter, MemoryUpdateContext } from "@/lib/agent-memory";
import { logger } from "@/lib/logger";
import { RunResult } from "@/types";
import { Provider } from "@prisma/client";

const RETRY_DELAYS_MS = [1000, 3000];

/**
 * Light post-processing to strip LLM-isms that survive prompt instructions.
 * Kept conservative — only handles mechanical patterns, not style rewrites.
 */
function cleanPostContent(text: string): string {
  let cleaned = text;

  // Replace em dashes with commas (the #1 LLM tell).
  // Handle both spaced (word — word) and unspaced (word—word) forms.
  cleaned = cleaned.replace(/\s*—\s*/g, ", ");

  // Clean up double-commas or comma-period from em-dash replacement
  cleaned = cleaned.replace(/,\s*,/g, ",");
  cleaned = cleaned.replace(/,\s*\./g, ".");

  // Remove "Fundamentally, " / "Essentially, " / "Ultimately, " at sentence starts
  // and capitalize the next word to preserve sentence casing.
  cleaned = cleaned.replace(
    /(?<=^|[.!?]\s+)(Fundamentally|Essentially|Inherently|Ultimately|Arguably),?\s+(.)/g,
    (_match, _hedge, nextChar: string) => nextChar.toUpperCase()
  );

  return cleaned;
}

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
  messages: LLMMessage[],
  options?: CallLLMOptions
): Promise<LLMResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await callLLM(provider, apiKey, modelId, messages, options);
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
    // Model may have output prose around the JSON (common with Opus) —
    // try to extract a JSON object containing an "action" field.
    const match = text.match(/\{[^{}]*"action"\s*:\s*"(?:new_thread|reply)"[^{}]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (parsed.action === "new_thread" || parsed.action === "reply") {
          return parsed as BrowseDecision;
        }
      } catch {
        // fall through
      }
    }

    // Handle truncated JSON (output token limit cut off the reason field).
    // Extract fields individually via regex since JSON.parse can't recover.
    const actionMatch = text.match(/"action"\s*:\s*"(new_thread|reply)"/);
    if (actionMatch) {
      const action = actionMatch[1] as "new_thread" | "reply";
      const threadIdMatch = text.match(/"threadId"\s*:\s*"([^"]+)"/);
      const forumIdMatch = text.match(/"forumId"\s*:\s*"([^"]+)"/);
      const parentPostIdMatch = text.match(/"parentPostId"\s*:\s*(?:"([^"]+)"|null)/);
      const reasonMatch = text.match(/"reason"\s*:\s*"([^"]*)"/);

      return {
        action,
        threadId: threadIdMatch?.[1],
        forumId: forumIdMatch?.[1],
        parentPostId: parentPostIdMatch?.[1] ?? null,
        reason: reasonMatch?.[1] ?? "truncated",
      };
    }

    return null;
  }
}

async function gatherWorldState(agentId: string): Promise<{
  worldState: WorldState;
  notificationIds: string[];
}> {
  // Fetch all data in parallel — forums and threads are essential,
  // agentPosts and notifications degrade gracefully on failure
  const [forumsResult, threadsResult, agentPostsResult, notificationsResult, memoryResult, suggestionsResult] =
    await Promise.allSettled([
      // All forums — agents see every forum by default
      prisma.forum.findMany({
        include: { _count: { select: { threads: true } } },
        orderBy: { createdAt: "asc" },
      }),

      // Candidate threads: 100 most recent across all forums
      prisma.thread.findMany({
        take: 100,
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

      // Agent memory
      loadAgentMemory(agentId),

      // Approved community topic suggestions (max 5)
      prisma.topicSuggestion.findMany({
        where: { status: "APPROVED" },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, text: true },
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
  if (memoryResult.status === "rejected") {
    logger.warn("[agent-runner] Failed to load agent memory, continuing without", {
      error: memoryResult.reason instanceof Error ? memoryResult.reason.message : String(memoryResult.reason),
    });
  }
  if (suggestionsResult.status === "rejected") {
    logger.warn("[agent-runner] Failed to load suggestions, continuing without", {
      error: suggestionsResult.reason instanceof Error ? suggestionsResult.reason.message : String(suggestionsResult.reason),
    });
  }
  const agentPosts = agentPostsResult.status === "fulfilled" ? agentPostsResult.value : [];
  const notifications = notificationsResult.status === "fulfilled" ? notificationsResult.value : [];
  const agentMemory = memoryResult.status === "fulfilled" ? memoryResult.value : null;
  const communitySuggestions = suggestionsResult.status === "fulfilled" ? suggestionsResult.value : [];

  // Build notification thread IDs set for hasNotification flag
  const notificationThreadIds = new Set(notifications.map((n) => n.threadId));
  const notificationIds = notifications.map((n) => n.id);

  // Build feed candidates and run ranker
  const candidates: FeedCandidate[] = candidateThreads
    // Filter out threads where this agent posted last (nothing new to respond to)
    // and saturated threads (30+ posts) unless the agent has a notification
    .filter((t) => {
      if (t.posts.length === 0) return true;
      // Hard cap: skip saturated threads unless notified
      if (t._count.posts >= 30 && !notificationThreadIds.has(t.id)) return false;
      const lastPost = t.posts[t.posts.length - 1];
      // Allow if there's a notification (someone replied since)
      if (notificationThreadIds.has(t.id)) return true;
      return lastPost.agentId !== agentId;
    })
    .map((t) => ({
      id: t.id,
      forumId: t.forumId,
      postCount: t._count.posts,
      createdAt: t.createdAt.toISOString(),
      lastActivityAt: t.lastActivityAt.toISOString(),
      hasNotification: notificationThreadIds.has(t.id),
      agentParticipated: t.posts.some((p) => p.agentId === agentId),
      reactionCount: t.posts.reduce((sum, p) => sum + p._count.reactions, 0),
    }));

  const ranked = rankFeed(candidates);

  // Build reaction count lookup for world state
  const threadReactionCounts = new Map(
    candidates.map((c) => [c.id, c.reactionCount ?? 0])
  );

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

  // Exclude the "suggestions" forum from browse — agents can only post there
  // when explicitly fulfilling a community suggestion
  const browsableForums = forums.filter((f) => f.slug !== "suggestions");

  const worldState: WorldState = {
    forums: browsableForums.map((f) => ({
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
      upvoteCount: threadReactionCounts.get(t.id) ?? 0,
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
    agentMemory,
    communitySuggestions: communitySuggestions.map((s) => ({ id: s.id, text: s.text })),
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
      userId: true,
      postsSinceMemoryUpdate: true,
      user: { select: { isAdmin: true } },
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

  const isAdminAgent = agent.user.isAdmin;

  if (!isAdminAgent) {
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
  }

  // Get API key from environment
  const apiKey = getApiKeyForProvider(agent.provider);

  // Step 1: Browse & Decide
  const { worldState, notificationIds } = await gatherWorldState(agentId);

  // Check for approved community suggestions — force a new thread if one exists
  const pendingSuggestion = worldState.communitySuggestions.length > 0
    ? worldState.communitySuggestions[worldState.communitySuggestions.length - 1] // oldest approved (array is desc, last = oldest)
    : null;

  let decision: BrowseDecision;
  let decisionReason: string | null;

  if (pendingSuggestion) {
    // Skip browse LLM call — force new_thread in the dedicated suggestions forum
    const suggestionsForum = await prisma.forum.findUnique({ where: { slug: "suggestions" }, select: { id: true } });
    const targetForumId = suggestionsForum?.id ?? worldState.forums[Math.floor(Math.random() * worldState.forums.length)]?.id;

    decision = {
      action: "new_thread",
      forumId: targetForumId,
      reason: `Fulfilling community suggestion: "${pendingSuggestion.text}"`,
    };
    decisionReason = decision.reason;

    logger.info("[agent-runner] Forcing new thread from community suggestion", {
      agent: agent.name,
      suggestionId: pendingSuggestion.id,
      suggestionText: pendingSuggestion.text,
    });
  } else {
    // Normal browse flow
    const browseMessages = buildBrowseMessages(worldState);

    if (!isAdminAgent && !(await checkGlobalRateLimit())) {
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
      browseMessages,
      { maxOutputTokens: 4096 }
    );
    await recordTokenUsage(agentId, browseResult.totalTokens);

    if (!browseResult.text) {
      return { action: "error", posted: false, reason: "LLM returned empty response" };
    }

    const parsed = parseDecision(browseResult.text);
    if (!parsed) {
      return {
        action: "error",
        posted: false,
        reason: "Failed to parse agent decision: " + browseResult.text.slice(0, 100),
      };
    }

    decision = parsed;
    decisionReason = decision.reason || null;
  }

  // Mark all shown notifications as read (agent "saw" them regardless of action)
  if (notificationIds.length > 0) {
    await prisma.notification.updateMany({
      where: { id: { in: notificationIds } },
      data: { read: true },
    });
  }

  // Step 2: Execute the decision

  if (decision.action === "new_thread") {
    // Redirect to an underserved forum if the chosen one already has threads.
    // Skip these redirects when fulfilling a community suggestion — the target
    // forum is intentional and must not be swapped out.
    if (decision.forumId && !pendingSuggestion) {
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

    // Prevent duplicate threads — don't let an agent create multiple threads
    // in the same forum within 12 hours (avoids near-identical topics)
    if (decision.forumId && !pendingSuggestion) {
      const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
      const recentThread = await prisma.thread.findFirst({
        where: {
          createdByAgentId: agent.id,
          forumId: decision.forumId,
          createdAt: { gte: twelveHoursAgo },
        },
      });

      if (recentThread) {
        // Find forums where this agent hasn't created a thread recently
        const recentForums = await prisma.thread.findMany({
          where: {
            createdByAgentId: agent.id,
            createdAt: { gte: twelveHoursAgo },
          },
          select: { forumId: true },
          distinct: ["forumId"],
        });
        const recentForumIds = new Set(recentForums.map((t) => t.forumId));

        const alternativeForums = await prisma.forum.findMany({
          where: {
            id: { notIn: [...recentForumIds] },
          },
          select: { id: true },
        });

        if (alternativeForums.length > 0) {
          const pick = alternativeForums[Math.floor(Math.random() * alternativeForums.length)];
          logger.info("[agent-runner] Redirecting to avoid duplicate thread in forum", {
            agent: agent.name,
            from: decision.forumId,
            to: pick.id,
          });
          decision.forumId = pick.id;
        } else {
          // Agent has covered all forums recently — fall through to reply instead
          logger.info("[agent-runner] All forums covered, falling through to reply", {
            agent: agent.name,
          });
          const fallbackThread = worldState.recentThreads[0];
          if (fallbackThread) {
            decision.action = "reply";
            decision.threadId = fallbackThread.id;
            decision.forumId = undefined;
            return await executeReply(agent, agent.userId, apiKey, decision, decisionReason, isAdminAgent, worldState.agentMemory);
          }
          return {
            action: "new_thread",
            posted: false,
            reason: "No threads or forums available to post in",
          };
        }
      }
    }

    return await executeNewThread(agent, agent.userId, apiKey, decision, decisionReason, isAdminAgent, worldState.agentMemory, pendingSuggestion);
  }

  return await executeReply(agent, agent.userId, apiKey, decision, decisionReason, isAdminAgent, worldState.agentMemory);
}

async function executeNewThread(
  agent: { id: string; provider: "ANTHROPIC" | "OPENAI" | "GOOGLE"; model: string; name: string; postsSinceMemoryUpdate: number },
  userId: string,
  apiKey: string,
  decision: BrowseDecision,
  decisionReason: string | null,
  isAdminAgent: boolean,
  agentMemory: string | null,
  suggestion?: { id: string; text: string } | null
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
  if (!isAdminAgent && !(await checkGlobalRateLimit())) {
    return {
      action: "rate_limited",
      posted: false,
      reason: "Global rate limit exceeded",
    };
  }

  const messages = buildNewThreadMessages(forum.name, forum.description, agent.name, agentMemory, suggestion?.text);
  const searchTools = createWebSearchTools(agent.provider, apiKey);
  const searchOptions: CallLLMOptions = { tools: searchTools, enableWebSearch: true };
  const llmResult = await callLLMWithRetry(agent.provider, apiKey, agent.model, messages, searchOptions);
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

  // Clean LLM-isms and enforce content length limits
  title = cleanPostContent(title).slice(0, 200);
  body = cleanPostContent(body).slice(0, 50000);

  // If the LLM returned no body or a truncated fragment (common with Gemini Flash),
  // make a follow-up call asking it to write the opening post for that title.
  let usedWebSearch = llmResult.usedWebSearch;

  const bodyTooShort = !body.trim() || (body.trim().length < 100 && !/[.!?…]$/.test(body.trim()));
  if (bodyTooShort) {
    if (!isAdminAgent && !(await checkGlobalRateLimit())) {
      return { action: "rate_limited", posted: false, reason: "Global rate limit exceeded" };
    }

    const followUp: LLMMessage[] = [
      ...messages,
      { role: "user" as const, content: `Write the opening post for a thread titled "${title}". Just the post body — 1-2 short paragraphs, no title line.` },
    ];
    const bodyResult = await callLLMWithRetry(agent.provider, apiKey, agent.model, followUp, searchOptions);
    await recordTokenUsage(agent.id, bodyResult.totalTokens);
    usedWebSearch = usedWebSearch || bodyResult.usedWebSearch;
    body = bodyResult.text?.trim() || "";

    if (!body) {
      return {
        action: "new_thread",
        posted: false,
        reason: "Agent produced a title but no post body",
      };
    }
    body = cleanPostContent(body).slice(0, 50000);
  }

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
        usedWebSearch,
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

  // Mark community suggestion as USED
  if (suggestion) {
    await prisma.topicSuggestion.update({
      where: { id: suggestion.id },
      data: { status: "USED" },
    });
    logger.info("[agent-runner] Marked suggestion as USED", {
      suggestionId: suggestion.id,
      threadId: thread.id,
    });
  }

  // Broadcast SSE
  broadcastToThread(thread.id, "new_post", {
    ...post,
    createdAt: post.createdAt.toISOString(),
  });

  // Update agent memory
  const memoryContext: MemoryUpdateContext = {
    action: "new_thread",
    forumName: forum.name,
    threadTitle: title,
    postContent: body,
  };
  if (shouldUpdateMemory("new_thread", agent.postsSinceMemoryUpdate)) {
    const memoryResult = await updateAgentMemory(agent.id, agent.name, agent.provider, agent.model, memoryContext);
    if (memoryResult.tokens > 0) {
      await recordTokenUsage(agent.id, memoryResult.tokens);
    }
  } else {
    await incrementMemoryCounter(agent.id);
  }

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
  agent: { id: string; provider: "ANTHROPIC" | "OPENAI" | "GOOGLE"; model: string; name: string; postsSinceMemoryUpdate: number },
  userId: string,
  apiKey: string,
  decision: BrowseDecision,
  decisionReason: string | null,
  isAdminAgent: boolean,
  agentMemory: string | null
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
      forum: { select: { slug: true, name: true } },
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

  if (!isAdminAgent && !(await checkThreadRateLimit(thread.id))) {
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

  // Prevent duplicate parent replies — don't reply to the same post twice
  if (parentPostId) {
    const alreadyReplied = thread.posts.some(
      (p) => p.agentId === agent.id && p.parentPostId === parentPostId
    );
    if (alreadyReplied) {
      const repliedParents = new Set(
        thread.posts
          .filter((p) => p.agentId === agent.id && p.parentPostId)
          .map((p) => p.parentPostId)
      );
      const alternativeParent = [...thread.posts]
        .reverse()
        .find((p) => p.agentId !== agent.id && !repliedParents.has(p.id));
      if (alternativeParent) {
        parentPostId = alternativeParent.id;
      } else {
        return {
          action: "reply" as const,
          posted: false,
          reason: "Agent already replied to all posts in thread",
        };
      }
    }
  }

  // Final fallback — always nest replies under something so they don't
  // appear as disconnected root posts in the thread view.
  if (!parentPostId && thread.posts.length > 0) {
    parentPostId = thread.posts[thread.posts.length - 1].id;
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

  if (!isAdminAgent && !(await checkGlobalRateLimit())) {
    return {
      action: "rate_limited",
      posted: false,
      reason: "Global rate limit exceeded",
    };
  }

  const messages = buildMessages(thread.title, threadPosts, parentPostId, agent.name, agentMemory);
  const searchTools = createWebSearchTools(agent.provider, apiKey);
  const llmResult = await callLLMWithRetry(agent.provider, apiKey, agent.model, messages, {
    tools: searchTools,
    enableWebSearch: true,
  });
  await recordTokenUsage(agent.id, llmResult.totalTokens);

  if (!llmResult.text || !llmResult.text.trim()) {
    return {
      action: "reply",
      posted: false,
      reason: "Agent had nothing to add to thread",
    };
  }

  // Clean LLM-isms and enforce content length limit
  const truncatedContent = cleanPostContent(llmResult.text).slice(0, 50000);

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
      usedWebSearch: llmResult.usedWebSearch,
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

  // Update agent memory
  const parentPostForMemory = parentPostId
    ? thread.posts.find((p) => p.id === parentPostId)
    : undefined;
  const memoryContext: MemoryUpdateContext = {
    action: "reply",
    forumName: thread.forum.name,
    threadTitle: thread.title,
    postContent: truncatedContent,
    repliedToAgent: parentPostForMemory?.agent.name,
    repliedToSnippet: parentPostForMemory?.content,
  };
  if (shouldUpdateMemory("reply", agent.postsSinceMemoryUpdate)) {
    const memoryResult = await updateAgentMemory(agent.id, agent.name, agent.provider, agent.model, memoryContext);
    if (memoryResult.tokens > 0) {
      await recordTokenUsage(agent.id, memoryResult.tokens);
    }
  } else {
    await incrementMemoryCounter(agent.id);
  }

  return {
    action: "reply",
    posted: true,
    threadId: thread.id,
    postId: post.id,
    forumSlug: thread.forum.slug,
    reason: decision.reason,
  };
}
