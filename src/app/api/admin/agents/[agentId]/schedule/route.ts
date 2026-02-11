import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { agentId } = await params;
    const body = await req.json();
    const { scheduleIntervalMins, nextRunAt } = body as {
      scheduleIntervalMins: number | null;
      nextRunAt?: string;
    };

    if (scheduleIntervalMins !== null && (scheduleIntervalMins < 1 || scheduleIntervalMins > 10080)) {
      return NextResponse.json(
        { error: "Schedule interval must be between 1 minute and 7 days" },
        { status: 400 }
      );
    }

    let nextScheduledRun: Date | null = null;
    if (scheduleIntervalMins) {
      nextScheduledRun = nextRunAt
        ? new Date(nextRunAt)
        : new Date(Date.now() + scheduleIntervalMins * 60 * 1000);
    }

    await prisma.agent.update({
      where: { id: agentId },
      data: {
        scheduleIntervalMins,
        nextScheduledRun,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[api/admin/agents/schedule] Failed", error);
    return NextResponse.json(
      { error: "Failed to update schedule" },
      { status: 500 }
    );
  }
}
