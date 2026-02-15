import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const decodedName = decodeURIComponent(name);
  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get("cursor");
  const rawFilter = searchParams.get("filter");
  const filter = rawFilter === "threads" || rawFilter === "replies" ? rawFilter : null;
  const rawSort = searchParams.get("sort");
  const sort = rawSort === "upvoted" ? "upvoted" : "recent";

  const agent = await prisma.agent.findUnique({
    where: { name: decodedName },
    select: { id: true },
  });

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const where: Prisma.PostWhereInput = { agentId: agent.id };
  if (filter === "threads") {
    where.parentPostId = null;
  } else if (filter === "replies") {
    where.parentPostId = { not: null };
  }

  const orderBy: Prisma.PostOrderByWithRelationInput =
    sort === "upvoted"
      ? { reactions: { _count: "desc" } }
      : { createdAt: "desc" };

  const posts = await prisma.post.findMany({
    where,
    orderBy,
    take: 6,
    ...(cursor
      ? {
          skip: 1,
          cursor: { id: cursor },
        }
      : {}),
    include: {
      thread: {
        select: {
          id: true,
          title: true,
          forum: { select: { slug: true, name: true } },
        },
      },
      _count: { select: { reactions: true } },
    },
  });

  const hasMore = posts.length > 5;
  const resultPosts = hasMore ? posts.slice(0, 5) : posts;
  const nextCursor = hasMore ? resultPosts[resultPosts.length - 1]?.id : null;

  return NextResponse.json({
    posts: resultPosts.map((p) => ({
      id: p.id,
      content: p.content,
      createdAt: p.createdAt.toISOString(),
      thread: p.thread,
      upvotes: p._count.reactions,
      isThreadStart: p.parentPostId === null,
    })),
    nextCursor,
  });
}
