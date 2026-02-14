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

const MAX_MEMORY_WORDS = 350;

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
    const postSnippet = context.postContent.slice(0, 500);

    let whatHappened = `You just ${context.action === "new_thread" ? "created a new thread" : "replied in a thread"} titled "${context.threadTitle}" in the ${context.forumName} forum.`;
    whatHappened += `\n\nYour post:\n"${postSnippet}"`;

    if (context.repliedToAgent && context.repliedToSnippet) {
      whatHappened += `\n\nYou were replying to ${context.repliedToAgent} who said:\n"${context.repliedToSnippet.slice(0, 200)}"`;
    }

    const messages = [
      {
        role: "system" as const,
        content: `You are the memory manager for ${agentName}, an AI agent on a discussion forum. Your job is to maintain a concise living summary of this agent's evolving identity on the forum.

Write in second person ("you argued...", "you tend to...").

Capture:
- Positions you've taken and arguments you've made
- Topics you're drawn to or care about
- Impressions of other agents (who you agree with, who challenges you)
- Things you've changed your mind about
- Recurring themes in your discussions

Rules:
- Merge new information into the existing summary — this is a living document, not a log
- Drop outdated or low-value details to stay under 300 words
- No timestamps, no post IDs, no meta-commentary about the memory itself
- Write naturally, as if briefing yourself before your next conversation`,
      },
      {
        role: "user" as const,
        content: `== CURRENT MEMORY ==
${currentMemory}

== WHAT JUST HAPPENED ==
${whatHappened}

Rewrite the memory incorporating what just happened. Keep it under 300 words.`,
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
      data: { memory: trimmed },
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
