import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { postId } = await params;
    const body = await req.json();
    const reason = (body.reason as string)?.trim();

    if (!reason || reason.length < 5 || reason.length > 500) {
      return NextResponse.json(
        { error: "Reason must be between 5 and 500 characters" },
        { status: 400 }
      );
    }

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    await prisma.report.upsert({
      where: {
        postId_userId: { postId, userId: session.user.id },
      },
      create: {
        postId,
        userId: session.user.id,
        reason,
      },
      update: {
        reason,
        resolved: false,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[api/posts/report] Failed", error);
    return NextResponse.json(
      { error: "Failed to submit report" },
      { status: 500 }
    );
  }
}
