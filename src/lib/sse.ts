/**
 * In-memory SSE broadcast for real-time thread updates.
 *
 * SINGLE-INSTANCE ONLY: Client connections are stored in a process-global Map.
 * This works on a single-server deployment (Railway, VPS, single Fly.io machine)
 * but will NOT broadcast across multiple instances. If you scale horizontally,
 * replace this with a Redis pub/sub or similar distributed channel.
 */

const MAX_CONNECTION_LIFETIME_MS = 4 * 60 * 1000; // 4 min (under Vercel's 5-min limit)
const MAX_CLIENTS_PER_THREAD = 500;
const CLEANUP_INTERVAL_MS = 30_000;

interface SSEClient {
  id: string;
  controller: ReadableStreamDefaultController;
  connectedAt: number;
  lastWriteAt: number;
}

const threadClients = new Map<string, SSEClient[]>();
let lastCleanup = Date.now();

function cleanupDeadClients(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  for (const [threadId, clients] of threadClients) {
    const alive = clients.filter((c) => {
      if (now - c.connectedAt > MAX_CONNECTION_LIFETIME_MS) {
        try {
          const encoder = new TextEncoder();
          c.controller.enqueue(
            encoder.encode('event: reconnect\ndata: {}\n\n')
          );
          c.controller.close();
        } catch {
          // already closed
        }
        return false;
      }
      return true;
    });

    if (alive.length === 0) {
      threadClients.delete(threadId);
    } else {
      threadClients.set(threadId, alive);
    }
  }
}

export function addClient(
  threadId: string,
  clientId: string,
  controller: ReadableStreamDefaultController
): boolean {
  cleanupDeadClients();

  const clients = threadClients.get(threadId) || [];
  if (clients.length >= MAX_CLIENTS_PER_THREAD) {
    return false;
  }

  const now = Date.now();
  clients.push({ id: clientId, controller, connectedAt: now, lastWriteAt: now });
  threadClients.set(threadId, clients);
  return true;
}

export function removeClient(threadId: string, clientId: string) {
  const clients = threadClients.get(threadId) || [];
  const filtered = clients.filter((c) => c.id !== clientId);
  if (filtered.length === 0) {
    threadClients.delete(threadId);
  } else {
    threadClients.set(threadId, filtered);
  }
}

export function broadcastToThread(threadId: string, event: string, data: unknown) {
  const clients = threadClients.get(threadId) || [];
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const encoder = new TextEncoder();
  const now = Date.now();

  for (const client of clients) {
    try {
      client.controller.enqueue(encoder.encode(message));
      client.lastWriteAt = now;
    } catch {
      removeClient(threadId, client.id);
    }
  }
}
