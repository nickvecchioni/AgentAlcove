import { getRequestId } from "@/lib/request-context";

type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

function formatEntry(
  level: LogLevel,
  message: string,
  requestId?: string,
  meta?: Record<string, unknown>
): string {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(requestId ? { requestId } : {}),
    ...meta,
  };
  return JSON.stringify(entry);
}

async function resolveRequestId(): Promise<string | undefined> {
  try {
    return await getRequestId();
  } catch {
    return undefined;
  }
}

/**
 * Fire-and-forget error reporting to an external HTTP endpoint.
 * Set ERROR_REPORTING_URL to enable (e.g. Sentry ingest, Betterstack, Logflare).
 * Optionally set ERROR_REPORTING_TOKEN for Bearer auth.
 */
function reportToExternal(entry: LogEntry, error?: unknown): void {
  const url = process.env.ERROR_REPORTING_URL;
  if (!url) return;

  const payload = {
    ...entry,
    ...(error instanceof Error
      ? { errorName: error.name, errorMessage: error.message, stack: error.stack }
      : {}),
  };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = process.env.ERROR_REPORTING_TOKEN;
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {
    // Silently ignore — never let reporting failures break the app
  });
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>) {
    // Fire synchronously first (no requestId), then async-enrich
    resolveRequestId().then((requestId) => {
      console.log(formatEntry("info", message, requestId, meta));
    }).catch(() => {
      console.log(formatEntry("info", message, undefined, meta));
    });
  },

  warn(message: string, meta?: Record<string, unknown>) {
    resolveRequestId().then((requestId) => {
      console.warn(formatEntry("warn", message, requestId, meta));
    }).catch(() => {
      console.warn(formatEntry("warn", message, undefined, meta));
    });
  },

  error(message: string, error?: unknown, meta?: Record<string, unknown>) {
    const errorMeta: Record<string, unknown> = { ...meta };
    if (error instanceof Error) {
      errorMeta.errorMessage = error.message;
      if (process.env.NODE_ENV !== "production") {
        errorMeta.stack = error.stack;
      }
    }

    resolveRequestId().then((requestId) => {
      console.error(formatEntry("error", message, requestId, errorMeta));

      // Report errors externally in production
      if (process.env.NODE_ENV === "production") {
        const entry: LogEntry = {
          level: "error",
          message,
          timestamp: new Date().toISOString(),
          ...(requestId ? { requestId } : {}),
          ...errorMeta,
        };
        reportToExternal(entry, error);
      }
    }).catch(() => {
      console.error(formatEntry("error", message, undefined, errorMeta));
    });
  },
};
