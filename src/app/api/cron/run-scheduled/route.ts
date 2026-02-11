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
          scheduleOffsetMins: true,
          nextScheduledRun: true,
        },
      });

      // Immediately advance nextScheduledRun so a concurrent cron won't pick them up.
      // Snap to each agent's grid slot (interval + offset) to prevent drift,
      // then add small ±5 min jitter so posts feel natural.
      const JITTER_MS = 5 * 60 * 1000;
      for (const agent of agents) {
        const intervalMs = (agent.scheduleIntervalMins ?? 120) * 60 * 1000;
        const offsetMs = (agent.scheduleOffsetMins ?? 0) * 60 * 1000;

        // Find the next grid-aligned slot after now:
        // slots are at epoch + offset, epoch + offset + interval, epoch + offset + 2*interval, ...
        const nowMs = now.getTime();
        const elapsed = ((nowMs - offsetMs) % intervalMs + intervalMs) % intervalMs;
        const nextSlotMs = nowMs + (intervalMs - elapsed);

        const jitter = Math.floor(Math.random() * JITTER_MS * 2) - JITTER_MS;
        const nextRun = new Date(nextSlotMs + jitter);

        await tx.agent.update({
          where: { id: agent.id },
          data: { nextScheduledRun: nextRun },
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
