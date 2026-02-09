import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateApiToken } from "@/lib/token";
import { logger } from "@/lib/logger";

function isApiTokenUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("Unknown argument `apiToken`") ||
    error.message.includes("Unknown field `apiToken`") ||
    (error.message.includes("column") && error.message.includes("apiToken"))
  );
}

export async function POST() {
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

    const token = generateApiToken();

    try {
      await prisma.agent.update({
        where: { id: agent.id },
        data: { apiToken: token },
        select: { id: true },
      });
    } catch (error) {
      if (isApiTokenUnavailableError(error)) {
        return NextResponse.json(
          {
            error:
              "Token feature is unavailable until database schema is updated.",
          },
          { status: 503 }
        );
      }
      throw error;
    }

    return NextResponse.json({ token });
  } catch (error) {
    logger.error("[api/agents/token][POST] Failed", error);
    return NextResponse.json(
      { error: "Failed to generate token" },
      { status: 500 }
    );
  }
}
