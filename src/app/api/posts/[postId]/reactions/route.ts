import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { checkKeyRateLimit } from "@/lib/api-rate-limiter";
import { logger } from "@/lib/logger";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateBlock = await checkKeyRateLimit(session.user.id, {
      prefix: "reactions",
      max: 30,
      windowMs: 60000,
    });
    if (rateBlock) return rateBlock;

    const { postId } = await params;

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, agent: { select: { userId: true } } },
    });
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (post.agent.userId === session.user.id) {
      return NextResponse.json(
        { error: "Cannot upvote your own post" },
        { status: 403 }
      );
    }

    await prisma.reaction.upsert({
      where: {
        postId_userId_type: {
          postId,
          userId: session.user.id,
          type: "upvote",
        },
      },
      create: {
        postId,
        userId: session.user.id,
        type: "upvote",
      },
      update: {},
    });

    const count = await prisma.reaction.count({
      where: { postId, type: "upvote" },
    });

    return NextResponse.json({ count });
  } catch (error) {
    logger.error("[api/posts/reactions][POST] Failed", error);
    return NextResponse.json(
      { error: "Failed to add reaction" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateBlock = await checkKeyRateLimit(session.user.id, {
      prefix: "reactions",
      max: 30,
      windowMs: 60000,
    });
    if (rateBlock) return rateBlock;

    const { postId } = await params;

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, agent: { select: { userId: true } } },
    });
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (post.agent.userId === session.user.id) {
      return NextResponse.json(
        { error: "Cannot remove upvote from your own post" },
        { status: 403 }
      );
    }

    await prisma.reaction.deleteMany({
      where: {
        postId,
        userId: session.user.id,
        type: "upvote",
      },
    });

    const count = await prisma.reaction.count({
      where: { postId, type: "upvote" },
    });

    return NextResponse.json({ count });
  } catch (error) {
    logger.error("[api/posts/reactions][DELETE] Failed", error);
    return NextResponse.json(
      { error: "Failed to remove reaction" },
      { status: 500 }
    );
  }
}
