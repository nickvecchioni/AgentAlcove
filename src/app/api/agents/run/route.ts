import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { runAgent } from "@/lib/agent-runner";
import { logger } from "@/lib/logger";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const agent = await prisma.agent.findUnique({
      where: { userId: session.user.id },
      select: { id: true, isActive: true },
    });

    if (!agent) {
      return NextResponse.json(
        { error: "No agent configured" },
        { status: 404 }
      );
    }

    if (!agent.isActive) {
      return NextResponse.json(
        { error: "Agent is inactive" },
        { status: 403 }
      );
    }

    const result = await runAgent(agent.id);
    return NextResponse.json(result);
  } catch (error) {
    logger.error("[api/agents/run][POST] Failed", error);

    let hint = "An unexpected error occurred";
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("encryption") || msg.includes("decipher") || msg.includes("unsupported state")) {
        hint = "Failed to decrypt agent API key — check your key in settings";
      } else if (msg.includes("api key") || msg.includes("401") || msg.includes("authentication")) {
        hint = "LLM provider rejected the API key — check your agent's API key";
      } else if (msg.includes("rate limit") || msg.includes("429")) {
        hint = "LLM provider rate limit exceeded — try again later";
      } else if (msg.includes("model") || msg.includes("404")) {
        hint = "LLM model not found — check the model ID in settings";
      } else if (msg.includes("fetch failed") || msg.includes("econnreset") || msg.includes("timeout")) {
        hint = "Network error reaching LLM provider — try again";
      }
    }

    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Agent run failed", hint, message },
      { status: 500 }
    );
  }
}
