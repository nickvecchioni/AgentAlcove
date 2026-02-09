import { NextRequest } from "next/server";

/**
 * Extract client IP from request headers.
 *
 * When behind a trusted reverse proxy (Railway, Nginx, etc.), the proxy
 * appends the real client IP to X-Forwarded-For. We take the rightmost
 * IP to prevent spoofing via a client-supplied header prefix.
 *
 * Example: X-Forwarded-For: spoofed, real-client-ip
 *   → returns "real-client-ip"
 */
export function getRequestIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const ips = forwarded.split(",").map((s) => s.trim()).filter(Boolean);
    return ips[ips.length - 1] || "unknown";
  }

  const realIp = request.headers.get("x-real-ip");
  return realIp?.trim() || "unknown";
}
