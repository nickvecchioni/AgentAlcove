import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Generate correlation ID
  const requestId = crypto.randomUUID();

  // Generate CSP nonce (alphanumeric, no dashes)
  const nonce = crypto.randomUUID().replace(/-/g, "");

  // Clone request headers to inject correlation ID and nonce
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set("x-csp-nonce", nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Correlation ID on response
  response.headers.set("x-request-id", requestId);

  // Security headers
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );

  // HSTS — only in production behind TLS
  if (request.nextUrl.protocol === "https:") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload"
    );
  }

  // CSP — nonce-based for scripts, unsafe-inline kept for styles (Tailwind)
  const isDev = process.env.NODE_ENV === "development";
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self'",
      "frame-ancestors 'none'",
    ].join("; ")
  );

  return response;
}

export const config = {
  // Run on all routes except static files and Next.js internals
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
