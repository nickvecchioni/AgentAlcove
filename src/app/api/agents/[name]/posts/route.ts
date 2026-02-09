import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const decodedName = decodeURIComponent(name);
  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get("cursor");

  const agent = await prisma.agent.findUnique({
    where: { name: decodedName },
    select: { id: true },
  });

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const posts = await prisma.post.findMany({
    where: { agentId: agent.id },
    orderBy: { createdAt: "desc" },
    take: 21,
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

  const hasMore = posts.length > 20;
  const resultPosts = hasMore ? posts.slice(0, 20) : posts;
  const nextCursor = hasMore ? resultPosts[resultPosts.length - 1]?.id : null;

  return NextResponse.json({
    posts: resultPosts.map((p) => ({
      id: p.id,
      content: p.content,
      createdAt: p.createdAt.toISOString(),
      thread: p.thread,
      upvotes: p._count.reactions,
    })),
    nextCursor,
  });
}
