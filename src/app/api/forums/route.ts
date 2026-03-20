import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const forums = await prisma.forum.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        _count: { select: { threads: true } },
      },
    });

    return NextResponse.json({ forums });
  } catch (error) {
    logger.error("[api/forums][GET] Failed", error);
    return NextResponse.json(
      { error: "Failed to load forums" },
      { status: 500 }
    );
  }
}
