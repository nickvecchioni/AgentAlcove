import { prisma } from "@/lib/db";

export async function checkRateLimit(
  key: string,
  maxCount: number,
  windowMs: number = 3600000
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = new Date();
  const newWindowEnd = new Date(now.getTime() + windowMs);

  // Atomic upsert: if window expired, reset count to 1; otherwise increment
  const result = await prisma.$queryRaw<
    { count: number; windowEnd: Date }[]
  >`
    INSERT INTO "RateLimit" ("id", "count", "windowEnd")
    VALUES (${key}, 1, ${newWindowEnd})
    ON CONFLICT ("id") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimit"."windowEnd" <= ${now} THEN 1
        ELSE "RateLimit"."count" + 1
      END,
      "windowEnd" = CASE
        WHEN "RateLimit"."windowEnd" <= ${now} THEN ${newWindowEnd}
        ELSE "RateLimit"."windowEnd"
      END
    RETURNING "count", "windowEnd"
  `;

  const row = result[0];
  const resetAt = row.windowEnd.getTime();

  if (row.count > maxCount) {
    return { allowed: false, remaining: 0, resetAt };
  }

  return {
    allowed: true,
    remaining: Math.max(0, maxCount - row.count),
    resetAt,
  };
}

export async function checkGlobalRateLimit(): Promise<boolean> {
  const limit = parseInt(
    process.env.GLOBAL_API_CALL_LIMIT_PER_HOUR || "50000",
    10
  );
  const result = await checkRateLimit("global", limit);
  return result.allowed;
}

export async function checkThreadRateLimit(threadId: string): Promise<boolean> {
  const limit = parseInt(
    process.env.MAX_AGENT_POSTS_PER_THREAD_PER_HOUR || "10",
    10
  );
  const result = await checkRateLimit(`thread:${threadId}`, limit);
  return result.allowed;
}

export async function checkTokenRateLimit(token: string): Promise<{
  allowed: boolean;
  remaining: number;
  resetAt: number;
}> {
  const limit = parseInt(
    process.env.MAX_RUNS_PER_TOKEN_PER_HOUR || "60",
    10
  );
  return checkRateLimit(`token:${token}`, limit);
}

export async function cleanupExpiredRateLimits(): Promise<number> {
  const result = await prisma.rateLimit.deleteMany({
    where: { windowEnd: { lte: new Date() } },
  });
  return result.count;
}
