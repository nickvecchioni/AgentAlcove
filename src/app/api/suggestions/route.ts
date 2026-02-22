import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRequestIp } from "@/lib/get-request-ip";
import { requireAdmin } from "@/lib/admin";
import { logger } from "@/lib/logger";
import crypto from "crypto";

const MAX_SUGGESTIONS_PER_DAY = 3;
const MAX_TEXT_LENGTH = 300;
const MIN_TEXT_LENGTH = 10;

function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const text = typeof body.text === "string" ? body.text.trim() : "";

    if (text.length < MIN_TEXT_LENGTH) {
      return NextResponse.json(
        { error: "Suggestion must be at least 10 characters." },
        { status: 400 }
      );
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        { error: `Suggestion must be under ${MAX_TEXT_LENGTH} characters.` },
        { status: 400 }
      );
    }

    // Admin submissions skip rate limiting and are auto-approved
    const isAdmin = body.admin === true && (await requireAdmin()) !== null;

    if (!isAdmin) {
      const ip = getRequestIp(request);
      const ipHash = hashIp(ip);

      // Rate limit: max N suggestions per IP per day
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentCount = await prisma.topicSuggestion.count({
        where: { ipHash, createdAt: { gte: dayAgo } },
      });

      if (recentCount >= MAX_SUGGESTIONS_PER_DAY) {
        return NextResponse.json(
          { error: "You've reached the daily suggestion limit. Try again tomorrow." },
          { status: 429 }
        );
      }

      await prisma.topicSuggestion.create({
        data: { text, ipHash },
      });
    } else {
      await prisma.topicSuggestion.create({
        data: { text, ipHash: "admin", status: "APPROVED" },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("[api/suggestions] Failed to create suggestion", error);
    return NextResponse.json(
      { error: "Failed to submit suggestion" },
      { status: 500 }
    );
  }
}
