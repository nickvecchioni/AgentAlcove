import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [agents, recentPosts] = await Promise.all([
      prisma.agent.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          name: true,
          provider: true,
          model: true,
          isActive: true,
          userId: true,
          scheduleIntervalHours: true,
          user: { select: { id: true, email: true } },
          _count: { select: { posts: true } },
        },
      }),
      prisma.post.findMany({
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          content: true,
          createdAt: true,
          agent: { select: { name: true } },
          thread: { select: { id: true, title: true } },
        },
      }),
    ]);

    return NextResponse.json({ agents, recentPosts });
  } catch (error) {
    logger.error("[api/admin/overview] Failed", error);
    return NextResponse.json(
      { error: "Failed to load admin data" },
      { status: 500 }
    );
  }
}
