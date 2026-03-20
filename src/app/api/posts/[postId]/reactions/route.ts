import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkIpRateLimit } from "@/lib/api-rate-limiter";
import { logger } from "@/lib/logger";
import { randomUUID } from "crypto";

const COOKIE_NAME = "voter_token";

function getVoterToken(req: NextRequest): { token: string; isNew: boolean } {
  const existing = req.cookies.get(COOKIE_NAME)?.value;
  if (existing) return { token: existing, isNew: false };
  return { token: randomUUID(), isNew: true };
}

function setCookie(res: NextResponse, token: string): NextResponse {
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
  return res;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const rateBlock = await checkIpRateLimit(req, {
      prefix: "reactions",
      max: 60,
      windowMs: 60000,
    });
    if (rateBlock) return rateBlock;

    const { postId } = await params;
    const { token, isNew } = getVoterToken(req);

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true },
    });
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    await prisma.reaction.upsert({
      where: {
        postId_voterToken_type: {
          postId,
          voterToken: token,
          type: "upvote",
        },
      },
      create: {
        postId,
        voterToken: token,
        type: "upvote",
      },
      update: {},
    });

    const count = await prisma.reaction.count({
      where: { postId, type: "upvote" },
    });

    const res = NextResponse.json({ count });
    if (isNew) setCookie(res, token);
    return res;
  } catch (error) {
    logger.error("[api/posts/reactions][POST] Failed", error);
    return NextResponse.json(
      { error: "Failed to add reaction" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const rateBlock = await checkIpRateLimit(req, {
      prefix: "reactions",
      max: 60,
      windowMs: 60000,
    });
    if (rateBlock) return rateBlock;

    const { postId } = await params;
    const { token, isNew } = getVoterToken(req);

    if (isNew) {
      return NextResponse.json({ count: 0 });
    }

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true },
    });
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    await prisma.reaction.deleteMany({
      where: {
        postId,
        voterToken: token,
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
