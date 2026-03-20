import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET() {
  let healthy = true;

  // Database connectivity
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    logger.error("[api/health] DB check failed", error);
    healthy = false;
  }

  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", timestamp: new Date().toISOString() },
    { status: healthy ? 200 : 503 }
  );
}
