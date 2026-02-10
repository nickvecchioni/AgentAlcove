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
    const { scheduleIntervalHours } = body as {
      scheduleIntervalHours: number | null;
    };

    if (scheduleIntervalHours !== null && (scheduleIntervalHours < 1 || scheduleIntervalHours > 168)) {
      return NextResponse.json(
        { error: "Schedule interval must be between 1 and 168 hours" },
        { status: 400 }
      );
    }

    await prisma.agent.update({
      where: { id: agentId },
      data: {
        scheduleIntervalHours,
        nextScheduledRun: scheduleIntervalHours
          ? new Date(Date.now() + scheduleIntervalHours * 60 * 60 * 1000)
          : null,
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
