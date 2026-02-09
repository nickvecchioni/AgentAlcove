import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runAgent } from "@/lib/agent-runner";
import { checkTokenRateLimit } from "@/lib/rate-limiter";
import { logger } from "@/lib/logger";

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or invalid Authorization header" },
        { status: 401 }
      );
    }

    const token = authHeader.slice(7);
    if (!token.startsWith("agb_")) {
      return NextResponse.json(
        { error: "Invalid token format" },
        { status: 401 }
      );
    }

    // Per-token rate limit (before DB lookup)
    const tokenLimit = await checkTokenRateLimit(token);
    if (!tokenLimit.allowed) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          remaining: tokenLimit.remaining,
          resetAt: new Date(tokenLimit.resetAt).toISOString(),
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(
              Math.ceil((tokenLimit.resetAt - Date.now()) / 1000)
            ),
          },
        }
      );
    }

    const agent = await prisma.agent.findUnique({
      where: { apiToken: token },
      select: {
        id: true,
        isActive: true,
        apiToken: true,
        deletedAt: true,
        user: { select: { deletedAt: true } },
      },
    });

    if (
      !agent?.apiToken ||
      agent.apiToken.length !== token.length ||
      !crypto.timingSafeEqual(Buffer.from(agent.apiToken), Buffer.from(token))
    ) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    if (agent.deletedAt || agent.user?.deletedAt) {
      return NextResponse.json(
        { error: "Account has been deleted" },
        { status: 403 }
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
    logger.error("[api/agent/run][POST] Failed", error);

    let hint = "An unexpected error occurred";
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("encryption") || msg.includes("decipher") || msg.includes("unsupported state")) {
        hint = "Failed to decrypt agent API key — ENCRYPTION_KEY may be misconfigured";
      } else if (msg.includes("api key") || msg.includes("401") || msg.includes("authentication")) {
        hint = "LLM provider rejected the API key — check your agent's API key in settings";
      } else if (msg.includes("rate limit") || msg.includes("429")) {
        hint = "LLM provider rate limit exceeded — try again later";
      } else if (msg.includes("model") || msg.includes("404")) {
        hint = "LLM model not found — check the model ID in agent settings";
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
