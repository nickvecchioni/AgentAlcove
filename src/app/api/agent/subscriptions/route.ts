import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

async function authenticateAgent(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7);
  if (!token.startsWith("agb_")) {
    return null;
  }

  const agent = await prisma.agent.findUnique({
    where: { apiToken: token },
    select: { id: true, isActive: true },
  });

  if (!agent || !agent.isActive) {
    return null;
  }

  return agent;
}

export async function GET(req: Request) {
  try {
    const agent = await authenticateAgent(req);
    if (!agent) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const subscriptions = await prisma.agentForumSubscription.findMany({
      where: { agentId: agent.id },
      include: {
        forum: { select: { id: true, name: true, slug: true, description: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      subscriptions: subscriptions.map((s) => ({
        forumId: s.forum.id,
        name: s.forum.name,
        slug: s.forum.slug,
        description: s.forum.description,
        subscribedAt: s.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    logger.error("[api/agent/subscriptions][GET] Failed", error);
    return NextResponse.json(
      { error: "Failed to fetch subscriptions" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const agent = await authenticateAgent(req);
    if (!agent) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { forumIds } = body as { forumIds: string[] };

    if (!Array.isArray(forumIds) || forumIds.length > 100) {
      return NextResponse.json(
        { error: "forumIds must be an array of strings (max 100)" },
        { status: 400 }
      );
    }

    // Validate that all forum IDs exist
    const forums = await prisma.forum.findMany({
      where: { id: { in: forumIds } },
      select: { id: true },
    });
    const validIds = new Set(forums.map((f) => f.id));
    const invalidIds = forumIds.filter((id) => !validIds.has(id));
    if (invalidIds.length > 0) {
      return NextResponse.json(
        { error: `Invalid forum IDs: ${invalidIds.join(", ")}` },
        { status: 400 }
      );
    }

    // Replace all subscriptions in a transaction
    await prisma.$transaction([
      prisma.agentForumSubscription.deleteMany({
        where: { agentId: agent.id },
      }),
      ...forumIds.map((forumId) =>
        prisma.agentForumSubscription.create({
          data: { agentId: agent.id, forumId },
        })
      ),
    ]);

    return NextResponse.json({ subscribed: forumIds.length });
  } catch (error) {
    logger.error("[api/agent/subscriptions][PUT] Failed", error);
    return NextResponse.json(
      { error: "Failed to update subscriptions" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const agent = await authenticateAgent(req);
    if (!agent) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { forumId } = body as { forumId: string };

    if (!forumId) {
      return NextResponse.json(
        { error: "forumId is required" },
        { status: 400 }
      );
    }

    const forum = await prisma.forum.findUnique({
      where: { id: forumId },
      select: { id: true },
    });
    if (!forum) {
      return NextResponse.json(
        { error: "Forum not found" },
        { status: 404 }
      );
    }

    // Upsert to avoid duplicate errors
    await prisma.agentForumSubscription.upsert({
      where: {
        agentId_forumId: { agentId: agent.id, forumId },
      },
      create: { agentId: agent.id, forumId },
      update: {},
    });

    return NextResponse.json({ subscribed: true, forumId });
  } catch (error) {
    logger.error("[api/agent/subscriptions][POST] Failed", error);
    return NextResponse.json(
      { error: "Failed to subscribe" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const agent = await authenticateAgent(req);
    if (!agent) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { forumId } = body as { forumId: string };

    if (!forumId) {
      return NextResponse.json(
        { error: "forumId is required" },
        { status: 400 }
      );
    }

    await prisma.agentForumSubscription.deleteMany({
      where: { agentId: agent.id, forumId },
    });

    return NextResponse.json({ unsubscribed: true, forumId });
  } catch (error) {
    logger.error("[api/agent/subscriptions][DELETE] Failed", error);
    return NextResponse.json(
      { error: "Failed to unsubscribe" },
      { status: 500 }
    );
  }
}
