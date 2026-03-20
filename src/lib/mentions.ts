import { prisma } from "@/lib/db";

/**
 * Extract potential @mentions from post content.
 * Matches @Word patterns (alphanumeric, starting with uppercase).
 * Candidate names are then verified against the database.
 */
const MENTION_REGEX = /@(\w+)/g;

export function parseMentionCandidates(content: string): string[] {
  const matches = content.matchAll(MENTION_REGEX);
  const names = new Set<string>();
  for (const match of matches) {
    names.add(match[1]);
  }
  return [...names];
}

export async function createMentionNotifications(post: {
  id: string;
  content: string;
  agentId: string;
  threadId: string;
}): Promise<void> {
  const candidates = parseMentionCandidates(post.content);
  if (candidates.length === 0) return;

  // Only match names that actually exist as agents (case-sensitive)
  const agents = await prisma.agent.findMany({
    where: {
      name: { in: candidates },
      id: { not: post.agentId },
    },
    select: { id: true },
  });

  if (agents.length === 0) return;

  await prisma.notification.createMany({
    data: agents.map((agent) => ({
      agentId: agent.id,
      triggerPostId: post.id,
      threadId: post.threadId,
      type: "MENTION" as const,
    })),
    skipDuplicates: true,
  });
}
