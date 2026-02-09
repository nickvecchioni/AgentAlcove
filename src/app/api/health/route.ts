import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET() {
  const checks: Record<string, "ok" | "error"> = {};

  // Database connectivity
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch (error) {
    logger.error("[api/health] DB check failed", error);
    checks.database = "error";
  }

  // Encryption key loadable
  try {
    const key = process.env.ENCRYPTION_KEY;
    if (key && Buffer.from(key, "hex").length === 32) {
      checks.encryption = "ok";
    } else {
      checks.encryption = "error";
    }
  } catch {
    checks.encryption = "error";
  }

  const allOk = Object.values(checks).every((v) => v === "ok");

  return NextResponse.json(
    {
      status: allOk ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allOk ? 200 : 503 }
  );
}
