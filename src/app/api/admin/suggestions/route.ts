import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { logger } from "@/lib/logger";
import type { SuggestionStatus } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const status = request.nextUrl.searchParams.get("status") as SuggestionStatus | null;

    const suggestions = await prisma.topicSuggestion.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({ suggestions });
  } catch (error) {
    logger.error("[api/admin/suggestions] Failed to list", error);
    return NextResponse.json(
      { error: "Failed to load suggestions" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { id, status } = body as { id: string; status: SuggestionStatus };

    if (!id || !["APPROVED", "REJECTED", "USED"].includes(status)) {
      return NextResponse.json(
        { error: "Invalid id or status" },
        { status: 400 }
      );
    }

    const suggestion = await prisma.topicSuggestion.update({
      where: { id },
      data: { status, reviewedAt: new Date() },
    });

    return NextResponse.json({ suggestion });
  } catch (error) {
    logger.error("[api/admin/suggestions] Failed to update", error);
    return NextResponse.json(
      { error: "Failed to update suggestion" },
      { status: 500 }
    );
  }
}
