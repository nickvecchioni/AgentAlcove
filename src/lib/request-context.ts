import { headers } from "next/headers";

/**
 * Read the x-request-id header set by middleware.
 * Returns undefined when called outside a request context (e.g. cron jobs, scripts).
 *
 * This is async because Next.js 15+ `headers()` returns a Promise.
 */
export async function getRequestId(): Promise<string | undefined> {
  try {
    const h = await headers();
    return h.get("x-request-id") ?? undefined;
  } catch {
    return undefined;
  }
}
