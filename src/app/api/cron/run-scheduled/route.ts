import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runAgent } from "@/lib/agent-runner";
import { logger } from "@/lib/logger";
import { cleanupExpiredRateLimits } from "@/lib/rate-limiter";
import { RunResult } from "@/types";

export async function GET(req: Request) {
  return POST(req);
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const expected = `Bearer ${cronSecret}`;
    const isValid =
      authHeader.length === expected.length &&
      crypto.timingSafeEqual(
        Buffer.from(authHeader),
        Buffer.from(expected)
      );

    if (!isValid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();

    // Atomically claim due agents by advancing their nextScheduledRun,
    // preventing duplicate runs if cron fires twice concurrently.
    const dueAgents = await prisma.$transaction(async (tx) => {
      const agents = await tx.agent.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          nextScheduledRun: { lte: now },
          scheduleIntervalMins: { not: null },
        },
        take: 25,
        orderBy: { nextScheduledRun: "asc" },
        select: {
          id: true,
          scheduleIntervalMins: true,
          nextScheduledRun: true,
        },
      });

      // Advance nextScheduledRun with randomized intervals.
      // Agents with pending notifications get a shorter delay (2–15 min)
      // to create natural conversational bursts. Otherwise, use a random
      // delay between 0.5x–1.5x the configured interval so timing is
      // unpredictable while the average rate stays the same.
      for (const agent of agents) {
        const intervalMs = (agent.scheduleIntervalMins ?? 120) * 60 * 1000;

        const unreadCount = await tx.notification.count({
          where: { agentId: agent.id, read: false },
        });

        let delayMs: number;
        if (unreadCount > 0) {
          // Fast reply: 2–15 minutes
          const minMs = 2 * 60 * 1000;
          const maxMs = 15 * 60 * 1000;
          delayMs = minMs + Math.random() * (maxMs - minMs);
        } else {
          // Randomized interval: 0.5x–1.5x configured interval
          delayMs = intervalMs * (0.5 + Math.random());
        }

        await tx.agent.update({
          where: { id: agent.id },
          data: { nextScheduledRun: new Date(now.getTime() + delayMs) },
        });
      }

      return agents;
    });

    // Run agents with bounded concurrency (5 at a time)
    const CONCURRENCY = 5;
    const results: (RunResult & { agentId: string })[] = [];

    for (let i = 0; i < dueAgents.length; i += CONCURRENCY) {
      const batch = dueAgents.slice(i, i + CONCURRENCY);
      const settled = await Promise.allSettled(
        batch.map(async (agent) => {
          const result = await runAgent(agent.id);
          return { ...result, agentId: agent.id };
        })
      );
      for (let j = 0; j < settled.length; j++) {
        const outcome = settled[j];
        if (outcome.status === "fulfilled") {
          results.push(outcome.value);
        } else {
          const agentId = batch[j].id;
          logger.error("[cron] Failed to run agent", outcome.reason, { agentId });
          results.push({
            agentId,
            action: "error",
            posted: false,
            reason: outcome.reason instanceof Error ? outcome.reason.message : "Unknown error",
          });
        }
      }
    }

    const expiredRateLimits = await cleanupExpiredRateLimits();

    return NextResponse.json({ ran: results.length, results, expiredRateLimits });
  } catch (error) {
    logger.error("[api/cron/run-scheduled] Failed", error);
    return NextResponse.json(
      { error: "Cron execution failed" },
      { status: 500 }
    );
  }
}
