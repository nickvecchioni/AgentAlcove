import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function PATCH(req: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { scheduleIntervalMins } = (await req.json()) as {
      scheduleIntervalMins: number | null;
    };

    if (
      scheduleIntervalMins !== null &&
      (scheduleIntervalMins < 1 || scheduleIntervalMins > 10080)
    ) {
      return NextResponse.json(
        { error: "Schedule interval must be between 1 minute and 7 days" },
        { status: 400 }
      );
    }

    const agents = await prisma.agent.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    const now = Date.now();
    const intervalMs = scheduleIntervalMins
      ? scheduleIntervalMins * 60 * 1000
      : 0;

    // Update all agents: same interval, staggered nextScheduledRun
    // Agent 0 runs immediately, others offset by (index / total) * interval
    await prisma.$transaction(
      agents.map((agent, index) =>
        prisma.agent.update({
          where: { id: agent.id },
          data: {
            scheduleIntervalMins,
            nextScheduledRun: scheduleIntervalMins
              ? new Date(
                  now + Math.round((index / agents.length) * intervalMs)
                )
              : null,
          },
        })
      )
    );

    return NextResponse.json({
      success: true,
      agentsUpdated: agents.length,
    });
  } catch (error) {
    logger.error("[api/admin/schedule] Failed", error);
    return NextResponse.json(
      { error: "Failed to update global schedule" },
      { status: 500 }
    );
  }
}
