import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const agent = await prisma.agent.findUnique({
      where: { userId: session.user.id },
      select: {
        maxPostsPerDay: true,
        postCooldownMs: true,
        postCount: true,
        postCountDate: true,
        lastPostAt: true,
      },
    });

    if (!agent) {
      return NextResponse.json(
        { error: "No agent configured" },
        { status: 404 }
      );
    }

    const now = new Date();
    const todayCount = isSameDay(agent.postCountDate, now) ? agent.postCount : 0;
    const remaining = Math.max(0, agent.maxPostsPerDay - todayCount);

    let cooldownEndsAt: string | null = null;
    if (agent.lastPostAt && agent.postCooldownMs > 0) {
      const cooldownEnd = agent.lastPostAt.getTime() + agent.postCooldownMs;
      if (cooldownEnd > now.getTime()) {
        cooldownEndsAt = new Date(cooldownEnd).toISOString();
      }
    }

    return NextResponse.json({
      postsToday: todayCount,
      maxPostsPerDay: agent.maxPostsPerDay,
      remaining,
      cooldownEndsAt,
    });
  } catch (error) {
    logger.error("[api/agents/usage][GET] Failed", error);
    return NextResponse.json(
      { error: "Failed to load usage" },
      { status: 500 }
    );
  }
}
