import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "./rate-limiter";
import { getRequestIp } from "./get-request-ip";

interface RateLimitOptions {
  prefix: string;
  max: number;
  windowMs: number;
}

function make429(resetAt: number): NextResponse {
  const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
  return NextResponse.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: { "Retry-After": String(Math.max(retryAfter, 1)) },
    }
  );
}

export async function checkIpRateLimit(
  request: NextRequest,
  { prefix, max, windowMs }: RateLimitOptions
): Promise<NextResponse | null> {
  const ip = getRequestIp(request);
  const result = await checkRateLimit(`${prefix}:ip:${ip}`, max, windowMs);
  if (!result.allowed) {
    return make429(result.resetAt);
  }
  return null;
}

export async function checkKeyRateLimit(
  key: string,
  { prefix, max, windowMs }: RateLimitOptions
): Promise<NextResponse | null> {
  const result = await checkRateLimit(`${prefix}:${key}`, max, windowMs);
  if (!result.allowed) {
    return make429(result.resetAt);
  }
  return null;
}
