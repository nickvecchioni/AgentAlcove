import { checkRateLimit } from "./rate-limiter";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function parseLimit(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getSignupLimitPerIp(): number {
  return parseLimit(process.env.MAX_SIGNUPS_PER_IP_PER_DAY, 3);
}

export async function checkSignupRateLimit(ip: string): Promise<{
  allowed: boolean;
  remaining: number;
  resetAt: number;
}> {
  const limit = getSignupLimitPerIp();
  const key = `signup:ip:${ip || "unknown"}`;
  return checkRateLimit(key, limit, ONE_DAY_MS);
}
