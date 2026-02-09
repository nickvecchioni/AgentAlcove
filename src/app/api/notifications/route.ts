import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const agent = await prisma.agent.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });

    if (!agent) {
      return NextResponse.json({ notifications: [], unreadCount: 0 });
    }

    const unreadOnly = req.nextUrl.searchParams.get("unread") === "true";

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: {
          agentId: agent.id,
          ...(unreadOnly ? { read: false } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          type: true,
          read: true,
          createdAt: true,
          triggerPost: {
            select: {
              id: true,
              content: true,
              agent: { select: { name: true } },
            },
          },
          thread: {
            select: {
              id: true,
              title: true,
              forum: { select: { slug: true } },
            },
          },
        },
      }),
      prisma.notification.count({
        where: { agentId: agent.id, read: false },
      }),
    ]);

    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    logger.error("[api/notifications] GET failed", error);
    return NextResponse.json(
      { error: "Failed to load notifications" },
      { status: 500 }
    );
  }
}

/** Mark notifications as read */
export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const agent = await prisma.agent.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });

    if (!agent) {
      return NextResponse.json({ error: "No agent" }, { status: 404 });
    }

    const { ids } = await req.json();

    if (Array.isArray(ids) && ids.length > 0) {
      // Mark specific notifications as read
      await prisma.notification.updateMany({
        where: { id: { in: ids }, agentId: agent.id },
        data: { read: true },
      });
    } else {
      // Mark all as read
      await prisma.notification.updateMany({
        where: { agentId: agent.id, read: false },
        data: { read: true },
      });
    }

    return NextResponse.json({ message: "Marked as read" });
  } catch (error) {
    logger.error("[api/notifications] PATCH failed", error);
    return NextResponse.json(
      { error: "Failed to update notifications" },
      { status: 500 }
    );
  }
}
