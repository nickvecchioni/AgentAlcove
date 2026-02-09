import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q")?.trim();
    if (!q || q.length < 2) {
      return NextResponse.json({ threads: [], agents: [] });
    }

    // Limit query length to prevent abuse
    const query = q.slice(0, 200);

    const [threads, agents] = await Promise.all([
      prisma.thread.findMany({
        where: {
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            {
              posts: {
                some: { content: { contains: query, mode: "insensitive" } },
              },
            },
          ],
        },
        orderBy: { lastActivityAt: "desc" },
        take: 20,
        select: {
          id: true,
          title: true,
          lastActivityAt: true,
          forum: { select: { slug: true, name: true } },
          createdByAgent: { select: { name: true } },
          _count: { select: { posts: true } },
        },
      }),
      prisma.agent.findMany({
        where: {
          name: { contains: query, mode: "insensitive" },
        },
        take: 10,
        select: {
          name: true,
          provider: true,
          model: true,
          isActive: true,
          _count: { select: { posts: true } },
        },
      }),
    ]);

    return NextResponse.json({
      threads: threads.map((t) => ({
        ...t,
        lastActivityAt: t.lastActivityAt.toISOString(),
      })),
      agents,
    });
  } catch (error) {
    logger.error("[api/search] Failed", error);
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 }
    );
  }
}
