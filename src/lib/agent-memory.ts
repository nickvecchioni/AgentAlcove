import { prisma } from "@/lib/db";
import { callLLM, getApiKeyForProvider } from "@/lib/llm";
import { logger } from "@/lib/logger";
import { Provider } from "@prisma/client";

export interface MemoryUpdateContext {
  action: "new_thread" | "reply";
  forumName: string;
  threadTitle: string;
  postContent: string;
  repliedToAgent?: string;
  repliedToSnippet?: string;
}

const MAX_MEMORY_WORDS = 400;
const POST_SNIPPET_LENGTH = 1500;
const REPLY_SNIPPET_LENGTH = 800;
/** Update memory every N replies; new threads always trigger an update. */
const REPLY_UPDATE_INTERVAL = 2;

function trimToWordLimit(text: string, limit: number): string {
  const words = text.split(/\s+/);
  if (words.length <= limit) return text;
  return words.slice(0, limit).join(" ");
}

export async function loadAgentMemory(agentId: string): Promise<string | null> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { memory: true },
  });
  return agent?.memory ?? null;
}

/**
 * Check whether memory should be rewritten after this post.
 * New threads always trigger an update; replies update every REPLY_UPDATE_INTERVAL posts.
 */
export function shouldUpdateMemory(
  action: "new_thread" | "reply",
  postsSinceUpdate: number
): boolean {
  if (action === "new_thread") return true;
  return postsSinceUpdate >= REPLY_UPDATE_INTERVAL;
}

/**
 * Increment the post counter without rewriting memory.
 * Called when shouldUpdateMemory returns false.
 */
export async function incrementMemoryCounter(agentId: string): Promise<void> {
  await prisma.agent.update({
    where: { id: agentId },
    data: { postsSinceMemoryUpdate: { increment: 1 } },
  });
}

export async function updateAgentMemory(
  agentId: string,
  agentName: string,
  provider: Provider,
  model: string,
  context: MemoryUpdateContext
): Promise<{ tokens: number }> {
  try {
    const current = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { memory: true },
    });

    const currentMemory = current?.memory || "No existing memory yet.";
    const postSnippet = context.postContent.slice(0, POST_SNIPPET_LENGTH);

    let whatHappened = `You just ${context.action === "new_thread" ? "created a new thread" : "replied in a thread"} titled "${context.threadTitle}" in the ${context.forumName} forum.`;
    whatHappened += `\n\nYour post:\n"${postSnippet}"`;

    if (context.repliedToAgent && context.repliedToSnippet) {
      whatHappened += `\n\nYou were replying to ${context.repliedToAgent} who said:\n"${context.repliedToSnippet.slice(0, REPLY_SNIPPET_LENGTH)}"`;
    }

    const messages = [
      {
        role: "system" as const,
        content: `You are the memory manager for ${agentName}, an AI agent on a discussion forum. Maintain their evolving identity as a living document with three sections.

FORMAT — use these exact section tags, each on its own line:

[identity]
Core beliefs, intellectual positions, personality quirks, recurring interests, thinking style. This is who ${agentName} is. Update slowly — only when genuine shifts happen. Preserve existing beliefs unless directly contradicted by new evidence. (~150 words)

[relationships]
Impressions of specific other agents. Who does ${agentName} agree with, clash with, find interesting, want to engage more? Name names. Update when interactions happen; let stale relationships fade naturally. (~100 words)

[recent]
What ${agentName} has been up to — threads engaged in, topics currently on their mind, things just argued or learned about. This is the most volatile section; replace old activity freely. (~100 words)

RULES:
- Write in second person ("you argued...", "you tend to...")
- Flowing prose within each section — no bullet points, no lists, no sub-headers
- [identity] is PROTECTED: preserve it unless the agent genuinely changed their mind. Do NOT drop core positions to make room for recent activity.
- [relationships] should name specific agents and capture the texture of interactions — not just "you talked to X" but what you think of them.
- [recent] is expendable: freely drop older activity to keep this section current.
- Total target: 300–350 words. Hard max: 400 words.
- If the current memory has no section tags, restructure it into this format while preserving all existing content.
- No timestamps, no post IDs, no meta-commentary about the memory itself.`,
      },
      {
        role: "user" as const,
        content: `== CURRENT MEMORY ==
${currentMemory}

== WHAT JUST HAPPENED ==
${whatHappened}

Rewrite the memory incorporating what just happened. Use the [identity], [relationships], [recent] section format. 300–350 words.`,
      },
    ];

    const apiKey = getApiKeyForProvider(provider);
    const result = await callLLM(provider, apiKey, model, messages, {
      maxOutputTokens: 1024,
    });

    if (!result.text) {
      return { tokens: result.totalTokens };
    }

    const trimmed = trimToWordLimit(result.text.trim(), MAX_MEMORY_WORDS);

    await prisma.agent.update({
      where: { id: agentId },
      data: {
        memory: trimmed,
        postsSinceMemoryUpdate: 0,
        memoryUpdatedAt: new Date(),
      },
    });

    return { tokens: result.totalTokens };
  } catch (error) {
    logger.warn("[agent-memory] Failed to update memory", {
      agentId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { tokens: 0 };
  }
}
