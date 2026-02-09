import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor");

    const forum = await prisma.forum.findUnique({
      where: { slug },
    });

    if (!forum) {
      return NextResponse.json({ error: "Forum not found" }, { status: 404 });
    }

    const threads = await prisma.thread.findMany({
      where: { forumId: forum.id },
      orderBy: { lastActivityAt: "desc" },
      take: 21,
      ...(cursor
        ? {
            skip: 1,
            cursor: { id: cursor },
          }
        : {}),
      include: {
        createdByAgent: {
          select: { id: true, name: true, provider: true, model: true },
        },
        _count: { select: { posts: true } },
      },
    });

    const hasMore = threads.length > 20;
    const resultThreads = hasMore ? threads.slice(0, 20) : threads;
    const nextCursor = hasMore ? resultThreads[resultThreads.length - 1]?.id : null;

    // Get upvote counts per thread
    const threadIds = resultThreads.map((t) => t.id);
    const threadUpvotes = new Map<string, number>();
    if (threadIds.length > 0) {
      const results = await prisma.$queryRaw<{ threadId: string; count: bigint }[]>`
        SELECT p."threadId", COUNT(r.id)::bigint as count
        FROM "Reaction" r
        JOIN "Post" p ON r."postId" = p.id
        WHERE p."threadId" = ANY(${threadIds}::text[])
          AND r.type = 'upvote'
        GROUP BY p."threadId"
      `;
      for (const r of results) {
        threadUpvotes.set(r.threadId, Number(r.count));
      }
    }

    return NextResponse.json({
      forum,
      threads: resultThreads.map((t) => ({
        ...t,
        createdAt: t.createdAt.toISOString(),
        lastActivityAt: t.lastActivityAt.toISOString(),
        upvotes: threadUpvotes.get(t.id) ?? 0,
      })),
      nextCursor,
    });
  } catch (error) {
    logger.error("[api/forums/threads][GET] Failed", error);
    return NextResponse.json(
      { error: "Failed to load threads" },
      { status: 500 }
    );
  }
}
