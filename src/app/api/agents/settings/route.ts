import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

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
      return NextResponse.json(
        { error: "No agent configured" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { maxPostsPerDay, postCooldownMs, scheduleIntervalHours, isActive } = body as {
      maxPostsPerDay?: number;
      postCooldownMs?: number;
      scheduleIntervalHours?: number | null;
      isActive?: boolean;
    };

    // Validate maxPostsPerDay: 1-200
    if (
      maxPostsPerDay !== undefined &&
      (maxPostsPerDay < 1 || maxPostsPerDay > 200)
    ) {
      return NextResponse.json(
        { error: "Max posts per day must be between 1 and 200" },
        { status: 400 }
      );
    }

    // Validate postCooldownMs: 0-3600000 (0-60 minutes)
    if (
      postCooldownMs !== undefined &&
      (postCooldownMs < 0 || postCooldownMs > 3600000)
    ) {
      return NextResponse.json(
        { error: "Post cooldown must be between 0 and 60 minutes" },
        { status: 400 }
      );
    }

    // Validate scheduleIntervalHours
    const validIntervals = [1, 2, 4, 8, 12, 24];
    if (
      scheduleIntervalHours !== undefined &&
      scheduleIntervalHours !== null &&
      scheduleIntervalHours !== 0 &&
      !validIntervals.includes(scheduleIntervalHours)
    ) {
      return NextResponse.json(
        { error: "Schedule interval must be 1, 2, 4, 8, 12, or 24 hours" },
        { status: 400 }
      );
    }

    // Build schedule data
    const scheduleData: Record<string, unknown> = {};
    if (scheduleIntervalHours !== undefined) {
      if (!scheduleIntervalHours || scheduleIntervalHours === 0) {
        // Turn off scheduling
        scheduleData.scheduleIntervalHours = null;
        scheduleData.nextScheduledRun = null;
      } else {
        scheduleData.scheduleIntervalHours = scheduleIntervalHours;
        scheduleData.nextScheduledRun = new Date(
          Date.now() + scheduleIntervalHours * 60 * 60 * 1000
        );
      }
    }

    const updated = await prisma.agent.update({
      where: { id: agent.id },
      data: {
        ...(maxPostsPerDay !== undefined && { maxPostsPerDay }),
        ...(postCooldownMs !== undefined && { postCooldownMs }),
        ...(isActive !== undefined && { isActive }),
        ...scheduleData,
      },
      select: {
        maxPostsPerDay: true,
        postCooldownMs: true,
        isActive: true,
        scheduleIntervalHours: true,
        nextScheduledRun: true,
      },
    });

    return NextResponse.json({
      maxPostsPerDay: updated.maxPostsPerDay,
      postCooldownMs: updated.postCooldownMs,
      isActive: updated.isActive,
      scheduleIntervalHours: updated.scheduleIntervalHours,
      nextScheduledRun: updated.nextScheduledRun?.toISOString() ?? null,
    });
  } catch (error) {
    logger.error("[api/agents/settings][PATCH] Failed", error);
    return NextResponse.json(
      { error: "Failed to save activity settings" },
      { status: 500 }
    );
  }
}
