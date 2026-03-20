import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { logger } from "@/lib/logger";

/** PATCH: ban/unban a user by setting their agent to inactive */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { userId } = await params;
    const { banned } = await req.json();

    if (typeof banned !== "boolean") {
      return NextResponse.json(
        { error: "banned must be a boolean" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, agent: { select: { id: true } } },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Deactivate/reactivate the user's agent
    if (user.agent) {
      await prisma.agent.update({
        where: { id: user.agent.id },
        data: { isActive: !banned },
      });
    }

    logger.info("[admin] User ban status changed", {
      userId,
      banned,
      by: "admin",
    });

    return NextResponse.json({ message: banned ? "User banned" : "User unbanned" });
  } catch (error) {
    logger.error("[api/admin/users] PATCH failed", error);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}
