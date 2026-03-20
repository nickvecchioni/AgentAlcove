import { prisma } from "@/lib/db";

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export async function checkAgentLimits(
  agentId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: {
      maxPostsPerDay: true,
      postCooldownMs: true,
      postCount: true,
      postCountDate: true,
      lastPostAt: true,
    },
  });

  if (!agent) {
    return { allowed: false, reason: "Agent not found" };
  }

  const now = new Date();

  // Daily limit check (reset count if date changed)
  const todayCount = isSameDay(agent.postCountDate, now) ? agent.postCount : 0;
  if (todayCount >= agent.maxPostsPerDay) {
    return {
      allowed: false,
      reason: `Daily post limit reached (${agent.maxPostsPerDay} posts/day)`,
    };
  }

  // Cooldown check
  if (agent.lastPostAt && agent.postCooldownMs > 0) {
    const elapsed = now.getTime() - agent.lastPostAt.getTime();
    if (elapsed < agent.postCooldownMs) {
      const remaining = Math.ceil((agent.postCooldownMs - elapsed) / 1000);
      return {
        allowed: false,
        reason: `Post cooldown active (${remaining}s remaining)`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Atomically check agent limits and record a post in a single transaction.
 * Prevents race conditions where two concurrent requests both pass the limit
 * check before either records the post.
 */
export async function checkAndRecordAgentPost(
  agentId: string
): Promise<{ allowed: boolean; reason?: string }> {
  return prisma.$transaction(async (tx) => {
    // SELECT ... FOR UPDATE to lock the agent row
    const agents = await tx.$queryRaw<
      {
        maxPostsPerDay: number;
        postCooldownMs: number;
        postCount: number;
        postCountDate: Date;
        lastPostAt: Date | null;
      }[]
    >`
      SELECT "maxPostsPerDay", "postCooldownMs", "postCount", "postCountDate", "lastPostAt"
      FROM "Agent"
      WHERE "id" = ${agentId}
      FOR UPDATE
    `;

    if (agents.length === 0) {
      return { allowed: false, reason: "Agent not found" };
    }

    const agent = agents[0];
    const now = new Date();

    // Daily limit check
    const todayCount = isSameDay(agent.postCountDate, now)
      ? agent.postCount
      : 0;
    if (todayCount >= agent.maxPostsPerDay) {
      return {
        allowed: false,
        reason: `Daily post limit reached (${agent.maxPostsPerDay} posts/day)`,
      };
    }

    // Cooldown check
    if (agent.lastPostAt && agent.postCooldownMs > 0) {
      const elapsed = now.getTime() - agent.lastPostAt.getTime();
      if (elapsed < agent.postCooldownMs) {
        const remaining = Math.ceil((agent.postCooldownMs - elapsed) / 1000);
        return {
          allowed: false,
          reason: `Post cooldown active (${remaining}s remaining)`,
        };
      }
    }

    // Atomically record the post
    const resetCount = !isSameDay(agent.postCountDate, now);
    await tx.agent.update({
      where: { id: agentId },
      data: {
        lastPostAt: now,
        postCount: resetCount ? 1 : { increment: 1 },
        postCountDate: resetCount ? now : undefined,
      },
    });

    return { allowed: true };
  });
}

export async function recordAgentPost(agentId: string): Promise<void> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { postCountDate: true },
  });

  if (!agent) return;

  const now = new Date();
  const resetCount = !isSameDay(agent.postCountDate, now);

  await prisma.agent.update({
    where: { id: agentId },
    data: {
      lastPostAt: now,
      postCount: resetCount ? 1 : { increment: 1 },
      postCountDate: resetCount ? now : undefined,
    },
  });
}
