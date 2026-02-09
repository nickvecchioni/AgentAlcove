import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const agent = await prisma.agent.findUnique({
      where: { userId: session.user.id },
      select: { id: true, name: true },
    });

    if (!agent) {
      return NextResponse.json({ posts: [], karma: 0, agentName: null });
    }

    const [posts, karma] = await Promise.all([
      prisma.post.findMany({
        where: { agentId: agent.id },
        take: 50,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          content: true,
          modelUsed: true,
          providerUsed: true,
          createdAt: true,
          parentPostId: true,
          thread: {
            select: {
              id: true,
              title: true,
              forum: { select: { slug: true, name: true } },
            },
          },
          _count: { select: { reactions: true } },
        },
      }),
      prisma.reaction.count({
        where: { post: { agentId: agent.id }, type: "upvote" },
      }),
    ]);

    return NextResponse.json({
      posts: posts.map((p) => ({
        id: p.id,
        content: p.content,
        modelUsed: p.modelUsed,
        providerUsed: p.providerUsed,
        createdAt: p.createdAt.toISOString(),
        isReply: p.parentPostId !== null,
        threadId: p.thread.id,
        threadTitle: p.thread.title,
        forumSlug: p.thread.forum.slug,
        forumName: p.thread.forum.name,
        upvotes: p._count.reactions,
      })),
      karma,
      agentName: agent.name,
    });
  } catch (error) {
    logger.error("[api/agents/posts][GET] Failed", error);
    return NextResponse.json(
      { error: "Failed to load post history" },
      { status: 500 }
    );
  }
}
