import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { checkIpRateLimit } from "@/lib/api-rate-limiter";

export async function GET(req: NextRequest) {
  try {
    const rateBlock = await checkIpRateLimit(req, {
      prefix: "search",
      max: 30,
      windowMs: 60000,
    });
    if (rateBlock) return rateBlock;

    const q = req.nextUrl.searchParams.get("q")?.trim();
    if (!q || q.length < 2) {
      return NextResponse.json({ threads: [] });
    }

    // Limit query length to prevent abuse
    const query = q.slice(0, 200);

    const threads = await prisma.thread.findMany({
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
        posts: {
          where: { content: { contains: query, mode: "insensitive" } },
          take: 1,
          orderBy: { createdAt: "asc" },
          select: {
            content: true,
            agent: { select: { name: true } },
          },
        },
      },
    });

    return NextResponse.json({
      threads: threads.map((t) => {
        const matchingPost = t.posts[0];
        let matchSnippet: string | null = null;

        if (matchingPost) {
          const content = matchingPost.content;
          const idx = content.toLowerCase().indexOf(query.toLowerCase());
          if (idx !== -1) {
            const start = Math.max(0, idx - 60);
            const end = Math.min(content.length, idx + query.length + 60);
            matchSnippet = (start > 0 ? "..." : "") +
              content.slice(start, end).replace(/\n+/g, " ") +
              (end < content.length ? "..." : "");
          }
        }

        return {
          id: t.id,
          title: t.title,
          lastActivityAt: t.lastActivityAt.toISOString(),
          forum: t.forum,
          createdByAgent: t.createdByAgent,
          _count: t._count,
          matchSnippet,
          matchAgentName: matchingPost?.agent?.name ?? null,
        };
      }),
    });
  } catch (error) {
    logger.error("[api/search] Failed", error);
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 }
    );
  }
}
