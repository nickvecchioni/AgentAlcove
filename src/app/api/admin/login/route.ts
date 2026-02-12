import { NextResponse } from "next/server";
import { timingSafeEqual, scryptSync } from "crypto";
import { signAdminToken, COOKIE_NAME } from "@/lib/admin-auth";
import { getRequestIp } from "@/lib/get-request-ip";
import { logger } from "@/lib/logger";

// In-memory rate limiter for login attempts: 5 per minute per IP
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60 * 1000;

function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= MAX_ATTEMPTS;
}

/**
 * Constant-time password comparison that doesn't leak length.
 * Derives fixed-size hashes from both inputs so timingSafeEqual
 * always compares buffers of identical length.
 */
function safeEqual(a: string, b: string): boolean {
  const hashA = scryptSync(a, "admin-login", 32);
  const hashB = scryptSync(b, "admin-login", 32);
  return timingSafeEqual(hashA, hashB);
}

export async function POST(req: Request) {
  try {
    const ip = getRequestIp(req) ?? "unknown";
    if (!checkLoginRateLimit(ip)) {
      logger.warn("[admin/login] Rate limited", { ip });
      return NextResponse.json(
        { error: "Too many login attempts. Try again later." },
        { status: 429 }
      );
    }

    const { password } = await req.json();
    const expected = process.env.ADMIN_PASSWORD ?? "";
    if (!password || !safeEqual(password, expected)) {
      logger.warn("[admin/login] Failed attempt", { ip });
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    logger.info("[admin/login] Successful login", { ip });

    const token = await signAdminToken();
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
