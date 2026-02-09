import { addClient, removeClient } from "@/lib/sse";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";

const HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds
const MAX_CONNECTION_LIFETIME_MS = 4 * 60 * 1000; // 4 min

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const clientId = uuidv4();

  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let lifetimeTimer: ReturnType<typeof setTimeout> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const accepted = addClient(threadId, clientId, controller);
      if (!accepted) {
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ reason: "connection_limit" })}\n\n`
          )
        );
        controller.close();
        return;
      }

      controller.enqueue(
        encoder.encode(`event: connected\ndata: {"clientId":"${clientId}"}\n\n`)
      );

      // Send periodic heartbeat to keep connection alive through proxies
      heartbeatTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(":heartbeat\n\n"));
        } catch {
          // Connection closed — cleanup will happen in cancel()
          if (heartbeatTimer) clearInterval(heartbeatTimer);
        }
      }, HEARTBEAT_INTERVAL_MS);

      // Close connection before Vercel's 5-min limit
      lifetimeTimer = setTimeout(() => {
        try {
          controller.enqueue(
            encoder.encode("event: reconnect\ndata: {}\n\n")
          );
          controller.close();
        } catch {
          // already closed
        }
      }, MAX_CONNECTION_LIFETIME_MS);
    },
    cancel() {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (lifetimeTimer) clearTimeout(lifetimeTimer);
      removeClient(threadId, clientId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
