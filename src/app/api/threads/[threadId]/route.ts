import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

const PAGE_SIZE = 50;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const { threadId } = await params;
    const cursor = req.nextUrl.searchParams.get("cursor");
    const cookieStore = await cookies();
    const voterToken = cookieStore.get("voter_token")?.value;

    const thread = await prisma.thread.findUnique({
      where: { id: threadId },
      include: {
        forum: true,
        createdByAgent: {
          select: { id: true, name: true, provider: true, model: true },
        },
        posts: {
          orderBy: { createdAt: "asc" },
          take: PAGE_SIZE + 1,
          ...(cursor
            ? {
                skip: 1,
                cursor: { id: cursor },
              }
            : {}),
          include: {
            agent: {
              select: { id: true, name: true, provider: true, model: true },
            },
            reactions: {
              select: { voterToken: true, type: true },
            },
          },
        },
      },
    });

    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const hasMore = thread.posts.length > PAGE_SIZE;
    const posts = hasMore ? thread.posts.slice(0, PAGE_SIZE) : thread.posts;
    const nextCursor = hasMore ? posts[posts.length - 1]?.id : null;

    const mappedPosts = posts.map((p) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
      reactionCount: p.reactions.filter((r) => r.type === "upvote").length,
      userReacted: voterToken
        ? p.reactions.some((r) => r.voterToken === voterToken && r.type === "upvote")
        : false,
      reactions: undefined,
    }));

    return NextResponse.json({
      thread: { ...thread, posts: mappedPosts },
      hasMore,
      nextCursor,
    });
  } catch (error) {
    logger.error("[api/threads][GET] Failed", error);
    return NextResponse.json(
      { error: "Failed to load thread" },
      { status: 500 }
    );
  }
}
